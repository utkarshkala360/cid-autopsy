import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { put } from "@vercel/blob";
import { requireTeamRole } from "@board/lib/authz";
import { requireWorkItemAccess } from "@board/lib/guest-access";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { recordAttachmentChange } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Attachment } from "@board/models/Attachment";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — stays under Vercel's default serverless request-body ceiling.

// IT-9: Viewer/Guest can download but not delete — GET goes through the
// same requireWorkItemAccess() every other Guest-reachable route uses
// (item GET, history GET, comments POST), so a Guest with a grant on this
// exact item sees its attachments; POST/DELETE below use requireTeamRole()
// directly instead, which alone excludes Guest (not a TeamRole) and plain
// Viewer (rank too low) — no separate "can download but not delete" helper
// needed, the existing two enforcement points already say it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireWorkItemAccess(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const groupId = request.nextUrl.searchParams.get("groupId");

  await connectDB();
  // A version-history lookup for one attachment group ("N earlier
  // versions") — still Work-Item-scoped, still open to a Guest/Viewer with
  // read access, just not filtered to isLatest.
  if (groupId && mongoose.isValidObjectId(groupId)) {
    const versions = await Attachment.find({ workItemId: itemId, groupId, deletedAt: null })
      .sort({ version: -1 })
      .lean();
    return NextResponse.json({ attachments: versions });
  }

  const attachments = await Attachment.find({
    workItemId: itemId,
    isLatest: true,
    deletedAt: null,
  })
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ attachments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File is larger than the 10 MB limit." }, { status: 400 });
  }

  const replacesAttachmentId = formData?.get("replacesAttachmentId");

  await connectDB();

  let groupId: mongoose.Types.ObjectId;
  let version = 1;
  if (typeof replacesAttachmentId === "string" && mongoose.isValidObjectId(replacesAttachmentId)) {
    const previous = await Attachment.findOne({ _id: replacesAttachmentId, workItemId: itemId });
    if (!previous) {
      return NextResponse.json({ error: "Attachment to replace not found." }, { status: 404 });
    }
    groupId = previous.groupId;
    version = previous.version + 1;
    await Attachment.updateMany({ groupId }, { isLatest: false });
  } else {
    groupId = new mongoose.Types.ObjectId();
  }

  const blob = await put(`work-items/${itemId}/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  const attachment = await Attachment.create({
    _id: version === 1 ? groupId : undefined,
    organizationId: authz.member.organizationId,
    teamId,
    workItemId: itemId,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    uploadedBy: authz.member._id,
    groupId,
    version,
    isLatest: true,
    deletedAt: null,
  });

  await recordAttachmentChange({
    workItemId: itemId,
    teamId,
    memberId: authz.member._id,
    action: "added",
    attachmentId: attachment._id,
    attachmentFilename: attachment.filename,
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
