// Filter/sort/group-by field registry for the org-level Initiatives list
// (the `teamId: null` cross-team-tags branch of /initiatives — the
// Team-run Sprints branch is a different UI paradigm and doesn't use this).
// Built on the generic engine in view-config.ts — see that file's header.
//
// `sprintStatus` is always "none" on this branch (only Team-run Initiatives
// exercise the planned/active/completed cycle) so it's excluded here.
// `lifecycleStage` is only meaningful when Module B (Product Lifecycle) is
// org-enabled — callers gate it out via `initiativeFilterableFields`/
// `initiativeGroupableFields` using the live `initiative` StageTrack's
// `enabled` flag (src/lib/stage-tracks.ts), same pattern the detail page
// already uses to hide the macro-stage picker when the module is off.

import type { ViewConfig } from "@board/lib/view-config";
import type { FieldMeta } from "@board/components/shared/filter-sort-group-toolbar";

export const INITIATIVE_FILTERABLE_FIELDS = ["lifecycleStage", "createdBy"] as const;
export type InitiativeFilterField = (typeof INITIATIVE_FILTERABLE_FIELDS)[number];

export const INITIATIVE_SORTABLE_FIELDS = ["name", "createdAt", "updatedAt"] as const;
export type InitiativeSortField = (typeof INITIATIVE_SORTABLE_FIELDS)[number];

export const INITIATIVE_GROUPABLE_FIELDS = ["lifecycleStage"] as const;
export type InitiativeGroupField = (typeof INITIATIVE_GROUPABLE_FIELDS)[number];

export type InitiativeViewConfig = ViewConfig<
  InitiativeFilterField,
  InitiativeSortField,
  InitiativeGroupField
>;

export const INITIATIVE_FIELD_META: Record<InitiativeFilterField, FieldMeta> = {
  lifecycleStage: { label: "Lifecycle stage", kind: "multi-select", allowUnassigned: true },
  createdBy: { label: "Created by", kind: "multi-select" },
};

export const INITIATIVE_SORT_FIELD_LABEL: Record<InitiativeSortField, string> = {
  name: "Name",
  createdAt: "Created",
  updatedAt: "Updated",
};

export const INITIATIVE_GROUP_FIELD_LABEL: Record<InitiativeGroupField, string> = {
  lifecycleStage: "Lifecycle stage",
};

export function initiativeFilterableFields(lifecycleEnabled: boolean): InitiativeFilterField[] {
  return lifecycleEnabled
    ? [...INITIATIVE_FILTERABLE_FIELDS]
    : INITIATIVE_FILTERABLE_FIELDS.filter((f) => f !== "lifecycleStage");
}

export function initiativeGroupableFields(lifecycleEnabled: boolean): InitiativeGroupField[] {
  return lifecycleEnabled ? [...INITIATIVE_GROUPABLE_FIELDS] : [];
}
