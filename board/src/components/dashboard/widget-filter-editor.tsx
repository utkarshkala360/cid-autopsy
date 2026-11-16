"use client";

import { Plus, X } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@board/components/ui/multi-select";
import {
  DASHBOARD_FILTER_FIELDS,
  newDashboardCondition,
  DASHBOARD_UNASSIGNED_VALUE,
  DASHBOARD_NO_VALUE,
  type DashboardFilterCondition,
  type DashboardFilterConfig,
  type DashboardFilterField,
} from "@board/lib/dashboard-filters";
import { PRIORITIES, PRIORITY_LABEL, STATUS_CATEGORIES, STATUS_CATEGORY_LABEL } from "@board/lib/status-categories";

const FIELD_LABEL: Record<DashboardFilterField, string> = {
  priority: "Priority",
  statusCategory: "Status",
  assignee: "Assignee",
  customerId: "Customer",
  initiativeId: "Initiative",
  labels: "Labels",
  teamId: "Team",
};

export type WidgetFilterFieldOptions = Record<Exclude<DashboardFilterField, "priority" | "statusCategory">, MultiSelectOption[]>;

// The AND-of-OR filter builder for a Dashboard/Team Dashboard widget
// instance — structurally the same two-level shape (and much of the same
// UI craft) as ConditionRow in src/components/work-items/view-toolbar.tsx,
// over src/lib/dashboard-filters.ts's smaller, Dashboard-specific field set
// instead of the Work Item list's (see that file's own comment for why
// they're deliberately separate engines, not a forced shared type).
export function WidgetFilterEditor({
  config,
  onChange,
  fieldOptions,
  availableFields = DASHBOARD_FILTER_FIELDS,
}: {
  config: DashboardFilterConfig;
  onChange: (next: DashboardFilterConfig) => void;
  fieldOptions: WidgetFilterFieldOptions;
  availableFields?: readonly DashboardFilterField[];
}) {
  function addGroup() {
    onChange({
      groups: [...config.groups, { id: crypto.randomUUID(), conditions: [newDashboardCondition(availableFields[0])] }],
    });
  }
  function removeGroup(groupId: string) {
    onChange({ groups: config.groups.filter((g) => g.id !== groupId) });
  }
  function updateGroup(groupId: string, conditions: DashboardFilterCondition[]) {
    onChange({ groups: config.groups.map((g) => (g.id === groupId ? { ...g, conditions } : g)) });
  }

  return (
    <div className="space-y-3">
      {config.groups.length === 0 ? (
        <p className="text-slate text-xs">No filters — every Work Item in scope counts.</p>
      ) : (
        config.groups.map((group, gi) => (
          <div key={group.id}>
            {gi > 0 && (
              <div className="text-slate my-2 flex items-center gap-2 text-[10px] font-semibold uppercase">
                <span className="bg-border h-px flex-1" /> AND <span className="bg-border h-px flex-1" />
              </div>
            )}
            <div className="border-border space-y-1.5 rounded-md border p-2">
              {group.conditions.map((cond, ci) => (
                <div key={ci}>
                  {ci > 0 && <div className="text-slate my-1 text-[10px] font-semibold">OR</div>}
                  <ConditionRow
                    condition={cond}
                    fieldOptions={fieldOptions}
                    availableFields={availableFields}
                    onChange={(next) =>
                      updateGroup(
                        group.id,
                        group.conditions.map((c, idx) => (idx === ci ? next : c))
                      )
                    }
                    onRemove={() =>
                      updateGroup(
                        group.id,
                        group.conditions.filter((_, idx) => idx !== ci)
                      )
                    }
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    updateGroup(group.id, [...group.conditions, newDashboardCondition(availableFields[0])])
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
    </div>
  );
}

function ConditionRow({
  condition,
  fieldOptions,
  availableFields,
  onChange,
  onRemove,
}: {
  condition: DashboardFilterCondition;
  fieldOptions: WidgetFilterFieldOptions;
  availableFields: readonly DashboardFilterField[];
  onChange: (next: DashboardFilterCondition) => void;
  onRemove: () => void;
}) {
  const options: MultiSelectOption[] =
    condition.field === "priority"
      ? PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))
      : condition.field === "statusCategory"
        ? STATUS_CATEGORIES.map((c) => ({ value: c, label: STATUS_CATEGORY_LABEL[c] }))
        : condition.field === "assignee"
          ? [{ value: DASHBOARD_UNASSIGNED_VALUE, label: "Unassigned" }, ...fieldOptions.assignee]
          : condition.field === "customerId"
            ? [{ value: DASHBOARD_NO_VALUE, label: "No Customer" }, ...fieldOptions.customerId]
            : condition.field === "initiativeId"
              ? [{ value: DASHBOARD_NO_VALUE, label: "No Initiative" }, ...fieldOptions.initiativeId]
              : condition.field === "teamId"
                ? fieldOptions.teamId
                : fieldOptions.labels;

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={condition.field}
        onValueChange={(v) => onChange(newDashboardCondition(v as DashboardFilterField))}
        className="h-8 w-28 shrink-0"
      >
        {availableFields.map((f) => (
          <SelectOption key={f} value={f}>
            {FIELD_LABEL[f]}
          </SelectOption>
        ))}
      </Select>
      <Select
        value={condition.operator}
        onValueChange={(v) => onChange({ ...condition, operator: v as DashboardFilterCondition["operator"] })}
        className="h-8 w-24 shrink-0"
      >
        <SelectOption value="is_any_of">Is any of</SelectOption>
        <SelectOption value="is_none_of">Is none of</SelectOption>
      </Select>
      <MultiSelect
        options={options}
        selected={condition.values}
        onChange={(values) => onChange({ ...condition, values })}
        className="h-8 flex-1"
      />
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
