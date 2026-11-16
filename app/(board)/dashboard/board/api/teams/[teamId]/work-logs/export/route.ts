import { NextRequest, NextResponse } from "next/server";
import { requireTeamRole } from "@board/lib/authz";
import { getWorkLogsForTeamRange } from "@board/lib/work-log-reports";
import { csvResponse } from "@board/lib/csv";
import { Team } from "@board/models/Team";
import { connectDB } from "@board/lib/mongodb";

// RP-5-style export, same convention as the Sprint burndown/velocity export
// routes — read floor (Viewer+), plain server-generated CSV.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  const team = await Team.findById(teamId, "name").lean<{ name: string }>();
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const rows = await getWorkLogsForTeamRange(teamId, {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  });

  const csvRows: unknown[][] = [
    ["Date", "Work Item", "Title", "Logged by", "Amount", "Unit", "Note"],
    ...rows.map((r) => [
      r.date.toISOString().slice(0, 10),
      r.workItemKey,
      r.workItemTitle,
      r.memberName,
      r.amount,
      r.unit,
      r.note,
    ]),
  ];

  const safeTeamName = team.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return csvResponse(`${safeTeamName}-work-logs.csv`, csvRows);
}
