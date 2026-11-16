import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { WorkItemLink } from "@board/models/WorkItemLink";

// Team Member and above on either side of the link may remove it — gated
// through the path's Team (matches the create floor above). Removing a
// link is not a ChangeHistory-audited action (like Customer contacts,
// links aren't a WorkItem field diff); it's its own append-only-adjacent
// record that's simply deleted, not a business field on the item.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; linkId: string }> }
) {
  const { teamId, itemId, linkId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  if (!mongoose.isValidObjectId(linkId)) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  await connectDB();
  const link = await WorkItemLink.findOne({
    _id: linkId,
    $or: [{ fromWorkItemId: itemId }, { toWorkItemId: itemId }],
  });
  if (!link) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  await link.deleteOne();
  return NextResponse.json({ ok: true });
}
