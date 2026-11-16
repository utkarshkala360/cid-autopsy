"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { Bookmark, X } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";
import { type MultiSelectOption } from "@board/components/ui/multi-select";
import {
  FilterSortGroupToolbar,
  type FieldMeta,
} from "@board/components/shared/filter-sort-group-toolbar";
import {
  type ViewConfig,
  type FilterField,
  type SortField,
  type GroupByField,
  EMPTY_VIEW_CONFIG,
  encodeViewConfig,
  decodeViewConfig,
  isEmptyViewConfig,
  FILTERABLE_FIELDS,
} from "@board/lib/work-item-views";

const FIELD_LABEL: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  reporter: "Reporter",
  labels: "Labels",
  customerId: "Customer",
  initiativeId: "Initiative",
  teamInitiativeId: "Sprint",
  dueDate: "Due date",
};

const FIELDS: Record<FilterField, FieldMeta> = Object.fromEntries(
  FILTERABLE_FIELDS.map((f) => [
    f,
    {
      label: FIELD_LABEL[f],
      kind: f === "dueDate" ? "date" : "multi-select",
      allowUnassigned: f === "assignee" || f === "reporter",
    } satisfies FieldMeta,
  ])
) as Record<FilterField, FieldMeta>;

const SORT_FIELD_LABEL: Record<SortField, string> = {
  title: "Title",
  key: "Key",
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  dueDate: "Due date",
  createdAt: "Created",
  updatedAt: "Updated",
};

const GROUP_FIELD_LABEL: Record<GroupByField, string> = {
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  customerId: "Customer",
  initiativeId: "Initiative",
  teamInitiativeId: "Sprint",
};

export type SavedViewOption = {
  id: string;
  name: string;
  visibility: "self" | "team";
  config: ViewConfig;
  mine: boolean;
};

// The one control surface for filter/sort/group-by + saved Views, shared by
// the Work Items list (full read-write) and the Board view (filter-only —
// see its own usage, which just omits the sort/group-by/save controls).
// Config lives in the URL (`?view=<encoded ViewConfig>`) so it's
// shareable/bookmarkable and the server page loader can build the Mongo
// query + apply sort/group-by from a plain searchParams read, no client
// round-trip needed for the first render.
export function ViewToolbar({
  teamId,
  type,
  fieldOptions,
  initialViews,
  showSortAndGroup = true,
}: {
  teamId: string;
  type: string;
  fieldOptions: Record<Exclude<FilterField, "dueDate">, MultiSelectOption[]>;
  initialViews: SavedViewOption[];
  showSortAndGroup?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [config, setConfig] = useState<ViewConfig>(() => decodeViewConfig(searchParams.get("view")));
  const [views, setViews] = useState(initialViews);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveVisibility, setSaveVisibility] = useState<"self" | "team">("self");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pushConfig(next: ViewConfig) {
    setConfig(next);
    const params = new URLSearchParams(searchParams.toString());
    if (isEmptyViewConfig(next)) {
      params.delete("view");
    } else {
      params.set("view", encodeViewConfig(next));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  // --- Saved Views ---
  function applyView(view: SavedViewOption) {
    setSelectedViewId(view.id);
    pushConfig(view.config);
  }
  function clearView() {
    setSelectedViewId(null);
    pushConfig(EMPTY_VIEW_CONFIG);
  }
  async function saveNewView() {
    if (!saveName.trim()) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/saved-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name: saveName.trim(), visibility: saveVisibility, config }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Something went wrong.");
      return;
    }
    const { view } = await res.json();
    setViews((prev) => [...prev, view]);
    setSelectedViewId(view.id);
    setSaveOpen(false);
    setSaveName("");
  }
  async function updateSelectedView() {
    if (!selectedViewId) return;
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/saved-views/${selectedViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!res.ok) return;
    const { view } = await res.json();
    setViews((prev) => prev.map((v) => (v.id === view.id ? view : v)));
  }
  async function deleteView(viewId: string) {
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/saved-views/${viewId}`, { method: "DELETE" });
    if (!res.ok) return;
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    if (selectedViewId === viewId) clearView();
  }

  const activeFilterCount = config.filters.groups.reduce((n, g) => n + g.conditions.length, 0);
  const selectedView = views.find((v) => v.id === selectedViewId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Views */}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className="border-border bg-panel text-ink hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-2xs"
          >
            <Bookmark className="h-3.5 w-3.5" />
            {selectedView ? selectedView.name : "Views"}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="radix-content border-border bg-panel z-50 w-64 rounded-lg border p-1 shadow-md"
          >
            {views.length === 0 ? (
              <p className="text-slate px-2 py-2 text-xs">No saved Views yet.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {views.map((v) => (
                  <li key={v.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyView(v)}
                      className={`flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                        v.id === selectedViewId ? "bg-muted text-ink font-medium" : "text-ink hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{v.name}</span>
                      <span className="text-slate shrink-0 text-[10px]">
                        {v.visibility === "team" ? "Everyone" : "Only me"}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => deleteView(v.id)}
                      className="text-slate hover:bg-status-blocked-bg hover:text-status-blocked shrink-0 rounded-md p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-border mt-1 border-t pt-1">
              {selectedViewId && (
                <button
                  type="button"
                  onClick={updateSelectedView}
                  className="text-primary hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs font-medium"
                >
                  Update &quot;{selectedView?.name}&quot; with current filters
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSaveOpen(true);
                }}
                className="text-primary hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs font-medium"
              >
                Save current as new View…
              </button>
              {(selectedViewId || activeFilterCount > 0 || config.sort.length > 0 || config.groupBy) && (
                <button
                  type="button"
                  onClick={clearView}
                  className="text-slate hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs"
                >
                  Clear (no View)
                </button>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <Dialog.Root open={saveOpen} onOpenChange={setSaveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay bg-ink/40 fixed inset-0 z-50" />
          <Dialog.Content className="radix-content border-border bg-panel fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-lg border p-4 shadow-lg focus:outline-none">
            <Dialog.Title className="text-ink mb-3 text-sm font-semibold">
              Save current View
            </Dialog.Title>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="View name…"
              className="border-border bg-surface text-ink focus:border-primary focus:ring-primary mb-2 h-8 w-full rounded-md border px-2.5 text-xs focus:ring-1 focus:outline-none"
            />
            <Select
              value={saveVisibility}
              onValueChange={(v) => setSaveVisibility(v as "self" | "team")}
              className="mb-2 h-8 w-full"
            >
              <SelectOption value="self">Only me</SelectOption>
              <SelectOption value="team">Everyone on this Team</SelectOption>
            </Select>
            {saveError && <p className="text-status-blocked mb-2 text-xs font-medium">{saveError}</p>}
            <div className="mt-1 flex justify-end gap-1.5">
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
                disabled={!saveName.trim() || saving}
                onClick={saveNewView}
                className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <FilterSortGroupToolbar
        fields={FIELDS}
        fieldOptions={fieldOptions}
        sortFields={SORT_FIELD_LABEL}
        groupFields={GROUP_FIELD_LABEL}
        showSortAndGroup={showSortAndGroup}
        config={config}
        onConfigChange={pushConfig}
      />
    </div>
  );
}
