"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { Bookmark, LayoutGrid, GripVertical, Settings2, Plus, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Select, SelectOption } from "@board/components/ui/select";
import { WidgetConfigDialog } from "@board/components/dashboard/widget-config-dialog";
import type { WidgetFilterFieldOptions } from "@board/components/dashboard/widget-filter-editor";
import {
  DASHBOARD_WIDGET_KINDS,
  WIDGET_META,
  newWidgetInstance,
  type WidgetInstance,
  type WidgetKind,
} from "@board/lib/dashboard-widgets";
import {
  type DashboardViewConfig,
  encodeDashboardViewConfig,
  decodeDashboardViewConfig,
} from "@board/lib/dashboard-views";

export type DashboardViewOption = {
  id: string;
  name: string;
  visibility: "self" | "shared";
  config: DashboardViewConfig;
  mine: boolean;
};

// The Widgets/Views control for a Dashboard/Team Dashboard page —
// structurally mirrors src/components/work-items/view-toolbar.tsx
// (URL-carried working config, "Update"/"Save as new"/"Clear" actions, a
// visibility Select in the save dialog) but composes widget INSTANCES —
// each with its own filter/group-by/team config — instead of filter/sort/
// group-by for a Work Item list. The add/remove/reorder list follows
// backlog-list.tsx's exact dnd-kit idiom.
export function DashboardViewToolbar({
  teamId,
  initialViews,
  defaultWidgets,
  fieldOptions,
  teamPickOptions,
}: {
  /** null = Org Dashboard; set = that Team's own Dashboard. */
  teamId: string | null;
  initialViews: DashboardViewOption[];
  defaultWidgets: WidgetInstance[];
  fieldOptions: WidgetFilterFieldOptions;
  teamPickOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showTeamFilterField = teamId === null;

  const [config, setConfig] = useState<DashboardViewConfig>(() => {
    const raw = searchParams.get("dv");
    return raw ? decodeDashboardViewConfig(raw) : { widgets: defaultWidgets };
  });
  const [views, setViews] = useState(initialViews);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveVisibility, setSaveVisibility] = useState<"self" | "shared">("self");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const apiBase = "/dashboard/board/api/dashboard-views";

  function pushConfig(next: DashboardViewConfig) {
    setConfig(next);
    const params = new URLSearchParams(searchParams.toString());
    const isDefault = JSON.stringify(next.widgets) === JSON.stringify(defaultWidgets);
    if (isDefault) {
      params.delete("dv");
    } else {
      params.set("dv", encodeDashboardViewConfig(next));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function addWidget(kind: WidgetKind) {
    pushConfig({ widgets: [...config.widgets, newWidgetInstance(kind)] });
  }
  function removeWidget(id: string) {
    pushConfig({ widgets: config.widgets.filter((w) => w.id !== id) });
  }
  function updateWidget(next: WidgetInstance) {
    pushConfig({ widgets: config.widgets.map((w) => (w.id === next.id ? next : w)) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = config.widgets.findIndex((w) => w.id === active.id);
    const newIndex = config.widgets.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    pushConfig({ widgets: arrayMove(config.widgets, oldIndex, newIndex) });
  }

  function applyView(view: DashboardViewOption) {
    setSelectedViewId(view.id);
    pushConfig(view.config);
  }
  function clearView() {
    setSelectedViewId(null);
    pushConfig({ widgets: defaultWidgets });
  }
  async function saveNewView() {
    if (!saveName.trim()) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, name: saveName.trim(), visibility: saveVisibility, config }),
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
    toast.success(`Saved "${view.name}".`);
  }
  async function updateSelectedView() {
    if (!selectedViewId) return;
    const res = await fetch(`${apiBase}/${selectedViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Couldn't update this View.");
      return;
    }
    const { view } = await res.json();
    setViews((prev) => prev.map((v) => (v.id === view.id ? view : v)));
    toast.success(`Updated "${view.name}".`);
  }
  async function deleteView(viewId: string) {
    const res = await fetch(`${apiBase}/${viewId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Couldn't delete this View.");
      return;
    }
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    if (selectedViewId === viewId) clearView();
  }

  const selectedView = views.find((v) => v.id === selectedViewId) ?? null;
  const configuringInstance = config.widgets.find((w) => w.id === configuring) ?? null;

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
              <p className="text-slate px-2 py-2 text-xs">No saved Dashboard Views yet.</p>
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
                        {v.visibility === "shared" ? (teamId ? "Everyone on this Team" : "Everyone in the Org") : "Only me"}
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
                  Update &quot;{selectedView?.name}&quot; with current widgets
                </button>
              )}
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                className="text-primary hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs font-medium"
              >
                Save current as new View…
              </button>
              <button
                type="button"
                onClick={clearView}
                className="text-slate hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs"
              >
                Clear (default widgets)
              </button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <Dialog.Root open={saveOpen} onOpenChange={setSaveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay bg-ink/40 fixed inset-0 z-50" />
          <Dialog.Content className="radix-content border-border bg-panel fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-lg border p-4 shadow-lg focus:outline-none">
            <Dialog.Title className="text-ink mb-3 text-sm font-semibold">
              Save current Dashboard View
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
              onValueChange={(v) => setSaveVisibility(v as "self" | "shared")}
              className="mb-2 h-8 w-full"
            >
              <SelectOption value="self">Only me</SelectOption>
              <SelectOption value="shared">{teamId ? "Everyone on this Team" : "Everyone in the Org"}</SelectOption>
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

      {/* Widgets */}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className="border-border bg-panel text-ink hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-2xs"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Widgets
            <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {config.widgets.length}
            </span>
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="radix-content border-border bg-panel z-50 w-80 rounded-lg border p-2 shadow-md"
          >
            <p className="text-slate mb-2 px-1 text-[11px]">
              Add, reorder, and configure the widgets shown here.
            </p>
            {config.widgets.length === 0 ? (
              <p className="text-slate px-1 py-2 text-xs">No widgets yet — add one below.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={config.widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                  <ul className="mb-2 space-y-0.5">
                    {config.widgets.map((w) => (
                      <SortableWidgetRow
                        key={w.id}
                        instance={w}
                        onConfigure={() => setConfiguring(w.id)}
                        onRemove={() => removeWidget(w.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
            <div className="border-border border-t pt-2">
              <p className="text-slate mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider">
                Add a widget
              </p>
              <div className="flex flex-wrap gap-1 px-1">
                {DASHBOARD_WIDGET_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addWidget(kind)}
                    className="border-border bg-surface text-ink hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
                  >
                    <Plus className="h-3 w-3" />
                    {WIDGET_META[kind].label}
                  </button>
                ))}
              </div>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {configuringInstance && (
        <WidgetConfigDialog
          open={configuring !== null}
          onOpenChange={(open) => {
            if (!open) setConfiguring(null);
          }}
          instance={configuringInstance}
          onSave={updateWidget}
          fieldOptions={fieldOptions}
          teamPickOptions={teamPickOptions}
          showTeamFilterField={showTeamFilterField}
        />
      )}
    </div>
  );
}

function SortableWidgetRow({
  instance,
  onConfigure,
  onRemove,
}: {
  instance: WidgetInstance;
  onConfigure: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${instance.title ?? WIDGET_META[instance.kind].label}`}
        className="text-slate/60 hover:text-slate flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="flex-1 truncate px-1 py-1.5 text-xs text-ink" title={instance.title ?? WIDGET_META[instance.kind].label}>
        {instance.title ?? WIDGET_META[instance.kind].label}
        <span className="text-slate ml-1.5 text-[10px]">{WIDGET_META[instance.kind].label}</span>
      </span>
      <button
        type="button"
        aria-label="Configure widget"
        onClick={onConfigure}
        className="text-slate hover:bg-muted hover:text-ink shrink-0 rounded-md p-1"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Remove widget"
        onClick={onRemove}
        className="text-slate hover:bg-status-blocked-bg hover:text-status-blocked shrink-0 rounded-md p-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
