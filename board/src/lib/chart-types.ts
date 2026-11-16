// Plain constants/types only — no "use client" chart component imports here.
// dashboard-view-schema.ts (Zod, imported by server route.ts files) and
// dashboard-widgets.ts (imported by both the client config dialog and server
// widget-grid) both need these at both module-eval and type-check time, so
// the source of truth lives in a plain lib module rather than inside the
// chart components themselves — same split status-categories.ts already
// established for STATUS_CATEGORIES/PRIORITIES.

export const CATEGORY_CHART_TYPES = ["bar", "stacked_bar", "grouped_bar", "donut", "lollipop"] as const;
export type CategoryChartType = (typeof CATEGORY_CHART_TYPES)[number];

export const BURNDOWN_CHART_TYPES = ["burndown", "burnup"] as const;
export type BurndownChartType = (typeof BURNDOWN_CHART_TYPES)[number];

export const VELOCITY_CHART_TYPES = ["bar", "line"] as const;
export type VelocityChartType = (typeof VELOCITY_CHART_TYPES)[number];
