import { NextRequest, NextResponse } from "next/server";
import { requireTeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { recordFieldChanges } from "@board/lib/work-item-history";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string; memberId: string }> }
) {
  const { teamId, itemId, memberId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  const before = (item.collaborators ?? []).map(String);
  if (!before.includes(memberId)) {
    return NextResponse.json({ error: "Not a Collaborator." }, { status: 404 });
  }

  const after = before.filter((id: string) => id !== memberId);
  item.collaborators = after;
  await item.save();

  await recordFieldChanges({
    workItemId: item._id,
    teamId,
    memberId: authz.member._id,
    diffs: [{ field: "collaborators", oldValue: before, newValue: after }],
  });

  return NextResponse.json({ ok: true });
}
