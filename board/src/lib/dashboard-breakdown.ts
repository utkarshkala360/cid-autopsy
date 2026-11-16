// The compute behind the configurable "breakdown" widget (Dashboard Views,
// per-widget filters/group-by) — one generic grouped-count engine replacing
// what used to be 3 fixed-shape widgets (Priority/Team/Assignee breakdown).
// Pure function over an already-fetched ScopedWorkItem[] (src/lib/
// dashboard.ts's fetchScopedWorkItems) — every widget on a page shares that
// one fetch; this just filters (src/lib/dashboard-filters.ts) and groups it
// in memory, no DB access of its own.

import type { ScopedWorkItem } from "@board/lib/dashboard";
import { filterScopedItems, type DashboardFilterConfig } from "@board/lib/dashboard-filters";
import { PRIORITY_LABEL, STATUS_CATEGORY_LABEL } from "@board/lib/status-categories";

export const DASHBOARD_GROUP_BY_FIELDS = [
  "priority",
  "statusCategory",
  "assignee",
  "customerId",
  "initiativeId",
  "teamId",
  "labels",
] as const;
export type DashboardGroupByField = (typeof DASHBOARD_GROUP_BY_FIELDS)[number];

export type BreakdownGroup = { key: string; label: string; total: number; open: number; closed: number };
export type BreakdownResult = { groups: BreakdownGroup[]; matchedTotal: number };

export type BreakdownLabelContext = {
  teamNameById: Map<string, string>;
  assigneeNameById: Map<string, string>;
  customerNameById: Map<string, string>;
  initiativeNameById: Map<string, string>;
};

function groupKeyAndLabel(
  item: ScopedWorkItem,
  groupBy: DashboardGroupByField,
  ctx: BreakdownLabelContext
): { key: string; label: string } {
  switch (groupBy) {
    case "priority":
      return { key: item.priority, label: PRIORITY_LABEL[item.priority] };
    case "statusCategory":
      return { key: item.statusCategory, label: STATUS_CATEGORY_LABEL[item.statusCategory] };
    case "assignee":
      return item.assignee
        ? { key: item.assignee, label: ctx.assigneeNameById.get(item.assignee) ?? "Unknown Member" }
        : { key: "__unassigned__", label: "Unassigned" };
    case "customerId":
      return item.customerId
        ? { key: item.customerId, label: ctx.customerNameById.get(item.customerId) ?? "Unknown Customer" }
        : { key: "__none__", label: "No Customer" };
    case "initiativeId":
      return item.initiativeId
        ? {
            key: item.initiativeId,
            label: ctx.initiativeNameById.get(item.initiativeId) ?? "Unknown Initiative",
          }
        : { key: "__none__", label: "No Initiative" };
    case "teamId":
      return { key: item.teamId, label: ctx.teamNameById.get(item.teamId) ?? "Unknown Team" };
    case "labels":
      // Handled by the caller (a labels-grouped item can land in more than
      // one bucket) — never reached directly, kept exhaustive for the switch.
      return { key: "__none__", label: "No labels" };
  }
}

/**
 * `filters` narrows the shared item set (AND-of-OR, same shape the Work
 * Items list's Saved Views use); `groupBy` buckets what's left. Every
 * bucket carries open/closed alongside its total, same "count isn't enough
 * on its own" treatment `TeamBreakdownTable`/`AssigneeBreakdownTable`
 * already gave their fixed dimensions — `labels` is the one multi-valued
 * dimension, so an item with 2 labels counts once in each bucket rather
 * than being forced into a single group.
 */
export function computeBreakdown(
  items: ScopedWorkItem[],
  opts: { filters: DashboardFilterConfig; groupBy: DashboardGroupByField },
  ctx: BreakdownLabelContext
): BreakdownResult {
  const matched = filterScopedItems(items, opts.filters);
  const groups = new Map<string, BreakdownGroup>();

  function bucket(key: string, label: string): BreakdownGroup {
    const existing = groups.get(key);
    if (existing) return existing;
    const created: BreakdownGroup = { key, label, total: 0, open: 0, closed: 0 };
    groups.set(key, created);
    return created;
  }

  for (const item of matched) {
    const isDone = item.statusCategory === "done";
    if (opts.groupBy === "labels") {
      const labels = item.labels.length ? item.labels : ["__none__"];
      for (const label of labels) {
        const g = bucket(label, label === "__none__" ? "No labels" : label);
        g.total += 1;
        if (isDone) g.closed += 1;
        else g.open += 1;
      }
      continue;
    }
    const { key, label } = groupKeyAndLabel(item, opts.groupBy, ctx);
    const g = bucket(key, label);
    g.total += 1;
    if (isDone) g.closed += 1;
    else g.open += 1;
  }

  return {
    groups: [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    matchedTotal: matched.length,
  };
}
