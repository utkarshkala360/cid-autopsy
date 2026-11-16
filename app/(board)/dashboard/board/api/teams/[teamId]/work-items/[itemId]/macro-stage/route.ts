import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@board/lib/authz";
import { recordFieldChanges } from "@board/lib/work-item-history";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { getStageTrack } from "@board/lib/stage-tracks";

const patchSchema = z.object({
  macroStage: z.string().trim().min(1).max(40).nullable(),
});

// Design 1 (Phase 16): same "editable only by Org Admin" floor CJ-1/PL-1
// already set — stricter than the general Work Item PATCH route
// (requireTeamRole(teamId, "member")), so this is its own route. Logged
// through the same recordFieldChanges() every other Work Item field change
// uses (this row already has a real workItemId/teamId, unlike the Team-only
// macroStage row — see recordTeamStageChange).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { teamId, itemId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid stage." },
      { status: 400 }
    );
  }

  const track = await getStageTrack(authz.member.organizationId, "work_item");
  if (!track?.enabled) {
    return NextResponse.json(
      { error: "The Work Item Stage Track is not enabled for this Organization." },
      { status: 400 }
    );
  }
  if (parsed.data.macroStage !== null && !track.stages.some((s) => s.key === parsed.data.macroStage)) {
    return NextResponse.json({ error: "Not a valid stage for this Stage Track." }, { status: 400 });
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Work Item not found." }, { status: 404 });
  }

  const oldValue = item.macroStage ?? null;
  const newValue = parsed.data.macroStage;
  if (oldValue !== newValue) {
    item.macroStage = newValue;
    await item.save();
    await recordFieldChanges({
      workItemId: item._id,
      teamId,
      memberId: authz.member._id,
      diffs: [{ field: "macroStage", oldValue, newValue }],
    });
  }

  return NextResponse.json({ workItem: item });
}
