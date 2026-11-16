import { NextRequest, NextResponse } from "next/server";
import { requireTeamRole } from "@board/lib/authz";
import { computeVelocity } from "@board/lib/sprint-reports";
import { csvResponse } from "@board/lib/csv";

// RP-5: same CSV shape as the old GET /api/teams/[teamId]/sprints/velocity-export
// — velocity is per-Team, not per-Initiative, so this takes `?teamId=`
// rather than living under [initiativeId] like the burndown export does.
export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const points = await computeVelocity(teamId);

  const rows: unknown[][] = [
    ["360 Cloud Board — Velocity Export"],
    ["Generated", new Date().toISOString()],
    [],
    ["Sprint", "Completed", "Count"],
    ...points.map((p) => [p.sprintName, p.completedAt, p.count]),
  ];

  const filename = `velocity-${teamId}.csv`;
  return csvResponse(filename, rows);
}
