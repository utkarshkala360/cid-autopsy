import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Team-scoped search (§7.1): results are limited to Teams the current
// Member actually has a role on — the exact same visibility rule
// requireTeamRole enforces everywhere else (Non-Negotiable #4/#9), just
// applied across every accessible Team at once instead of one at a time. A
// Guest with only item-level grants (no Team role) gets no results here —
// their dedicated "My Guest Access" list already covers that case.
export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const accessible = await listMemberTeamsWithRoles(member);
  if (accessible.length === 0) {
    return NextResponse.json({ results: [] });
  }
  const teamById = new Map(accessible.map((a) => [String(a.team._id), a.team]));
  const teamIds = accessible.map((a) => a.team._id);

  await connectDB();
  const escaped = escapeRegex(q);
  const items = await WorkItem.find(
    {
      teamId: { $in: teamIds },
      $or: [
        { title: { $regex: escaped, $options: "i" } },
        { key: { $regex: `^${escaped}`, $options: "i" } },
      ],
    },
    "key title teamId"
  )
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean<Pick<WorkItemDoc, "_id" | "key" | "title" | "teamId">[]>();

  const templates = await getWorkItemTemplateDefs(member.organizationId);

  return NextResponse.json({
    results: items.map((i) => {
      const team = teamById.get(String(i.teamId));
      return {
        id: String(i._id),
        key: i.key,
        title: i.title,
        teamId: String(i.teamId),
        teamName: team?.name ?? "",
        typeLabel: team ? labelForTeam(team, templates) : "Item",
      };
    }),
  });
}
