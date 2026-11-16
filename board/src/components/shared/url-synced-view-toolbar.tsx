"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FilterSortGroupToolbar, type FieldMeta } from "@board/components/shared/filter-sort-group-toolbar";
import { type MultiSelectOption } from "@board/components/ui/multi-select";
import {
  encodeViewConfig,
  decodeViewConfig,
  isEmptyViewConfig,
  type ViewConfig,
} from "@board/lib/view-config";

/**
 * FilterSortGroupToolbar + URL sync, no Saved Views — for entities that
 * don't have that persistence layer (Initiatives, Customers). Work Items'
 * ViewToolbar (src/components/work-items/view-toolbar.tsx) does the same
 * URL-sync job itself alongside its Saved Views popover; this is the
 * Saved-Views-free equivalent, shared so Initiatives/Customers don't each
 * reimplement the `?view=` push/decode plumbing.
 */
export function UrlSyncedViewToolbar<F extends string, S extends string, G extends string>({
  fields,
  fieldOptions,
  sortFields,
  groupFields,
  showSortAndGroup = true,
}: {
  fields: Record<F, FieldMeta>;
  fieldOptions: Record<string, MultiSelectOption[]>;
  sortFields: Record<S, string>;
  groupFields: Record<G, string>;
  showSortAndGroup?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = decodeViewConfig<F, S, G>(searchParams.get("view"));

  function onConfigChange(next: ViewConfig<F, S, G>) {
    const params = new URLSearchParams(searchParams.toString());
    if (isEmptyViewConfig(next)) {
      params.delete("view");
    } else {
      params.set("view", encodeViewConfig(next));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <FilterSortGroupToolbar
      fields={fields}
      fieldOptions={fieldOptions}
      sortFields={sortFields}
      groupFields={groupFields}
      showSortAndGroup={showSortAndGroup}
      config={config}
      onConfigChange={onConfigChange}
    />
  );
}
