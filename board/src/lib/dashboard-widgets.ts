// Registry of every widget kind selectable on a Dashboard/Team Dashboard
// View. Unlike the first version of this feature (a fixed WidgetKind[]
// selection), a widget here is a configurable INSTANCE — you can add the
// same kind more than once with different filters/group-by, Asana-style.
// One entry here + one `case` in WidgetGrid (src/components/dashboard/
// widget-grid.tsx) is still the whole surface for adding an new widget kind
// later (Non-Negotiable #6).

import { EMPTY_DASHBOARD_FILTER_CONFIG, type DashboardFilterConfig } from "@board/lib/dashboard-filters";
import type { DashboardGroupByField } from "@board/lib/dashboard-breakdown";
import type { CategoryChartType, BurndownChartType, VelocityChartType } from "@board/lib/chart-types";

export const DASHBOARD_WIDGET_KINDS = [
  "summary",
  "breakdown",
  "cycle_time",
  "burndown",
  "velocity",
  "estimate_vs_actual",
] as const;
export type WidgetKind = (typeof DASHBOARD_WIDGET_KINDS)[number];

export function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === "string" && (DASHBOARD_WIDGET_KINDS as readonly string[]).includes(value);
}

// `filters` apply to `summary`/`breakdown` only — they narrow the shared
// page-scoped item set (src/lib/dashboard-filters.ts). `burndown`/`velocity`
// stay filter-free: they're Sprint-history replays over one Team's Sprint
// membership (src/lib/sprint-reports.ts), not a count over the current item
// set, so "priority is urgent" has no meaningful application to them — a
// stated scope line, not an oversight. `cycle_time` is also left unfiltered
// this pass (it replays ChangeHistory per item rather than reading the
// shared fetched set, so per-widget filtering would need its own querying
// path) — same kind of deliberate, named simplification this codebase's
// Build Log states plainly elsewhere rather than silently under-building.
// `chartType` is the visual on top of a kind's data (Chart Styles pass) —
// kept as its own field per kind rather than a cross-kind axis: Breakdown's
// styles (Bar/Stacked bar/Grouped bar/Donut/Lollipop) all read the same
// BreakdownGroup[] shape, Burndown's (Burndown/Burnup) both read the same
// Sprint replay, Velocity's (Bar/Line) both read the same points — none of
// those style sets means anything on a different kind, so this stays 3
// separate literal unions rather than one shared "chartType: string" that
// would need per-kind validation anyway.
export type WidgetInstance =
  | { id: string; kind: "summary"; title?: string; filters: DashboardFilterConfig }
  | {
      id: string;
      kind: "breakdown";
      title?: string;
      filters: DashboardFilterConfig;
      groupBy: DashboardGroupByField;
      chartType: CategoryChartType;
    }
  | { id: string; kind: "cycle_time"; title?: string }
  // teamId: null on a Team Dashboard (the page's own Team is implicit); on
  // the Org Dashboard, an explicit per-widget Team pick — decoupled from the
  // page's own Team/Initiative filter bar, since a Burndown/Velocity widget
  // needs exactly one Team regardless of how many Teams the page filter has
  // in scope.
  | { id: string; kind: "burndown"; title?: string; teamId: string | null; chartType: BurndownChartType }
  | { id: string; kind: "velocity"; title?: string; teamId: string | null; chartType: VelocityChartType }
  // WL-5: same "one Team at a time, per-instance Team pick" shape as
  // burndown/velocity — Estimate/Actual only mean anything for a Team with
  // a configured timeTrackingUnit, so this is a self-contained per-Team
  // fetch (computeEstimateVsActual), not a filter over the shared item set.
  | { id: string; kind: "estimate_vs_actual"; title?: string; teamId: string | null };

export const WIDGET_META: Record<
  WidgetKind,
  { label: string; description: string; configurable: boolean; needsTeamPick: boolean }
> = {
  summary: {
    label: "Summary",
    description: "Open, closed, overdue, and total counts.",
    configurable: true,
    needsTeamPick: false,
  },
  breakdown: {
    label: "Breakdown",
    description: "Grouped counts — pick what to group by and filter first.",
    configurable: true,
    needsTeamPick: false,
  },
  cycle_time: {
    label: "Cycle & lead time",
    description: "Average lead/cycle time per Work Item type.",
    configurable: false,
    needsTeamPick: false,
  },
  burndown: {
    label: "Sprint burndown",
    description: "Remaining work vs. time for one Team's active Sprint.",
    configurable: false,
    needsTeamPick: true,
  },
  velocity: {
    label: "Sprint velocity",
    description: "Completed items across one Team's last few Sprints.",
    configurable: false,
    needsTeamPick: true,
  },
  estimate_vs_actual: {
    label: "Estimate vs. Actual",
    description: "Logged time vs. Estimate per Work Item, for one Team.",
    configurable: false,
    needsTeamPick: true,
  },
};

export function newWidgetId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function newWidgetInstance(kind: WidgetKind): WidgetInstance {
  const id = newWidgetId();
  switch (kind) {
    case "summary":
      return { id, kind, filters: EMPTY_DASHBOARD_FILTER_CONFIG };
    case "breakdown":
      return { id, kind, filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "priority", chartType: "bar" };
    case "cycle_time":
      return { id, kind };
    case "burndown":
      return { id, kind, teamId: null, chartType: "burndown" };
    case "velocity":
      return { id, kind, teamId: null, chartType: "bar" };
    case "estimate_vs_actual":
      return { id, kind, teamId: null };
  }
}

// Exactly the pre-existing dashboard's 5 cards, translated into instances —
// a Member who never opens the Widgets menu sees zero behavior change.
export function defaultWidgetInstances(): WidgetInstance[] {
  return [
    { id: "summary", kind: "summary", filters: EMPTY_DASHBOARD_FILTER_CONFIG },
    { id: "priority", kind: "breakdown", title: "Items by priority", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "priority", chartType: "bar" },
    { id: "team", kind: "breakdown", title: "By Team", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "teamId", chartType: "bar" },
    { id: "assignee", kind: "breakdown", title: "By Assignee", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "assignee", chartType: "bar" },
    { id: "cycle-time", kind: "cycle_time" },
  ];
}

// Same default, scoped for a Team Dashboard — "By Team" is meaningless when
// the whole page is already one Team, so it's swapped for a status-category
// breakdown instead.
export function defaultTeamWidgetInstances(): WidgetInstance[] {
  return [
    { id: "summary", kind: "summary", filters: EMPTY_DASHBOARD_FILTER_CONFIG },
    { id: "priority", kind: "breakdown", title: "Items by priority", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "priority", chartType: "bar" },
    { id: "status", kind: "breakdown", title: "By Status", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "statusCategory", chartType: "bar" },
    { id: "assignee", kind: "breakdown", title: "By Assignee", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "assignee", chartType: "bar" },
    { id: "cycle-time", kind: "cycle_time" },
  ];
}
