"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Select, SelectOption } from "@board/components/ui/select";
import { WidgetFilterEditor, type WidgetFilterFieldOptions } from "@board/components/dashboard/widget-filter-editor";
import { DASHBOARD_FILTER_FIELDS, type DashboardFilterField } from "@board/lib/dashboard-filters";
import { DASHBOARD_GROUP_BY_FIELDS, type DashboardGroupByField } from "@board/lib/dashboard-breakdown";
import { WIDGET_META, type WidgetInstance } from "@board/lib/dashboard-widgets";
import { CATEGORY_CHART_TYPES, BURNDOWN_CHART_TYPES, VELOCITY_CHART_TYPES } from "@board/lib/chart-types";

const GROUP_BY_LABEL: Record<DashboardGroupByField, string> = {
  priority: "Priority",
  statusCategory: "Status",
  assignee: "Assignee",
  customerId: "Customer",
  initiativeId: "Initiative",
  teamId: "Team",
  labels: "Labels",
};

const CATEGORY_CHART_TYPE_LABEL: Record<(typeof CATEGORY_CHART_TYPES)[number], string> = {
  bar: "Bar",
  stacked_bar: "Stacked bar",
  grouped_bar: "Grouped bar",
  donut: "Donut",
  lollipop: "Lollipop",
};

const BURNDOWN_CHART_TYPE_LABEL: Record<(typeof BURNDOWN_CHART_TYPES)[number], string> = {
  burndown: "Burndown",
  burnup: "Burnup",
};

const VELOCITY_CHART_TYPE_LABEL: Record<(typeof VELOCITY_CHART_TYPES)[number], string> = {
  bar: "Bar",
  line: "Line",
};

// Per-widget configuration — title override, plus whatever this kind
// supports (breakdown: group-by + filters; summary: filters only;
// burndown/velocity: which Team, only asked when the page itself doesn't
// already fix one — see WidgetGridScope.fixedTeamId). One Dialog handles
// every kind via the same discriminated WidgetInstance, so a new
// configurable attribute is a new form section here, not a new dialog.
export function WidgetConfigDialog({
  open,
  onOpenChange,
  instance,
  onSave,
  fieldOptions,
  teamPickOptions,
  showTeamFilterField,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WidgetInstance;
  onSave: (next: WidgetInstance) => void;
  fieldOptions: WidgetFilterFieldOptions;
  teamPickOptions: { value: string; label: string }[];
  /** Team Dashboards fix the Team implicitly — the "Team" filter condition and the burndown/velocity Team picker are both redundant there. */
  showTeamFilterField: boolean;
}) {
  const [draft, setDraft] = useState<WidgetInstance>(instance);

  function reset(next: WidgetInstance) {
    setDraft(next);
  }

  function save() {
    onSave(draft);
    onOpenChange(false);
  }

  const availableFilterFields: readonly DashboardFilterField[] = showTeamFilterField
    ? DASHBOARD_FILTER_FIELDS
    : DASHBOARD_FILTER_FIELDS.filter((f) => f !== "teamId");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) reset(instance);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay bg-ink/40 fixed inset-0 z-50" />
        <Dialog.Content className="radix-content border-border bg-panel fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border p-4 shadow-lg focus:outline-none">
          <Dialog.Title className="text-ink mb-3 text-sm font-semibold">
            Configure {WIDGET_META[instance.kind].label}
          </Dialog.Title>

          <label className="mb-1 block text-[11px] font-medium text-slate">Title (optional)</label>
          <input
            value={draft.title ?? ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value } as WidgetInstance)}
            placeholder={WIDGET_META[instance.kind].label}
            className="border-border bg-surface text-ink focus:border-primary focus:ring-primary mb-3 h-8 w-full rounded-md border px-2.5 text-xs focus:ring-1 focus:outline-none"
          />

          {draft.kind === "breakdown" && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate">Group by</label>
              <Select
                value={draft.groupBy}
                onValueChange={(v) => setDraft({ ...draft, groupBy: v as DashboardGroupByField })}
                className="mb-3 h-8 w-full"
              >
                {DASHBOARD_GROUP_BY_FIELDS.filter((f) => showTeamFilterField || f !== "teamId").map((f) => (
                  <SelectOption key={f} value={f}>
                    {GROUP_BY_LABEL[f]}
                  </SelectOption>
                ))}
              </Select>

              <label className="mb-1 block text-[11px] font-medium text-slate">Chart style</label>
              <Select
                value={draft.chartType}
                onValueChange={(v) => setDraft({ ...draft, chartType: v } as WidgetInstance)}
                className="mb-3 h-8 w-full"
              >
                {CATEGORY_CHART_TYPES.map((t) => (
                  <SelectOption key={t} value={t}>
                    {CATEGORY_CHART_TYPE_LABEL[t]}
                  </SelectOption>
                ))}
              </Select>
            </>
          )}

          {(draft.kind === "burndown" || draft.kind === "velocity") && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate">Chart style</label>
              <Select
                value={draft.chartType}
                onValueChange={(v) => setDraft({ ...draft, chartType: v } as WidgetInstance)}
                className="mb-3 h-8 w-full"
              >
                {(draft.kind === "burndown" ? BURNDOWN_CHART_TYPES : VELOCITY_CHART_TYPES).map((t) => (
                  <SelectOption key={t} value={t}>
                    {draft.kind === "burndown"
                      ? BURNDOWN_CHART_TYPE_LABEL[t as (typeof BURNDOWN_CHART_TYPES)[number]]
                      : VELOCITY_CHART_TYPE_LABEL[t as (typeof VELOCITY_CHART_TYPES)[number]]}
                  </SelectOption>
                ))}
              </Select>
            </>
          )}

          {(draft.kind === "summary" || draft.kind === "breakdown") && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate">Filters</label>
              <WidgetFilterEditor
                config={draft.filters}
                onChange={(filters) => setDraft({ ...draft, filters } as WidgetInstance)}
                fieldOptions={fieldOptions}
                availableFields={availableFilterFields}
              />
            </>
          )}

          {(draft.kind === "burndown" || draft.kind === "velocity" || draft.kind === "estimate_vs_actual") && showTeamFilterField && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate">Team</label>
              <Select
                value={draft.teamId ?? "__none__"}
                onValueChange={(v) => setDraft({ ...draft, teamId: v === "__none__" ? null : v } as WidgetInstance)}
                className="h-8 w-full"
              >
                <SelectOption value="__none__">Choose a Team…</SelectOption>
                {teamPickOptions.map((t) => (
                  <SelectOption key={t.value} value={t.value}>
                    {t.label}
                  </SelectOption>
                ))}
              </Select>
            </>
          )}

          {(draft.kind === "burndown" || draft.kind === "velocity") && !showTeamFilterField && (
            <p className="text-slate text-xs">Scoped to this Team&apos;s own Sprints — no Team to pick here.</p>
          )}

          {draft.kind === "estimate_vs_actual" && !showTeamFilterField && (
            <p className="text-slate text-xs">Scoped to this Team&apos;s own time tracking — no extra configuration needed.</p>
          )}

          {draft.kind === "cycle_time" && (
            <p className="text-slate text-xs">
              Follows the page&apos;s own Team/Initiative filter — not independently filterable yet.
            </p>
          )}

          <div className="mt-4 flex justify-end gap-1.5">
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-slate hover:text-ink inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={save}
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-semibold"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
