"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ListFilter, ArrowUpDown, Layers, Plus, X } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@board/components/ui/multi-select";
import { DatePicker } from "@board/components/ui/date-picker";
import {
  UNASSIGNED_VALUE,
  type ViewConfig,
  type FilterCondition,
  type FilterGroup,
  type SortKey,
} from "@board/lib/view-config";

export type FieldMeta = {
  label: string;
  kind: "multi-select" | "date";
  /** Prepend an "Unassigned" option that maps to a real `null` match. Multi-select fields only. */
  allowUnassigned?: boolean;
};

/**
 * Generic filter/sort/group-by control surface — the Work Items,
 * Initiatives, and Customers lists' Filter/Sort/Group-by popovers are all
 * this one component with a different field registry, extracted from what
 * used to be Work-Item-only markup in view-toolbar.tsx once Initiatives and
 * Customers needed the same UI. Deliberately does NOT own Saved Views or
 * URL sync — those stay with the caller (Work Items' ViewToolbar wraps this
 * and adds both; Initiatives/Customers wrap this and add only URL sync).
 */
export function FilterSortGroupToolbar<
  F extends string,
  S extends string,
  G extends string,
  D extends F = never,
>({
  fields,
  fieldOptions,
  sortFields,
  groupFields,
  showSortAndGroup = true,
  config,
  onConfigChange,
}: {
  fields: Record<F, FieldMeta>;
  // Keyed loosely (not Partial<Record<F,...>>) so callers with a
  // module-gated field list (e.g. Initiatives/Customers with a macro-stage
  // field dropped when the module is off) can pass one options map built
  // for the full field set without excess-property errors against the
  // narrower `fields` actually in play.
  fieldOptions: Record<string, MultiSelectOption[]>;
  sortFields: Record<S, string>;
  groupFields: Record<G, string>;
  showSortAndGroup?: boolean;
  config: ViewConfig<F, S, G, D>;
  onConfigChange: (next: ViewConfig<F, S, G, D>) => void;
}) {
  const filterFieldKeys = Object.keys(fields) as F[];
  const sortFieldKeys = Object.keys(sortFields) as S[];
  const groupFieldKeys = Object.keys(groupFields) as G[];

  function newCondition(field: F): FilterCondition<F, D> {
    return fields[field].kind === "date"
      ? (({ field, operator: "after", value: null }) as unknown as FilterCondition<F, D>)
      : (({ field, operator: "is_any_of", values: [] }) as unknown as FilterCondition<F, D>);
  }

  // --- Filters ---
  function addGroup() {
    onConfigChange({
      ...config,
      filters: {
        groups: [
          ...config.filters.groups,
          { id: crypto.randomUUID(), conditions: [newCondition(filterFieldKeys[0])] },
        ],
      },
    });
  }
  function removeGroup(groupId: string) {
    onConfigChange({
      ...config,
      filters: { groups: config.filters.groups.filter((g) => g.id !== groupId) },
    });
  }
  function updateGroup(groupId: string, group: FilterGroup<F, D>) {
    onConfigChange({
      ...config,
      filters: { groups: config.filters.groups.map((g) => (g.id === groupId ? group : g)) },
    });
  }

  // --- Sort ---
  function addSortKey() {
    onConfigChange({ ...config, sort: [...config.sort, { field: sortFieldKeys[0], direction: "desc" }] });
  }
  function updateSortKey(i: number, key: SortKey<S>) {
    onConfigChange({ ...config, sort: config.sort.map((s, idx) => (idx === i ? key : s)) });
  }
  function removeSortKey(i: number) {
    onConfigChange({ ...config, sort: config.sort.filter((_, idx) => idx !== i) });
  }

  // --- Group by ---
  function setGroupBy(field: G | null) {
    onConfigChange({ ...config, groupBy: field });
  }

  const activeFilterCount = config.filters.groups.reduce((n, g) => n + g.conditions.length, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filters */}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className="border-border bg-panel text-ink hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-2xs"
          >
            <ListFilter className="h-3.5 w-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="radix-content border-border bg-panel z-50 w-[26rem] max-w-[90vw] space-y-3 rounded-lg border p-3 shadow-md"
          >
            {config.filters.groups.length === 0 ? (
              <p className="text-slate text-xs">No filters yet.</p>
            ) : (
              config.filters.groups.map((group, gi) => (
                <div key={group.id}>
                  {gi > 0 && (
                    <div className="text-slate my-2 flex items-center gap-2 text-[10px] font-semibold uppercase">
                      <span className="bg-border h-px flex-1" /> AND{" "}
                      <span className="bg-border h-px flex-1" />
                    </div>
                  )}
                  <div className="border-border space-y-1.5 rounded-md border p-2">
                    {group.conditions.map((cond, ci) => (
                      <div key={ci}>
                        {ci > 0 && <div className="text-slate my-1 text-[10px] font-semibold">OR</div>}
                        <ConditionRow
                          condition={cond}
                          fields={fields}
                          filterFieldKeys={filterFieldKeys}
                          fieldOptions={fieldOptions}
                          newCondition={newCondition}
                          onChange={(next) =>
                            updateGroup(group.id, {
                              ...group,
                              conditions: group.conditions.map((c, idx) => (idx === ci ? next : c)),
                            })
                          }
                          onRemove={() =>
                            updateGroup(group.id, {
                              ...group,
                              conditions: group.conditions.filter((_, idx) => idx !== ci),
                            })
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-3 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateGroup(group.id, {
                            ...group,
                            conditions: [...group.conditions, newCondition(filterFieldKeys[0])],
                          })
                        }
                        className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-[11px] font-medium"
                      >
                        <Plus className="h-3 w-3" />
                        Or condition
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGroup(group.id)}
                        className="text-slate hover:text-status-blocked text-[11px] font-medium"
                      >
                        Remove group
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={addGroup}
              className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              And condition group
            </button>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {showSortAndGroup && (
        <>
          {/* Sort */}
          <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                className="border-border bg-panel text-ink hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-2xs"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Sort
                {config.sort.length > 0 && (
                  <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                    {config.sort.length}
                  </span>
                )}
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="start"
                sideOffset={4}
                className="radix-content border-border bg-panel z-50 w-72 space-y-2 rounded-lg border p-3 shadow-md"
              >
                {config.sort.length === 0 ? (
                  <p className="text-slate text-xs">Unsorted.</p>
                ) : (
                  config.sort.map((key, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Select
                        value={key.field}
                        onValueChange={(v) => updateSortKey(i, { ...key, field: v as S })}
                        className="h-8 flex-1"
                      >
                        {sortFieldKeys.map((f) => (
                          <SelectOption key={f} value={f}>
                            {sortFields[f]}
                          </SelectOption>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() =>
                          updateSortKey(i, {
                            ...key,
                            direction: key.direction === "asc" ? "desc" : "asc",
                          })
                        }
                        className="border-border bg-surface text-ink hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs"
                        title={key.direction === "asc" ? "Ascending" : "Descending"}
                      >
                        {key.direction === "asc" ? "↑" : "↓"}
                      </button>
                      <button
                        type="button"
                        aria-label="Remove sort key"
                        onClick={() => removeSortKey(i)}
                        className="text-slate hover:text-status-blocked shrink-0 p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addSortKey}
                  className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add sort
                </button>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>

          {/* Group by */}
          {groupFieldKeys.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Layers className="text-slate h-3.5 w-3.5" />
              <Select
                value={config.groupBy ?? "__none__"}
                onValueChange={(v) => setGroupBy(v === "__none__" ? null : (v as G))}
                className="h-8 w-36"
              >
                <SelectOption value="__none__">No grouping</SelectOption>
                {groupFieldKeys.map((f) => (
                  <SelectOption key={f} value={f}>
                    Group by {groupFields[f]}
                  </SelectOption>
                ))}
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ConditionRow<F extends string, D extends F = never>({
  condition,
  fields,
  filterFieldKeys,
  fieldOptions,
  newCondition,
  onChange,
  onRemove,
}: {
  condition: FilterCondition<F, D>;
  fields: Record<F, FieldMeta>;
  filterFieldKeys: F[];
  fieldOptions: Record<string, MultiSelectOption[]>;
  newCondition: (field: F) => FilterCondition<F, D>;
  onChange: (next: FilterCondition<F, D>) => void;
  onRemove: () => void;
}) {
  const meta = fields[condition.field];
  const isDate = meta.kind === "date";

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={condition.field}
        onValueChange={(v) => onChange(newCondition(v as F))}
        className="h-8 w-28 shrink-0"
      >
        {filterFieldKeys.map((f) => (
          <SelectOption key={f} value={f}>
            {fields[f].label}
          </SelectOption>
        ))}
      </Select>

      {isDate ? (
        <>
          <Select
            value={condition.operator}
            onValueChange={(v) =>
              onChange({ ...condition, operator: v as typeof condition.operator } as FilterCondition<F, D>)
            }
            className="h-8 w-28 shrink-0"
          >
            <SelectOption value="before">Before</SelectOption>
            <SelectOption value="after">After</SelectOption>
            <SelectOption value="is_empty">Is empty</SelectOption>
            <SelectOption value="is_not_empty">Is not empty</SelectOption>
          </Select>
          {(condition.operator === "before" || condition.operator === "after") && (
            <DatePicker
              value={("value" in condition ? condition.value : null) ?? null}
              onChange={(v) => onChange({ ...condition, value: v } as FilterCondition<F, D>)}
              className="h-8 flex-1"
            />
          )}
        </>
      ) : (
        <>
          <Select
            value={condition.operator}
            onValueChange={(v) =>
              onChange({ ...condition, operator: v as typeof condition.operator } as FilterCondition<F, D>)
            }
            className="h-8 w-24 shrink-0"
          >
            <SelectOption value="is_any_of">Is any of</SelectOption>
            <SelectOption value="is_none_of">Is none of</SelectOption>
          </Select>
          <MultiSelect
            options={
              meta.allowUnassigned
                ? [
                    { value: UNASSIGNED_VALUE, label: "Unassigned" },
                    ...(fieldOptions[condition.field] ?? []),
                  ]
                : (fieldOptions[condition.field] ?? [])
            }
            selected={"values" in condition ? condition.values : []}
            onChange={(values) => onChange({ ...condition, values } as FilterCondition<F, D>)}
            className="h-8 flex-1"
          />
        </>
      )}

      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="text-slate hover:text-status-blocked shrink-0 p-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
