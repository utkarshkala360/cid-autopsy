import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";

const patchSchema = z.object({ sprintsEnabled: z.boolean() });

// BD-3: opt-in per Team, off by default. Team Admin-editable (or Org Admin,
// inherited) — same tier as workflow/fields/display-label configuration,
// all on the one Team Admin config screen (/settings/teams/[teamId]/work-item-config).
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

  team.sprintsEnabled = parsed.data.sprintsEnabled;
  await team.save();

  return NextResponse.json({ team });
}
