import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { del } from "@vercel/blob";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { recordAttachmentChange } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Attachment } from "@board/models/Attachment";

type AttachmentVersionRow = {
  _id: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  filename: string;
  blobPathname: string;
};

// Team Member+ only (excludes Guest and plain Viewer automatically, since
// neither passes requireTeamRole("member")) — matches "Viewer or Guest can
// download but not delete" literally. Deletes the whole attachment group
// (every version), not a single version: re-upload supersedes a version,
// but the spec only describes deleting "an attachment," not resurrecting an
// older one after its group is gone.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; attachmentId: string }> }
) {
  const { teamId, itemId, attachmentId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  if (!mongoose.isValidObjectId(attachmentId)) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  await connectDB();
  const target = await Attachment.findOne({
    _id: attachmentId,
    workItemId: itemId,
    deletedAt: null,
  }).lean<AttachmentVersionRow>();
  if (!target) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const versions = await Attachment.find({ groupId: target.groupId, deletedAt: null }).lean<
    AttachmentVersionRow[]
  >();

  await Attachment.updateMany({ groupId: target.groupId }, { deletedAt: new Date() });
  await Promise.all(
    versions.map((v) => del(v.blobPathname).catch(() => undefined))
  );

  await recordAttachmentChange({
    workItemId: itemId,
    teamId,
    memberId: authz.member._id,
    action: "removed",
    attachmentId: target._id,
    attachmentFilename: target.filename,
  });

  return NextResponse.json({ ok: true });
}
