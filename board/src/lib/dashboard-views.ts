// Shared config shape for a saved Dashboard View (DashboardView model) — a
// selection + order of widget INSTANCES for a Dashboard/Team Dashboard
// page. No server/DB imports here — used by both the client toolbar/picker
// and the server page loader, same split src/lib/work-item-views.ts already
// established for the Work Items list's Saved Views.

import {
  DASHBOARD_WIDGET_KINDS,
  defaultWidgetInstances,
  isWidgetKind,
  newWidgetId,
  newWidgetInstance,
  type WidgetInstance,
  type WidgetKind,
} from "@board/lib/dashboard-widgets";
import type { DashboardGroupByField } from "@board/lib/dashboard-breakdown";
import { DASHBOARD_GROUP_BY_FIELDS } from "@board/lib/dashboard-breakdown";
import {
  DASHBOARD_FILTER_FIELDS,
  EMPTY_DASHBOARD_FILTER_CONFIG,
  type DashboardFilterConfig,
  type DashboardFilterField,
} from "@board/lib/dashboard-filters";
import {
  CATEGORY_CHART_TYPES,
  BURNDOWN_CHART_TYPES,
  VELOCITY_CHART_TYPES,
  type CategoryChartType,
  type BurndownChartType,
  type VelocityChartType,
} from "@board/lib/chart-types";

export type DashboardViewConfig = {
  widgets: WidgetInstance[];
};

export function defaultDashboardViewConfig(): DashboardViewConfig {
  return { widgets: defaultWidgetInstances() };
}

export function isEmptyDashboardViewConfig(config: DashboardViewConfig): boolean {
  return config.widgets.length === 0;
}

function sanitizeFilters(raw: unknown): DashboardFilterConfig {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { groups?: unknown }).groups)) {
    return EMPTY_DASHBOARD_FILTER_CONFIG;
  }
  const groups = (raw as { groups: unknown[] }).groups
    .map((g) => {
      if (!g || typeof g !== "object") return null;
      const group = g as { id?: unknown; conditions?: unknown };
      if (!Array.isArray(group.conditions)) return null;
      const conditions = group.conditions
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const cond = c as { field?: unknown; operator?: unknown; values?: unknown };
          if (!DASHBOARD_FILTER_FIELDS.includes(cond.field as DashboardFilterField)) return null;
          if (cond.operator !== "is_any_of" && cond.operator !== "is_none_of") return null;
          if (!Array.isArray(cond.values)) return null;
          return {
            field: cond.field as DashboardFilterField,
            operator: cond.operator as "is_any_of" | "is_none_of",
            values: cond.values.filter((v): v is string => typeof v === "string"),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      return { id: typeof group.id === "string" ? group.id : newWidgetId(), conditions };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
  return { groups };
}

/**
 * Tolerates the earlier, short-lived version of this config (a plain
 * `WidgetKind[]`, no per-instance filters/group-by) by translating each
 * legacy kind into a same-shaped default instance — so a `?dv=` URL or a
 * saved View created before per-widget configuration existed still decodes
 * to something sensible instead of silently dropping every widget.
 */
function sanitizeWidgetInstance(raw: unknown): WidgetInstance | null {
  if (typeof raw === "string") {
    const legacyMap: Record<string, WidgetInstance | undefined> = {
      priority_breakdown: { id: newWidgetId(), kind: "breakdown", title: "Items by priority", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "priority", chartType: "bar" },
      team_breakdown: { id: newWidgetId(), kind: "breakdown", title: "By Team", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "teamId", chartType: "bar" },
      assignee_breakdown: { id: newWidgetId(), kind: "breakdown", title: "By Assignee", filters: EMPTY_DASHBOARD_FILTER_CONFIG, groupBy: "assignee", chartType: "bar" },
    };
    if (legacyMap[raw]) return legacyMap[raw]!;
    return isWidgetKind(raw) ? newWidgetInstance(raw) : null;
  }

  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isWidgetKind(obj.kind)) return null;
  const kind = obj.kind as WidgetKind;
  const id = typeof obj.id === "string" && obj.id ? obj.id : newWidgetId();
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : undefined;

  switch (kind) {
    case "summary":
      return { id, kind, title, filters: sanitizeFilters(obj.filters) };
    case "breakdown": {
      const groupBy = DASHBOARD_GROUP_BY_FIELDS.includes(obj.groupBy as DashboardGroupByField)
        ? (obj.groupBy as DashboardGroupByField)
        : "priority";
      const chartType = (CATEGORY_CHART_TYPES as readonly string[]).includes(obj.chartType as string)
        ? (obj.chartType as CategoryChartType)
        : "bar";
      return { id, kind, title, filters: sanitizeFilters(obj.filters), groupBy, chartType };
    }
    case "cycle_time":
      return { id, kind, title };
    case "burndown": {
      const chartType = (BURNDOWN_CHART_TYPES as readonly string[]).includes(obj.chartType as string)
        ? (obj.chartType as BurndownChartType)
        : "burndown";
      return { id, kind, title, teamId: typeof obj.teamId === "string" ? obj.teamId : null, chartType };
    }
    case "velocity": {
      const chartType = (VELOCITY_CHART_TYPES as readonly string[]).includes(obj.chartType as string)
        ? (obj.chartType as VelocityChartType)
        : "bar";
      return { id, kind, title, teamId: typeof obj.teamId === "string" ? obj.teamId : null, chartType };
    }
    // Pre-existing gap fixed here (not introduced by this pass): this
    // switch was exhaustive over 5 of 6 WidgetKinds but had no
    // `estimate_vs_actual` case and no fallback after it, so a saved/URL-
    // encoded Estimate vs. Actual widget (WL-5) silently decoded to `null`
    // and disappeared on reload — the Zod schema and registry both already
    // knew this kind, only this decoder didn't. Same "unrecognized input ->
    // null" behavior every other branch in this function already uses
    // defensively for its own fields.
    case "estimate_vs_actual":
      return { id, kind, title, teamId: typeof obj.teamId === "string" ? obj.teamId : null };
  }
}

export function sanitizeWidgetList(widgets: unknown): WidgetInstance[] {
  if (!Array.isArray(widgets)) return [];
  return widgets
    .map((w) => sanitizeWidgetInstance(w))
    .filter((w): w is WidgetInstance => w !== null);
}

// Callers hand this straight to URLSearchParams.set()/read it from Next's
// searchParams — both already percent-encode/decode the query string, so
// encoding it again here would double-encode (src/lib/work-item-views.ts
// hit exactly this bug once and fixed it — don't reintroduce it here).
export function encodeDashboardViewConfig(config: DashboardViewConfig): string {
  return JSON.stringify(config);
}

export function decodeDashboardViewConfig(raw: string | undefined | null): DashboardViewConfig {
  if (!raw) return defaultDashboardViewConfig();
  try {
    const parsed = JSON.parse(raw);
    return { widgets: sanitizeWidgetList(parsed.widgets) };
  } catch {
    return defaultDashboardViewConfig();
  }
}

export const ALL_WIDGET_KINDS = DASHBOARD_WIDGET_KINDS;
