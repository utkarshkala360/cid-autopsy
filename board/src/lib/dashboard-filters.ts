// Per-widget filter config for a Dashboard/Team Dashboard widget instance —
// deliberately a SEPARATE, smaller engine from src/lib/work-item-views.ts's
// FilterConfig, not a forced reuse of it, for a reason worth stating: that
// engine filters raw per-Team status keys and Team-scoped picker options,
// which only make sense inside one Team's own Work Item list. A Dashboard
// widget can span every Team in the Org at once, where "status" only means
// anything via the normalized ORG-7 category (todo/in_progress/done/
// blocked) — the exact same "compare across Teams" problem computeDashboard
// already solved by bucketing on category, not raw status. Reusing the
// Work Item engine's literal types here would mean bolting Team-agnostic
// semantics onto a type built for one Team, so this file re-establishes the
// same two-level AND-of-OR shape as a parallel, smaller model instead.
//
// No server/DB imports — used by both the client filter-editor UI and the
// server-side widget computation (src/lib/dashboard-breakdown.ts), same
// split work-item-views.ts already established. Filtering itself runs in
// plain JS over an already-fetched item array (src/lib/dashboard.ts's
// fetchScopedWorkItems), not a Mongo query — every widget on a Dashboard
// page shares one fetch of the page's Team/Initiative scope, so a per-widget
// filter only ever narrows that same in-memory array.

import type { ScopedWorkItem } from "@board/lib/dashboard";
import { PRIORITIES, STATUS_CATEGORIES } from "@board/lib/status-categories";

export const DASHBOARD_FILTER_FIELDS = [
  "priority",
  "statusCategory",
  "assignee",
  "customerId",
  "initiativeId",
  "labels",
  "teamId",
] as const;
export type DashboardFilterField = (typeof DASHBOARD_FILTER_FIELDS)[number];

export type DashboardFilterOperator = "is_any_of" | "is_none_of";

export type DashboardFilterCondition = {
  field: DashboardFilterField;
  operator: DashboardFilterOperator;
  values: string[];
};

export type DashboardFilterGroup = { id: string; conditions: DashboardFilterCondition[] };
export type DashboardFilterConfig = { groups: DashboardFilterGroup[] };

export const EMPTY_DASHBOARD_FILTER_CONFIG: DashboardFilterConfig = { groups: [] };

export function isEmptyDashboardFilterConfig(config: DashboardFilterConfig): boolean {
  return config.groups.every((g) => g.conditions.length === 0);
}

export function newDashboardCondition(field: DashboardFilterField): DashboardFilterCondition {
  return { field, operator: "is_any_of", values: [] };
}

const UNASSIGNED = "__unassigned__";
const NO_VALUE = "__none__";
export { UNASSIGNED as DASHBOARD_UNASSIGNED_VALUE, NO_VALUE as DASHBOARD_NO_VALUE };

function itemValueFor(item: ScopedWorkItem, field: DashboardFilterField): string[] {
  switch (field) {
    case "priority":
      return [item.priority];
    case "statusCategory":
      return [item.statusCategory];
    case "assignee":
      return [item.assignee ?? UNASSIGNED];
    case "customerId":
      return [item.customerId ?? NO_VALUE];
    case "initiativeId":
      return [item.initiativeId ?? NO_VALUE];
    case "teamId":
      return [item.teamId];
    case "labels":
      return item.labels.length ? item.labels : [NO_VALUE];
  }
}

function matchesCondition(item: ScopedWorkItem, cond: DashboardFilterCondition): boolean {
  if (cond.values.length === 0) return true;
  const itemValues = itemValueFor(item, cond.field);
  const overlaps = itemValues.some((v) => cond.values.includes(v));
  return cond.operator === "is_none_of" ? !overlaps : overlaps;
}

/** AND across groups, OR within a group — same shape work-item-views.ts's FilterConfig uses. */
export function filterScopedItems(items: ScopedWorkItem[], config: DashboardFilterConfig): ScopedWorkItem[] {
  const activeGroups = config.groups.filter((g) => g.conditions.length > 0);
  if (activeGroups.length === 0) return items;

  return items.filter((item) =>
    activeGroups.every((group) => group.conditions.some((cond) => matchesCondition(item, cond)))
  );
}

export { PRIORITIES, STATUS_CATEGORIES };
