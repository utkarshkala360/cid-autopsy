import Link from "next/link";
import { CheckCircle2, Clock, AlertTriangle, Layers, LayoutGrid } from "lucide-react";
import type { WidgetInstance } from "@board/lib/dashboard-widgets";
import { WIDGET_META } from "@board/lib/dashboard-widgets";
import { summarizeScopedItems, type ScopedWorkItem } from "@board/lib/dashboard";
import { filterScopedItems } from "@board/lib/dashboard-filters";
import { computeBreakdown, type BreakdownLabelContext } from "@board/lib/dashboard-breakdown";
import type { CycleTimeStat } from "@board/lib/cycle-time";
import { computeBurndown, computeVelocity } from "@board/lib/sprint-reports";
import { getActiveSprint } from "@board/lib/sprints";
import { computeEstimateVsActual } from "@board/lib/work-log-reports";
import { EstimateVsActualTable } from "@board/components/dashboard/estimate-vs-actual-table";
import { StatTile } from "@board/components/dashboard/stat-tile";
import { CategoryChart } from "@board/components/dashboard/charts/category-chart";
import { CycleTimeTable } from "@board/components/dashboard/cycle-time-table";
import { WidgetShell } from "@board/components/dashboard/widget-shell";
import { BurndownChart } from "@board/components/sprints/burndown-chart";
import { VelocityChart } from "@board/components/sprints/velocity-chart";
import type { TemplateDefLite } from "@board/lib/work-item-templates";
import type { BurndownChartType, VelocityChartType } from "@board/lib/chart-types";

export type TeamOption = { id: string; name: string; sprintsEnabled: boolean };

// `fixedTeamId` is set on a Team Dashboard (the page's own Team — every
// burndown/velocity widget resolves to it automatically, no per-widget
// picker needed) and null on the Org Dashboard (a widget instance's own
// `teamId` decides, since the page itself can be scoped to many Teams at
// once). Kept apart from `teamIds` (the page-level scope every
// summary/breakdown widget's item set is drawn from) because they answer
// genuinely different questions: "how many Teams' items feed this page"
// vs. "which one Team does a Sprint-scoped widget belong to."
export type WidgetGridScope = {
  teamIds: string[];
  fixedTeamId: string | null;
  teamOptions: TeamOption[];
};

// The single async Server Component every widget instance renders through
// — one `switch (kind)`, per-instance filter/group-by applied over the
// page's one shared `items` fetch (summary/breakdown), and a per-instance
// DB fetch only for the 2 kinds that genuinely need one (burndown/velocity)
// — the "generic engine, no bespoke path" point for this feature
// (Non-Negotiable #6): an 8th widget kind is one registry entry + one case.
export async function WidgetGrid({
  widgets,
  items,
  labelCtx,
  cycleTime,
  scope,
  templates,
}: {
  widgets: WidgetInstance[];
  items: ScopedWorkItem[];
  labelCtx: BreakdownLabelContext;
  cycleTime: CycleTimeStat[];
  scope: WidgetGridScope;
  templates: TemplateDefLite[];
}) {
  if (widgets.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-slate">
          <LayoutGrid className="h-7 w-7" />
        </div>
        <h2 className="font-heading text-lg font-bold text-ink">No widgets selected</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
          Open Widgets above and choose at least one, or Clear to see the default set.
        </p>
      </div>
    );
  }

  const rendered = await Promise.all(
    widgets.map((w) => renderWidget(w, { items, labelCtx, cycleTime, scope, templates }))
  );

  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{rendered}</div>;
}

async function renderWidget(
  instance: WidgetInstance,
  ctx: {
    items: ScopedWorkItem[];
    labelCtx: BreakdownLabelContext;
    cycleTime: CycleTimeStat[];
    scope: WidgetGridScope;
    templates: TemplateDefLite[];
  }
) {
  switch (instance.kind) {
    case "summary": {
      const filtered = filterScopedItems(ctx.items, instance.filters);
      const s = summarizeScopedItems(filtered);
      return (
        <div key={instance.id} className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2">
          <StatTile icon={Clock} label="Open" value={s.open} tone="in-progress" />
          <StatTile icon={CheckCircle2} label="Closed" value={s.closed} tone="done" />
          <StatTile icon={AlertTriangle} label="Overdue" value={s.overdue} tone="blocked" />
          <StatTile icon={Layers} label="Total" value={s.total} tone="neutral" />
        </div>
      );
    }
    case "breakdown": {
      const result = computeBreakdown(ctx.items, { filters: instance.filters, groupBy: instance.groupBy }, ctx.labelCtx);
      return (
        <WidgetShell key={instance.id} title={instance.title ?? WIDGET_META.breakdown.label}>
          <CategoryChart groups={result.groups} matchedTotal={result.matchedTotal} variant={instance.chartType} />
        </WidgetShell>
      );
    }
    case "cycle_time":
      return (
        <WidgetShell key={instance.id} title={instance.title ?? WIDGET_META.cycle_time.label}>
          <CycleTimeTable stats={ctx.cycleTime} templates={ctx.templates} />
        </WidgetShell>
      );
    case "burndown":
      return (
        <WidgetShell key={instance.id} title={instance.title ?? WIDGET_META.burndown.label}>
          {await renderBurndown(instance.teamId, instance.chartType, ctx.scope)}
        </WidgetShell>
      );
    case "velocity":
      return (
        <WidgetShell key={instance.id} title={instance.title ?? WIDGET_META.velocity.label}>
          {await renderVelocity(instance.teamId, instance.chartType, ctx.scope)}
        </WidgetShell>
      );
    case "estimate_vs_actual":
      return (
        <WidgetShell
          key={instance.id}
          title={instance.title ?? WIDGET_META.estimate_vs_actual.label}
        >
          {await renderEstimateVsActual(instance.teamId, ctx.scope)}
        </WidgetShell>
      );
  }
}

function SprintScopeNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs leading-relaxed text-slate">{children}</p>;
}

function resolveSprintTeam(instanceTeamId: string | null, scope: WidgetGridScope): TeamOption | null {
  const teamId = scope.fixedTeamId ?? instanceTeamId;
  if (!teamId) return null;
  return scope.teamOptions.find((t) => t.id === teamId) ?? null;
}

async function renderBurndown(instanceTeamId: string | null, chartType: BurndownChartType, scope: WidgetGridScope) {
  const team = resolveSprintTeam(instanceTeamId, scope);
  if (!team) {
    return (
      <SprintScopeNote>
        Pick a Team for this widget — open its Widgets menu entry and choose one.
      </SprintScopeNote>
    );
  }
  if (!team.sprintsEnabled) {
    return (
      <SprintScopeNote>
        {team.name} hasn&apos;t turned on Sprints. A Team Admin can enable them from{" "}
        <Link href={`/dashboard/board/settings/teams/${team.id}/work-item-config`} className="text-primary hover:underline">
          Team settings
        </Link>
        .
      </SprintScopeNote>
    );
  }
  const activeSprint = await getActiveSprint(team.id);
  if (!activeSprint) {
    return <SprintScopeNote>No active Sprint for {team.name} right now.</SprintScopeNote>;
  }
  const report = await computeBurndown(activeSprint);
  return <BurndownChart points={report.points} totalItems={report.totalItems} chartType={chartType} />;
}

async function renderVelocity(instanceTeamId: string | null, chartType: VelocityChartType, scope: WidgetGridScope) {
  const team = resolveSprintTeam(instanceTeamId, scope);
  if (!team) {
    return (
      <SprintScopeNote>
        Pick a Team for this widget — open its Widgets menu entry and choose one.
      </SprintScopeNote>
    );
  }
  if (!team.sprintsEnabled) {
    return (
      <SprintScopeNote>
        {team.name} hasn&apos;t turned on Sprints. A Team Admin can enable them from{" "}
        <Link href={`/dashboard/board/settings/teams/${team.id}/work-item-config`} className="text-primary hover:underline">
          Team settings
        </Link>
        .
      </SprintScopeNote>
    );
  }
  const points = await computeVelocity(team.id);
  return <VelocityChart points={points} chartType={chartType} />;
}

// WL-5: same "pick a Team, self-contained fetch" shape as burndown/velocity
// above — Estimate/Actual only mean anything for a Team with a configured
// timeTrackingUnit, not a filter over the shared item set, so this queries
// its own scope rather than reusing ctx.items.
async function renderEstimateVsActual(instanceTeamId: string | null, scope: WidgetGridScope) {
  const team = resolveSprintTeam(instanceTeamId, scope);
  if (!team) {
    return (
      <SprintScopeNote>
        Pick a Team for this widget — open its Widgets menu entry and choose one.
      </SprintScopeNote>
    );
  }
  const report = await computeEstimateVsActual(team.id);
  if (!report.unit) {
    return (
      <SprintScopeNote>
        {team.name} hasn&apos;t turned on time tracking. A Team Admin can enable it from{" "}
        <Link href={`/dashboard/board/settings/teams/${team.id}/work-item-config`} className="text-primary hover:underline">
          Team settings
        </Link>
        .
      </SprintScopeNote>
    );
  }
  return <EstimateVsActualTable teamId={team.id} rows={report.rows} unit={report.unit} />;
}
