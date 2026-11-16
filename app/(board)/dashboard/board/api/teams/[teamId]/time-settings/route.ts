import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { WorkLog, WORK_LOG_UNITS } from "@board/models/WorkLog";

const patchSchema = z.object({ timeTrackingUnit: z.enum(WORK_LOG_UNITS).nullable() });

// WL-1: per-Team unit choice for time tracking. Team Admin-editable (or Org
// Admin, inherited) — same tier/shape as sprint-settings. Locked once the
// Team has any WorkLog rows (409 + live count) so a unit change can never
// make a Team's own historical Actuals unsummable (points and minutes can't
// be added together) — same referential-integrity convention Workflow's
// transition-removal check and StageTrack's stage-removal check already use.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectDB();
  const team = await Team.findById(teamId);
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (parsed.data.timeTrackingUnit !== team.timeTrackingUnit) {
    const existingCount = await WorkLog.countDocuments({ teamId });
    if (existingCount > 0) {
      return NextResponse.json(
        {
          error: `Can't change the time-tracking unit — ${existingCount} logged ${
            existingCount === 1 ? "entry" : "entries"
          } already use the current unit.`,
        },
        { status: 409 }
      );
    }
  }

  team.timeTrackingUnit = parsed.data.timeTrackingUnit;
  await team.save();

  return NextResponse.json({ team });
}
