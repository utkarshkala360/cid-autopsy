"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, GripVertical } from "lucide-react";
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
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STAGE_TRACK_ENTITY_LABEL, type StageTrackEntityType, type StageDef } from "@board/lib/stage-track-types";

export type StageTrackRow = {
  id: string;
  entityType: StageTrackEntityType;
  name: string;
  enabled: boolean;
  stages: StageDef[];
};

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Reorder + rename + remove idiom, reusing @dnd-kit/core + @dnd-kit/sortable
// exactly as backlog-list.tsx (Backlog drag-to-reorder) and
// dashboard-view-toolbar.tsx (the Dashboard widget picker) already
// established — not a new drag pattern (Non-Negotiable #6-adjacent
// consistency).
function SortableStageChip({
  stage,
  onRelabel,
  onRemove,
}: {
  stage: StageDef;
  onRelabel: (label: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab text-slate hover:text-ink"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={stage.label}
        onChange={(e) => onRelabel(e.target.value)}
        className="h-7 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs text-ink focus:border-primary focus:bg-panel focus:outline-none"
      />
      <span className="shrink-0 font-mono text-[10px] text-slate">{stage.key}</span>
      <button
        type="button"
        aria-label={`Remove ${stage.label}`}
        onClick={onRemove}
        className="text-slate hover:text-status-blocked"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TrackPanel({
  track,
  onSaved,
}: {
  track: StageTrackRow;
  onSaved: (updated: StageTrackRow) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(track.name);
  const [enabled, setEnabled] = useState(track.enabled);
  const [stages, setStages] = useState<StageDef[]>(track.stages);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.key === active.id);
    const newIndex = stages.findIndex((s) => s.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setStages(arrayMove(stages, oldIndex, newIndex));
  }

  function addStage() {
    const label = newLabel.trim();
    if (!label) return;
    const key = slugify(label);
    if (!key || stages.some((s) => s.key === key)) {
      setMessage({ type: "error", text: "That stage already exists." });
      return;
    }
    setStages((prev) => [...prev, { key, label }]);
    setNewLabel("");
    setMessage(null);
  }

  function removeStage(key: string) {
    setStages((prev) => prev.filter((s) => s.key !== key));
  }

  function relabelStage(key: string, label: string) {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, label } : s)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/dashboard/board/api/stage-tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled, stages }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: body.error ?? "Something went wrong." });
      return;
    }
    setMessage({ type: "success", text: "Saved." });
    onSaved({ ...track, name, enabled, stages });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
            {STAGE_TRACK_ENTITY_LABEL[track.entityType]}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-8 rounded-md border border-border bg-surface px-2 text-sm font-medium text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${name} enabled`}
          onClick={() => setEnabled((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-panel shadow-xs transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {stages.length === 0 ? (
        <p className="mb-3 text-xs text-slate">No stages yet — add one below.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.key)} strategy={verticalListSortingStrategy}>
            <div className="mb-3 flex flex-col gap-1.5">
              {stages.map((s) => (
                <SortableStageChip
                  key={s.key}
                  stage={s}
                  onRelabel={(label) => relabelStage(s.key, label)}
                  onRemove={() => removeStage(s.key)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-end gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New stage label"
          className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={addStage}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-ink hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {message && (
        <p
          className={`mt-2 text-xs font-medium ${
            message.type === "error" ? "text-status-blocked" : "text-status-done"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// Design 1 (Phase 16): replaces ModuleToggles — 4 rows (Customer/Initiative/
// Team/Work Item) instead of 2 fixed booleans, each with an editable name,
// enabled toggle, and a fully CRUD stage list (add/rename/reorder/remove),
// not a fixed JOURNEY_STAGES/LIFECYCLE_STAGES array.
export function StageTrackManager({ initialTracks }: { initialTracks: StageTrackRow[] }) {
  const [tracks, setTracks] = useState(initialTracks);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {tracks.map((t) => (
        <TrackPanel
          key={t.id}
          track={t}
          onSaved={(updated) => setTracks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
        />
      ))}
    </div>
  );
}
