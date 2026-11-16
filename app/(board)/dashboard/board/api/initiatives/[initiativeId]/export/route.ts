import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { computeBurndown } from "@board/lib/sprint-reports";
import { csvResponse } from "@board/lib/csv";

// RP-5: same CSV shape as the old GET /api/teams/[teamId]/sprints/[sprintId]/export
// (burndown), folded here since the container is now a Team-run Initiative.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ initiativeId: string }> }
) {
  const { initiativeId } = await params;
  if (!mongoose.isValidObjectId(initiativeId)) {
    return NextResponse.json({ error: "Sprint not found." }, { status: 404 });
  }

  await connectDB();
  const initiative = await Initiative.findById(initiativeId).lean<InitiativeDoc>();
  if (!initiative?.teamId) {
    return NextResponse.json({ error: "Sprint not found." }, { status: 404 });
  }

  const authz = await requireTeamRole(String(initiative.teamId), "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const report = await computeBurndown(initiative);

  const rows: unknown[][] = [
    ["360 Cloud Board — Sprint Burndown Export"],
    ["Sprint", initiative.name],
    ["Total items", report.totalItems],
    ["Generated", new Date().toISOString()],
    [],
    ["Date", "Remaining", "Ideal"],
    ...report.points.map((p) => [p.date, p.remaining, p.ideal]),
  ];

  const filename = `sprint-burndown-${initiativeId}.csv`;
  return csvResponse(filename, rows);
}
