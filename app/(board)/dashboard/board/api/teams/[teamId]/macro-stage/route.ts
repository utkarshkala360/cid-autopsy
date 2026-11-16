import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { recordTeamStageChange } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { getStageTrack } from "@board/lib/stage-tracks";

const patchSchema = z.object({
  macroStage: z.string().trim().min(1).max(40).nullable(),
});

// Design 1 (Phase 16): same "editable only by Org Admin" floor CJ-1/PL-1
// already set for Customer.journeyStage/Initiative.lifecycleStage — a
// stricter gate than Team's other config fields (Team Admin via
// requireTeamRole), so this is its own route rather than folded into the
// existing PATCH /api/teams/[teamId].
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { teamId } = await params;
  if (!mongoose.isValidObjectId(teamId)) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid stage." },
      { status: 400 }
    );
  }

  await connectDB();
  const track = await getStageTrack(authz.member.organizationId, "team");
  if (!track?.enabled) {
    return NextResponse.json(
      { error: "The Team Stage Track is not enabled for this Organization." },
      { status: 400 }
    );
  }
  if (parsed.data.macroStage !== null && !track.stages.some((s) => s.key === parsed.data.macroStage)) {
    return NextResponse.json({ error: "Not a valid stage for this Stage Track." }, { status: 400 });
  }

  const team = await Team.findOne({
    _id: teamId,
    organizationId: authz.member.organizationId,
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const oldValue = team.macroStage ?? null;
  const newValue = parsed.data.macroStage;
  if (oldValue !== newValue) {
    team.macroStage = newValue;
    await team.save();
    await recordTeamStageChange({
      teamId: team._id,
      memberId: authz.member._id,
      oldValue,
      newValue,
    });
  }

  return NextResponse.json({ team });
}
