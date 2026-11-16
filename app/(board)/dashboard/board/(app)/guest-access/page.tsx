import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, KeyRound, Target } from "lucide-react";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { GuestGrant, type GuestGrantDoc } from "@board/models/GuestGrant";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { Team, type TeamDoc } from "@board/models/Team";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta, StatusPill } from "@board/components/work-items/status-pill";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

// MB-3: this is the only entry point a pure Guest has — everywhere else in
// the app that lists Work Items by Team stays behind requireTeamRole and
// blocks them entirely (Non-Negotiable #9). This page resolves exactly what
// was shared with them: direct Work Item grants, plus every Work Item
// tagged to an Initiative they were granted.
export default async function GuestAccessPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  await connectDB();
  const grants = await GuestGrant.find({ memberId: member._id })
    .sort({ createdAt: -1 })
    .lean<GuestGrantDoc[]>();

  const workItemGrantIds = grants.filter((g) => g.scope === "work_item" && g.workItemId).map((g) => g.workItemId);
  const initiativeGrants = grants.filter((g) => g.scope === "initiative" && g.initiativeId);
  const initiativeIds = initiativeGrants.map((g) => g.initiativeId);

  const [directItems, initiativeItems, initiatives] = await Promise.all([
    workItemGrantIds.length
      ? WorkItem.find({ _id: { $in: workItemGrantIds } }).lean<WorkItemDoc[]>()
      : Promise.resolve([]),
    initiativeIds.length
      ? WorkItem.find({ initiativeId: { $in: initiativeIds } }).lean<WorkItemDoc[]>()
      : Promise.resolve([]),
    initiativeIds.length
      ? Initiative.find({ _id: { $in: initiativeIds } }).lean<InitiativeDoc[]>()
      : Promise.resolve([]),
  ]);

  const allItems = [...directItems, ...initiativeItems];
  const teamIds = [...new Set(allItems.map((i) => String(i.teamId)))];
  const teams = teamIds.length
    ? await Team.find({ _id: { $in: teamIds } }, "name displayLabel primaryWorkItemType").lean<TeamDoc[]>()
    : [];
  const teamById = new Map(teams.map((t) => [String(t._id), t]));
  const templates = await getWorkItemTemplateDefs(member.organizationId);

  const combos = new Map<string, { teamId: string; type: string }>();
  for (const item of allItems) combos.set(`${item.teamId}|${item.type}`, { teamId: String(item.teamId), type: item.type });
  const workflowByCombo = new Map(
    await Promise.all(
      [...combos.entries()].map(
        async ([key, c]) => [key, await getEffectiveWorkflow(c.teamId, c.type)] as const
      )
    )
  );

  function toRow(item: WorkItemDoc) {
    const team = teamById.get(String(item.teamId));
    const workflow = workflowByCombo.get(`${item.teamId}|${item.type}`);
    const statusMeta = workflow ? resolveStatusMeta(workflow.statuses, item.status) : null;
    return {
      id: String(item._id),
      teamId: String(item.teamId),
      title: item.title,
      teamName: team?.name ?? "Unknown Team",
      typeLabel: team ? labelForTeam(team, templates) : "Work Item",
      statusLabel: statusMeta?.label ?? item.status,
      statusCategory: statusMeta?.category ?? ("todo" as const),
    };
  }

  const directRows = directItems.map(toRow);
  const initiativeById = new Map(initiatives.map((i) => [String(i._id), i.name as string]));
  const initiativeGroups = initiativeGrants.map((g) => ({
    id: String(g.initiativeId),
    name: initiativeById.get(String(g.initiativeId)) ?? "Unknown Initiative",
    items: initiativeItems.filter((i) => String(i.initiativeId) === String(g.initiativeId)).map(toRow),
  }));

  const hasAnything = directRows.length > 0 || initiativeGroups.length > 0;

  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">My Guest Access</h1>
          <p className="mt-1 text-xs text-slate">
            Everything shared with you directly — no Team membership required, and nothing else on
            these Teams is visible (MB-3/MB-4).
          </p>
        </div>

        {!hasAnything ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate mb-4">
              <KeyRound className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">Nothing shared with you yet</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              When a Team Admin or Member grants you Guest access to a specific Work Item or
              Initiative, it will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {directRows.length > 0 && (
              <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate">
                  Shared Work Items
                </div>
                <ul className="divide-y divide-border">
                  {directRows.map((row) => (
                    <GuestItemRow key={row.id} row={row} />
                  ))}
                </ul>
              </div>
            )}

            {initiativeGroups.map((group) => (
              <div key={group.id} className="rounded-lg border border-border bg-panel p-5 shadow-xs">
                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
                  <Target className="h-3.5 w-3.5" />
                  Initiative: {group.name}
                </div>
                {group.items.length === 0 ? (
                  <p className="text-xs text-slate">No Work Items tagged with this Initiative yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {group.items.map((row) => (
                      <GuestItemRow key={row.id} row={row} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
  );
}

function GuestItemRow({
  row,
}: {
  row: {
    id: string;
    teamId: string;
    title: string;
    teamName: string;
    typeLabel: string;
    statusLabel: string;
    statusCategory: "todo" | "in_progress" | "done" | "blocked";
  };
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <Link
          href={`/dashboard/board/teams/${row.teamId}/work-items/${row.id}`}
          className="flex items-center gap-1 truncate text-sm font-medium text-ink hover:text-primary"
        >
          {row.title}
          <ArrowUpRight className="h-3 w-3 shrink-0" />
        </Link>
        <span className="text-[11px] text-slate">
          {row.teamName} · {row.typeLabel}
        </span>
      </div>
      <StatusPill label={row.statusLabel} category={row.statusCategory} />
    </li>
  );
}
