// Work Item filter/sort/group-by config, built on the generic engine in
// view-config.ts (shared with Initiatives/Customers — see that file's
// header). This module's exports are unchanged from before the extraction:
// everything importing from here (view-toolbar.tsx, work-item-page-query.ts,
// dashboard code) keeps working with zero call-site changes.

import type {
  FilterCondition as CoreFilterCondition,
  FilterGroup as CoreFilterGroup,
  FilterConfig as CoreFilterConfig,
  SortKey as CoreSortKey,
  ViewConfig as CoreViewConfig,
} from "@board/lib/view-config";
import {
  UNASSIGNED_VALUE as CORE_UNASSIGNED_VALUE,
  emptyViewConfig,
  isEmptyViewConfig as coreIsEmptyViewConfig,
  encodeViewConfig as coreEncodeViewConfig,
  decodeViewConfig as coreDecodeViewConfig,
  buildFilterQuery as coreBuildFilterQuery,
} from "@board/lib/view-config";

export const FILTERABLE_FIELDS = [
  "status",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "customerId",
  "initiativeId",
  "teamInitiativeId",
  "dueDate",
] as const;
export type FilterField = (typeof FILTERABLE_FIELDS)[number];

export const MULTI_SELECT_FIELDS: FilterField[] = [
  "status",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "customerId",
  "initiativeId",
  "teamInitiativeId",
];

const DATE_FIELDS = new Set<string>(["dueDate"]);
const ARRAY_FIELDS = new Set<string>(["labels"]);

export type MultiSelectOperator = CoreFilterCondition<FilterField, "dueDate">["operator"];
export type DateOperator = Extract<
  CoreFilterCondition<FilterField, "dueDate">,
  { field: "dueDate" }
>["operator"];

export type FilterCondition = CoreFilterCondition<FilterField, "dueDate">;
export type FilterGroup = CoreFilterGroup<FilterField, "dueDate">;
export type FilterConfig = CoreFilterConfig<FilterField, "dueDate">;

export const SORTABLE_FIELDS = [
  "title",
  "key",
  "status",
  "priority",
  "assignee",
  "dueDate",
  "createdAt",
  "updatedAt",
] as const;
export type SortField = (typeof SORTABLE_FIELDS)[number];
export type SortKey = CoreSortKey<SortField>;

export const GROUPABLE_FIELDS = [
  "status",
  "priority",
  "assignee",
  "customerId",
  "initiativeId",
  "teamInitiativeId",
] as const;
export type GroupByField = (typeof GROUPABLE_FIELDS)[number];

export type ViewConfig = CoreViewConfig<FilterField, SortField, GroupByField, "dueDate">;

export const EMPTY_VIEW_CONFIG: ViewConfig = emptyViewConfig<
  FilterField,
  SortField,
  GroupByField,
  "dueDate"
>();

export function isEmptyViewConfig(config: ViewConfig): boolean {
  return coreIsEmptyViewConfig(config);
}

export function encodeViewConfig(config: ViewConfig): string {
  return coreEncodeViewConfig(config);
}

export function decodeViewConfig(raw: string | undefined | null): ViewConfig {
  return coreDecodeViewConfig<FilterField, SortField, GroupByField, "dueDate">(raw);
}

/**
 * AND across groups, OR within a group. Mongo-shaped so page loaders can
 * spread the result straight into a `WorkItem.find()` query alongside
 * teamId/type. `unassignedValue` lets a multi-select field represent
 * "unassigned"/"none" with a sentinel string in the UI while translating to
 * a real `null` match here.
 */
export function buildFilterQuery(config: FilterConfig): Record<string, unknown> {
  return coreBuildFilterQuery(config, { dateFields: DATE_FIELDS, arrayFields: ARRAY_FIELDS });
}

export const UNASSIGNED_VALUE = CORE_UNASSIGNED_VALUE;

// `applySort`/`applyGroupBy` (in-JS sort/group over a fully-fetched array)
// lived here through Phase "pagination redesign" Checkpoint 1 as the
// reference implementation the new aggregation-pipeline rewrite
// (src/lib/work-item-page-query.ts's getWorkItemsPage(), Checkpoint 2) was
// verified against — see that file's header comment for the behavior-
// preservation notes. Removed once the aggregation version was confirmed to
// reproduce their output for every sort key and group-by field against real
// seeded data, since nothing else in the codebase called them.
