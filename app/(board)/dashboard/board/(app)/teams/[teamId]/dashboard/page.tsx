import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { TeamDashboardFilters } from "@board/components/dashboard/team-dashboard-filters";
import { DashboardViewToolbar, type DashboardViewOption } from "@board/components/dashboard/dashboard-view-toolbar";
import { WidgetGrid, type WidgetGridScope } from "@board/components/dashboard/widget-grid";
import { requireTeamRole } from "@board/lib/authz";
import { fetchScopedWorkItems, computeDashboardFromItems } from "@board/lib/dashboard";
import { computeCycleTime } from "@board/lib/cycle-time";
import { getTeamMentionCandidates } from "@board/lib/work-items";
import { decodeDashboardViewConfig } from "@board/lib/dashboard-views";
import { defaultTeamWidgetInstances } from "@board/lib/dashboard-widgets";
import type { BreakdownLabelContext } from "@board/lib/dashboard-breakdown";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { Initiative } from "@board/models/Initiative";
import { Customer } from "@board/models/Customer";
import { WorkItem } from "@board/models/WorkItem";
import { DashboardView } from "@board/models/DashboardView";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

// A Team's own dashboard — genuinely separate from the Org Dashboard
// (/dashboard), not just that page's Team filter narrowed to one Team: its
// own Widgets menu, its own saved Views (Team-scoped, "shared" meaning
// everyone on THIS Team, not the whole Org — DashboardView.teamId, see
// ARCHITECTURE.md's Data Model). Burndown/Velocity widgets need no
// per-widget Team pick here (WidgetGridScope.fixedTeamId) since the page
// itself already fixes it.
export default async function TeamDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ initiative?: string; dv?: string }>;
}) {
  const { teamId } = await params;
  const { initiative: initiativeParam, dv: dvParam } = await searchParams;
  const authz = await requireTeamRole(teamId, "viewer");

  if (!authz.ok && authz.status === 401) {
    redirect("/dashboard/login");
  }
  if (!authz.ok) {
    return (
      <ForbiddenState
        title={authz.status === 404 ? "Team not found" : "You don't have access to this Team"}
        message={
          authz.status === 404
            ? "This Team doesn't exist or was removed."
            : "Viewing this Team's Dashboard requires at least Team Viewer access."
        }
      />
    );
  }

  await connectDB();
  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team) {
    return <ForbiddenState title="Team not found" message="This Team doesn't exist or was removed." />;
  }

  const defaultWidgets = defaultTeamWidgetInstances();
  const activeWidgets = decodeDashboardViewConfig(dvParam).widgets;

  const initiatives = await Initiative.find(
    { organizationId: authz.member.organizationId, teamId: null },
    "name"
  )
    .sort({ name: 1 })
    .lean();
  const initiativeIds = new Set(initiatives.map((i) => String(i._id)));
  const selectedInitiativeParam =
    initiativeParam && (initiativeParam === "all" || initiativeIds.has(initiativeParam))
      ? initiativeParam
      : "all";
  const initiativeIdParam = selectedInitiativeParam === "all" ? null : selectedInitiativeParam;

  const [{ items, assigneeNameById, customerNameById }, dashboardViewDocs, allCustomers, labelValues, teamMembers] =
    await Promise.all([
      fetchScopedWorkItems({
        organizationId: authz.member.organizationId,
        teamIds: [teamId],
        initiativeId: initiativeIdParam,
      }),
      DashboardView.find({
        organizationId: authz.member.organizationId,
        teamId,
        $or: [{ visibility: "shared" }, { visibility: "self", createdBy: authz.member._id }],
      })
        .sort({ name: 1 })
        .lean(),
      Customer.find({ organizationId: authz.member.organizationId }, "name").sort({ name: 1 }).lean(),
      WorkItem.distinct("labels", { teamId, organizationId: authz.member.organizationId }) as Promise<string[]>,
      getTeamMentionCandidates(teamId),
    ]);

  const teamNameById = new Map([[teamId, team.name]]);
  const data = computeDashboardFromItems(items, [teamId], teamNameById, assigneeNameById);
  const cycleTime = await computeCycleTime({ teamIds: [teamId], initiativeId: initiativeIdParam });

  const initialViews: DashboardViewOption[] = dashboardViewDocs.map((v) => ({
    id: String(v._id),
    name: v.name,
    visibility: v.visibility as "self" | "shared",
    config: v.config,
    mine: String(v.createdBy) === String(authz.member._id),
  }));

  const initiativeNameById = new Map(initiatives.map((i) => [String(i._id), i.name as string]));
  const labelCtx: BreakdownLabelContext = {
    teamNameById,
    assigneeNameById,
    customerNameById,
    initiativeNameById,
  };

  const fieldOptions = {
    assignee: teamMembers.map((m) => ({ value: m.id, label: m.name })),
    customerId: allCustomers.map((c) => ({ value: String(c._id), label: c.name as string })),
    initiativeId: initiatives.map((i) => ({ value: String(i._id), label: i.name as string })),
    teamId: [{ value: teamId, label: team.name }],
    labels: labelValues.filter(Boolean).map((l) => ({ value: l, label: l })),
  };

  const scope: WidgetGridScope = {
    teamIds: [teamId],
    fixedTeamId: teamId,
    teamOptions: [{ id: teamId, name: team.name, sprintsEnabled: !!team.sprintsEnabled }],
  };

  const hasSprintWidgets = activeWidgets.some((w) => w.kind === "burndown" || w.kind === "velocity");
  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const typeLabel = labelForTeam(team, templates);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/dashboard/board/teams/${teamId}/work-items`}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
          >
            <ArrowLeft className="h-3 w-3" />
            {team.name} {typeLabel}s
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink">
            {team.name} · Dashboard
          </h1>
          <p className="mt-1 text-xs text-slate">
            This Team&apos;s own open/closed, priority, and Sprint picture — separate from the Org
            Dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeamDashboardFilters initiatives={initiatives.map((i) => ({ id: String(i._id), name: i.name as string }))} currentInitiative={selectedInitiativeParam} />
          <DashboardViewToolbar
            teamId={teamId}
            initialViews={initialViews}
            defaultWidgets={defaultWidgets}
            fieldOptions={fieldOptions}
            teamPickOptions={fieldOptions.teamId}
          />
        </div>
      </div>

      {data.total === 0 && !hasSprintWidgets ? (
        <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate mb-4">
            <Layers className="h-7 w-7" />
          </div>
          <h2 className="font-heading text-lg font-bold text-ink">Nothing in this scope yet</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
            No {typeLabel.toLowerCase()}s match the current Initiative filter. Try widening the scope
            above.
          </p>
        </div>
      ) : (
        <>
          {data.total === 0 && (
            <p className="text-xs text-slate">
              No {typeLabel.toLowerCase()}s match the current Initiative filter — showing Sprint
              widgets only.
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
