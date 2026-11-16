// Zod schema for a WidgetInstance (src/lib/dashboard-widgets.ts), shared by
// both /api/dashboard-views route files. Kept out of route.ts itself —
// Next.js route handler files are typechecked against a fixed export list
// (GET/POST/etc. + a small set of route config exports), so an extra named
// export like this one belongs in a plain lib module, not a route file.
import { z } from "zod";
import { DASHBOARD_GROUP_BY_FIELDS } from "@board/lib/dashboard-breakdown";
import { DASHBOARD_FILTER_FIELDS } from "@board/lib/dashboard-filters";
import { CATEGORY_CHART_TYPES, BURNDOWN_CHART_TYPES, VELOCITY_CHART_TYPES } from "@board/lib/chart-types";

export const dashboardFilterSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      conditions: z.array(
        z.object({
          field: z.enum(DASHBOARD_FILTER_FIELDS),
          operator: z.enum(["is_any_of", "is_none_of"]),
          values: z.array(z.string()),
        })
      ),
    })
  ),
});

export const widgetInstanceSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("summary"),
    title: z.string().max(80).optional(),
    filters: dashboardFilterSchema,
  }),
  z.object({
    id: z.string(),
    kind: z.literal("breakdown"),
    title: z.string().max(80).optional(),
    filters: dashboardFilterSchema,
    groupBy: z.enum(DASHBOARD_GROUP_BY_FIELDS),
    chartType: z.enum(CATEGORY_CHART_TYPES),
  }),
  z.object({ id: z.string(), kind: z.literal("cycle_time"), title: z.string().max(80).optional() }),
  z.object({
    id: z.string(),
    kind: z.literal("burndown"),
    title: z.string().max(80).optional(),
    teamId: z.string().nullable(),
    chartType: z.enum(BURNDOWN_CHART_TYPES),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("velocity"),
    title: z.string().max(80).optional(),
    teamId: z.string().nullable(),
    chartType: z.enum(VELOCITY_CHART_TYPES),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("estimate_vs_actual"),
    title: z.string().max(80).optional(),
    teamId: z.string().nullable(),
  }),
]);

export const dashboardViewConfigSchema = z.object({ widgets: z.array(widgetInstanceSchema) });
