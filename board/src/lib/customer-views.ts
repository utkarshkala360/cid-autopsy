// Filter/sort/group-by field registry for the Customers list. Built on the
// generic engine in view-config.ts — see that file's header, and
// initiative-views.ts for the sibling registry this mirrors.
//
// `journeyStage` is only meaningful when Module A (Customer Journey) is
// org-enabled — callers gate it out via `customerFilterableFields`/
// `customerGroupableFields` using the live `customer` StageTrack's `enabled`
// flag (src/lib/stage-tracks.ts), same pattern the detail page already uses
// to hide the macro-stage picker when the module is off. `customerTemplateId`
// is gated the same way but on data presence, not a module toggle — hidden
// when the org has zero Customer Templates (nothing to filter/group by).

import type { ViewConfig } from "@board/lib/view-config";
import type { FieldMeta } from "@board/components/shared/filter-sort-group-toolbar";

export const CUSTOMER_FILTERABLE_FIELDS = ["journeyStage", "customerTemplateId", "createdBy"] as const;
export type CustomerFilterField = (typeof CUSTOMER_FILTERABLE_FIELDS)[number];

export const CUSTOMER_SORTABLE_FIELDS = ["name", "createdAt", "updatedAt"] as const;
export type CustomerSortField = (typeof CUSTOMER_SORTABLE_FIELDS)[number];

export const CUSTOMER_GROUPABLE_FIELDS = ["journeyStage", "customerTemplateId"] as const;
export type CustomerGroupField = (typeof CUSTOMER_GROUPABLE_FIELDS)[number];

export type CustomerViewConfig = ViewConfig<CustomerFilterField, CustomerSortField, CustomerGroupField>;

export const CUSTOMER_FIELD_META: Record<CustomerFilterField, FieldMeta> = {
  journeyStage: { label: "Journey stage", kind: "multi-select", allowUnassigned: true },
  customerTemplateId: { label: "Template", kind: "multi-select", allowUnassigned: true },
  createdBy: { label: "Created by", kind: "multi-select" },
};

export const CUSTOMER_SORT_FIELD_LABEL: Record<CustomerSortField, string> = {
  name: "Name",
  createdAt: "Created",
  updatedAt: "Updated",
};

export const CUSTOMER_GROUP_FIELD_LABEL: Record<CustomerGroupField, string> = {
  journeyStage: "Journey stage",
  customerTemplateId: "Template",
};

export function customerFilterableFields(
  journeyEnabled: boolean,
  templatesAvailable: boolean
): CustomerFilterField[] {
  return CUSTOMER_FILTERABLE_FIELDS.filter((f) => {
    if (f === "journeyStage") return journeyEnabled;
    if (f === "customerTemplateId") return templatesAvailable;
    return true;
  });
}

export function customerGroupableFields(
  journeyEnabled: boolean,
  templatesAvailable: boolean
): CustomerGroupField[] {
  return CUSTOMER_GROUPABLE_FIELDS.filter((f) => {
    if (f === "journeyStage") return journeyEnabled;
    if (f === "customerTemplateId") return templatesAvailable;
    return true;
  });
}
