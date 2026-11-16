import { redirect } from "next/navigation";
import { Layers, Download } from "lucide-react";
import { DashboardFilters } from "@board/components/dashboard/dashboard-filters";
import { DashboardViewToolbar, type DashboardViewOption } from "@board/components/dashboard/dashboard-view-toolbar";
import { WidgetGrid, type WidgetGridScope } from "@board/components/dashboard/widget-grid";
import { getCurrentMember } from "@board/lib/get-current-member";
import { listMemberTeamsWithRoles } from "@board/lib/teams";
import { fetchScopedWorkItems, computeDashboardFromItems } from "@board/lib/dashboard";
import { computeCycleTime } from "@board/lib/cycle-time";
import { getOrgMentionCandidates } from "@board/lib/work-items";
import { decodeDashboardViewConfig } from "@board/lib/dashboard-views";
import { defaultWidgetInstances } from "@board/lib/dashboard-widgets";
import type { BreakdownLabelContext } from "@board/lib/dashboard-breakdown";
import { connectDB } from "@board/lib/mongodb";
import { Initiative } from "@board/models/Initiative";
import { Customer } from "@board/models/Customer";
import { WorkItem } from "@board/models/WorkItem";
import { DashboardView } from "@board/models/DashboardView";
import { getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

// DB-1/DB-2: the Org-wide dashboard. Org Admins see every Team they have
// (which, via MB-2 inheritance, is every Team in the Org) by default; a
// Team Member sees their own Team by default and can only ever switch
// between Teams they actually have a role on — never a Team-boundary leak,
// same rule requireTeamRole enforces everywhere else (Non-Negotiable #4/#9).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; initiative?: string; dv?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const { team: teamParam, initiative: initiativeParam, dv: dvParam } = await searchParams;

  const accessible = await listMemberTeamsWithRoles(member);
  const accessibleTeams = accessible.map((a) => ({ id: String(a.team._id), name: a.team.name }));
  const accessibleIds = new Set(accessibleTeams.map((t) => t.id));
  const defaultWidgets = defaultWidgetInstances();
  const activeWidgets = decodeDashboardViewConfig(dvParam).widgets;

  const isOrgAdmin = member.orgRole === "org_admin";
  const defaultTeamParam = isOrgAdmin ? "all" : accessibleTeams[0]?.id ?? "all";
  const selectedTeamParam =
    teamParam && (teamParam === "all" || accessibleIds.has(teamParam)) ? teamParam : defaultTeamParam;

  const teamIds =
    selectedTeamParam === "all" ? accessibleTeams.map((t) => t.id) : [selectedTeamParam];

  await connectDB();
  // Phase 16 (Design 2): the dashboard's Initiative filter is the ORG-5
  // cross-team tag only — a Team-run Initiative (teamId set) isn't a
  // meaningful org-wide filter dimension here.
  const initiatives = await Initiative.find({ organizationId: member.organizationId, teamId: null }, "name")
    .sort({ name: 1 })
    .lean();
  const initiativeIds = new Set(initiatives.map((i) => String(i._id)));
  const selectedInitiativeParam =
    initiativeParam && (initiativeParam === "all" || initiativeIds.has(initiativeParam))
      ? initiativeParam
      : "all";

  if (accessibleTeams.length === 0) {
    return (
              <div className="space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
              Org Dashboard
            </h1>
          </div>
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <Layers className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">No Team access yet</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              You&apos;re not a Member of any Team yet, so there&apos;s nothing to aggregate. Ask an
              Org Admin or Team Admin to add you to a Team.
            </p>
          </div>
        </div>
    );
  }

  const initiativeIdParam = selectedInitiativeParam === "all" ? null : selectedInitiativeParam;

  // One shared fetch of every Work Item in the page's Team/Initiative scope
  // — every `summary`/`breakdown` widget on the page (however many, however
  // differently filtered) computes from this same array in memory rather
  // than each issuing its own Mongo query (src/lib/dashboard.ts /
  // src/lib/dashboard-breakdown.ts).
  const [{ items, assigneeNameById, customerNameById }, dashboardViewDocs, allCustomers, labelValues] =
    await Promise.all([
      fetchScopedWorkItems({
        organizationId: member.organizationId,
        teamIds,
        initiativeId: initiativeIdParam,
      }),
      DashboardView.find({
        organizationId: member.organizationId,
        teamId: null,
        $or: [{ visibility: "shared" }, { visibility: "self", createdBy: member._id }],
      })
        .sort({ name: 1 })
        .lean(),
      Customer.find({ organizationId: member.organizationId }, "name").sort({ name: 1 }).lean(),
      WorkItem.distinct("labels", { organizationId: member.organizationId, teamId: { $in: teamIds } }) as Promise<
        string[]
      >,
    ]);

  const data = computeDashboardFromItems(
    items,
    teamIds,
    new Map(accessibleTeams.map((t) => [t.id, t.name])),
    assigneeNameById
  );
  const cycleTime = await computeCycleTime({ teamIds, initiativeId: initiativeIdParam });
  const templates = await getWorkItemTemplateDefs(member.organizationId);

  const initialViews: DashboardViewOption[] = dashboardViewDocs.map((v) => ({
    id: String(v._id),
    name: v.name,
    visibility: v.visibility as "self" | "shared",
    config: v.config,
    mine: String(v.createdBy) === String(member._id),
  }));

  const teamNameById = new Map(accessibleTeams.map((t) => [t.id, t.name]));
  const initiativeNameById = new Map(initiatives.map((i) => [String(i._id), i.name as string]));
  const labelCtx: BreakdownLabelContext = {
    teamNameById,
    assigneeNameById,
    customerNameById,
    initiativeNameById,
  };

  const orgMembers = await getOrgMentionCandidates(String(member.organizationId));
  const fieldOptions = {
    assignee: orgMembers.map((m) => ({ value: m.id, label: m.name })),
    customerId: allCustomers.map((c) => ({ value: String(c._id), label: c.name as string })),
    initiativeId: initiatives.map((i) => ({ value: String(i._id), label: i.name as string })),
    teamId: accessibleTeams.map((t) => ({ value: t.id, label: t.name })),
    labels: labelValues.filter(Boolean).map((l) => ({ value: l, label: l })),
  };

  const scope: WidgetGridScope = {
    teamIds,
    fixedTeamId: null,
    teamOptions: accessible.map((a) => ({
      id: String(a.team._id),
      name: a.team.name,
      sprintsEnabled: !!a.team.sprintsEnabled,
    })),
  };

  const hasSprintWidgets = activeWidgets.some((w) => w.kind === "burndown" || w.kind === "velocity");

  const exportParams = new URLSearchParams();
  exportParams.set("team", selectedTeamParam);
  exportParams.set("initiative", selectedInitiativeParam);

  return (
          <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
              Org Dashboard
            </h1>
            <p className="mt-1 text-xs text-slate">
              Open vs. closed, priority mix, and overdue counts — normalized across every
              Team&apos;s own statuses (ORG-7), so the numbers are actually comparable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardFilters
              teams={accessibleTeams}
              initiatives={initiatives.map((i) => ({ id: String(i._id), name: i.name as string }))}
              currentTeam={selectedTeamParam}
              currentInitiative={selectedInitiativeParam}
              showAllOption={accessibleTeams.length > 1}
            />
            <DashboardViewToolbar
              teamId={null}
              initialViews={initialViews}
              defaultWidgets={defaultWidgets}
              fieldOptions={fieldOptions}
              teamPickOptions={fieldOptions.teamId}
            />
            {data.total > 0 && (
              <a
                href={`/dashboard/board/api/dashboard/export?${exportParams.toString()}`}
                className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink shadow-2xs transition-colors hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            )}
          </div>
        </div>

        {data.total === 0 && !hasSprintWidgets ? (
          <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate mb-4">
              <Layers className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">Nothing in this scope yet</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
              No Work Items match the current Team/Initiative filter. Try widening the scope above.
            </p>
          </div>
        ) : (
          <>
            {data.total === 0 && (
              <p className="text-xs text-slate">
                No Work Items match the current Team/Initiative filter — showing Sprint widgets only.
              </p>
            )}
            <WidgetGrid
              widgets={activeWidgets}
              items={items}
              labelCtx={labelCtx}
              cycleTime={cycleTime}
              scope={scope}
              templates={templates}
            />
          </>
        )}
      </div>
  );
}
