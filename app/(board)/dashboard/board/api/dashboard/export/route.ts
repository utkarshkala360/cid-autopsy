import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";
import { computeDashboard } from "@board/lib/dashboard";
import { computeCycleTime } from "@board/lib/cycle-time";
import { csvResponse } from "@board/lib/csv";
import { PRIORITY_LABEL, type Priority } from "@board/lib/status-categories";
import { labelForType, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";

// RP-5: CSV export of the same report the Org/Team dashboard page renders
// (src/app/(app)/dashboard/page.tsx) — same scope resolution (Org Admin
// defaults to every accessible Team, a Member is limited to Teams they
// actually have a role on), so this can never export data the requester
// couldn't already see on the page itself (Non-Negotiable #4/#9).
export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const accessible = await listMemberTeamsWithRoles(member);
  const accessibleTeams = accessible.map((a) => ({ id: String(a.team._id), name: a.team.name }));
  const accessibleIds = new Set(accessibleTeams.map((t) => t.id));

  const teamParam = request.nextUrl.searchParams.get("team");
  const selectedTeamParam =
    teamParam && (teamParam === "all" || accessibleIds.has(teamParam)) ? teamParam : "all";
  const teamIds =
    selectedTeamParam === "all" ? accessibleTeams.map((t) => t.id) : [selectedTeamParam];

  await connectDB();
  const initiativeParam = request.nextUrl.searchParams.get("initiative");
  let initiativeId: string | null = null;
  let initiativeName = "All Initiatives";
  if (initiativeParam && initiativeParam !== "all") {
    const initiative = await Initiative.findOne(
      { _id: initiativeParam, organizationId: member.organizationId },
      "name"
    ).lean<{ name: string }>();
    if (initiative) {
      initiativeId = initiativeParam;
      initiativeName = initiative.name;
    }
  }

  const [data, cycleTime, templates] = await Promise.all([
    computeDashboard({ organizationId: member.organizationId, teamIds, initiativeId }),
    computeCycleTime({ teamIds, initiativeId }),
    getWorkItemTemplateDefs(member.organizationId),
  ]);

  const teamLabel =
    selectedTeamParam === "all"
      ? "All Teams"
      : (accessibleTeams.find((t) => t.id === selectedTeamParam)?.name ?? "Team");

  const rows: unknown[][] = [
    ["360 Cloud Board — Dashboard Export"],
    ["Scope", teamLabel],
    ["Initiative", initiativeName],
    ["Generated", new Date().toISOString()],
    [],
    ["Summary"],
    ["Open", "Closed", "Overdue", "Total"],
    [data.open, data.closed, data.overdue, data.total],
    [],
    ["By Priority"],
    ["Priority", "Count"],
    ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => [PRIORITY_LABEL[p], data.byPriority[p]]),
    [],
    ["By Team"],
    ["Team", "Open", "Closed", "Overdue", "Total"],
    ...data.perTeam.map((t) => [t.teamName, t.open, t.closed, t.overdue, t.total]),
    [],
    ["By Assignee"],
    ["Assignee", "Open", "Closed", "Total"],
    ...data.byAssignee.map((a) => [a.assigneeName, a.open, a.closed, a.total]),
    [],
    ["Cycle & Lead Time"],
    ["Type", "Done Items", "Avg Lead Time (hours)", "Avg Cycle Time (hours)"],
    ...cycleTime.map((c) => [labelForType(c.type, templates), c.count, c.avgLeadTimeHours, c.avgCycleTimeHours]),
  ];

  const filename = `dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  return csvResponse(filename, rows);
}
