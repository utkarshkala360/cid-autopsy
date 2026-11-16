"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABEL,
  type StatusCategory,
} from "@board/lib/status-categories";
import { Select, SelectOption } from "@board/components/ui/select";
import { STAGE_NUDGE_ENTITY_LABEL, type StageNudgeEntity } from "@board/lib/stage-nudge-types";
import { REQUIRABLE_FIELDS, REQUIRABLE_FIELD_LABEL } from "@board/lib/transition-requirements";

type StageOption = { key: string; label: string };

type StageNudge = { entity: StageNudgeEntity; stage: string } | null | undefined;
type StatusRow = {
  key: string;
  label: string;
  category: StatusCategory;
  stageNudge?: StageNudge;
  wipLimit?: number | null;
};
type TransitionPair = { from: string; to: string; requiredFields?: string[] };

const inputClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function WorkflowEditor({
  teamId,
  type,
  initialStatuses,
  initialTransitions,
  journeyModuleEnabled = false,
  lifecycleModuleEnabled = false,
  journeyStages = [],
  lifecycleStages = [],
}: {
  teamId: string;
  type: string;
  initialStatuses: StatusRow[];
  initialTransitions: TransitionPair[];
  // XM-3: which macro-stage entities this Org has turned on — only those
  // are offered as a "suggest this stage" target below (CJ-5/PL-5: a Stage
  // Track that's off stays completely invisible, not just disabled).
  journeyModuleEnabled?: boolean;
  lifecycleModuleEnabled?: boolean;
  // Phase 16 (Design 1, StageTrack generalization): the live `customer`/
  // `initiative` StageTrack stage lists — this client component can no
  // longer import the old fixed JOURNEY_STAGES/LIFECYCLE_STAGES arrays
  // directly (they're gone), so its server-rendered parent fetches and
  // passes them down.
  journeyStages?: StageOption[];
  lifecycleStages?: StageOption[];
}) {
  const [statuses, setStatuses] = useState<StatusRow[]>(initialStatuses);
  const [transitions, setTransitions] = useState<Set<string>>(
    new Set(initialTransitions.map((t) => `${t.from}|${t.to}`))
  );
  // WF-4: keyed by the same "from|to" pair the transitions Set uses — kept
  // separate rather than folded into TransitionPair objects so toggling a
  // transition on/off in the matrix doesn't need to hunt for/rebuild an
  // object; a pair's required fields just ride along if it gets re-enabled.
  const [requiredFieldsMap, setRequiredFieldsMap] = useState<Map<string, string[]>>(
    new Map(initialTransitions.map((t) => [`${t.from}|${t.to}`, t.requiredFields ?? []]))
  );
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<StatusCategory>("todo");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );

  function addStatus() {
    const label = newLabel.trim();
    if (!label) return;
    const key = slugify(label);
    if (!key || statuses.some((s) => s.key === key)) {
      setMessage({ type: "error", text: "That status already exists." });
      return;
    }
    const nextStatuses = [...statuses, { key, label, category: newCategory }];
    // New status starts connected to/from every existing status (open graph).
    const nextTransitions = new Set(transitions);
    for (const s of statuses) {
      nextTransitions.add(`${s.key}|${key}`);
      nextTransitions.add(`${key}|${s.key}`);
    }
    setStatuses(nextStatuses);
    setTransitions(nextTransitions);
    setNewLabel("");
    setMessage(null);
  }

  function removeStatus(key: string) {
    if (statuses.length <= 1) {
      setMessage({ type: "error", text: "At least one status is required." });
      return;
    }
    setStatuses((prev) => prev.filter((s) => s.key !== key));
    setTransitions((prev) => {
      const next = new Set<string>();
      for (const pair of prev) {
        const [from, to] = pair.split("|");
        if (from !== key && to !== key) next.add(pair);
      }
      return next;
    });
  }

  function setStageNudge(key: string, nudge: StageNudge) {
    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, stageNudge: nudge } : s)));
  }

  function setWipLimit(key: string, value: number | null) {
    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, wipLimit: value } : s)));
  }

  function toggleTransition(from: string, to: string) {
    setTransitions((prev) => {
      const next = new Set(prev);
      const pair = `${from}|${to}`;
      if (next.has(pair)) next.delete(pair);
      else next.add(pair);
      return next;
    });
  }

  function toggleRequiredField(pair: string, field: string) {
    setRequiredFieldsMap((prev) => {
      const next = new Map(prev);
      const current = next.get(pair) ?? [];
      next.set(
        pair,
        current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
      );
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/workflow`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        statuses,
        transitions: [...transitions].map((pair) => {
          const [from, to] = pair.split("|");
          return { from, to, requiredFields: requiredFieldsMap.get(pair) ?? [] };
        }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: body.error ?? "Something went wrong." });
      return;
    }
    setMessage({ type: "success", text: "Workflow saved." });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">New status label</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. In Review"
            className={`${inputClass} w-48`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Category</label>
          <Select
            value={newCategory}
            onValueChange={(v) => setNewCategory(v as StatusCategory)}
            className={inputClass}
          >
            {STATUS_CATEGORIES.map((c) => (
              <SelectOption key={c} value={c}>
                {STATUS_CATEGORY_LABEL[c]}
              </SelectOption>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={addStatus}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Add status
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-ink"
          >
            {s.label}
            <span className="text-[10px] text-slate">({STATUS_CATEGORY_LABEL[s.category]})</span>
            <button
              type="button"
              aria-label={`Remove ${s.label}`}
              onClick={() => removeStatus(s.key)}
              className="text-slate hover:text-status-blocked"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-ink">WIP limits (BD-5)</div>
        <p className="mb-2 text-[11px] text-slate">
          Optional per-column cap on the board — past this count the column shows a soft warning,
          it never blocks a drop.
        </p>
        <div className="flex flex-wrap gap-3">
          {statuses.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5 text-xs text-ink">
              <span className="w-28 shrink-0 truncate">{s.label}</span>
              <input
                type="number"
                min={1}
                max={999}
                value={s.wipLimit ?? ""}
                onChange={(e) =>
                  setWipLimit(s.key, e.target.value === "" ? null : Math.max(1, Number(e.target.value)))
                }
                placeholder="No limit"
                className={`${inputClass} w-24`}
              />
            </label>
          ))}
        </div>
      </div>

      {(journeyModuleEnabled || lifecycleModuleEnabled) && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink">Macro stage suggestions (XM-3)</div>
          <p className="mb-2 text-[11px] text-slate">
            When a Work Item moves to a status below, suggest advancing the linked Customer&apos;s
            or Initiative&apos;s macro stage — never applied automatically.
          </p>
          <div className="space-y-1.5">
            {statuses.map((s) => {
              const entity = s.stageNudge?.entity ?? "__none__";
              const stageOptions =
                s.stageNudge?.entity === "journeyStage"
                  ? journeyStages
                  : s.stageNudge?.entity === "lifecycleStage"
                    ? lifecycleStages
                    : [];
              return (
                <div key={s.key} className="flex flex-wrap items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs text-ink">{s.label}</span>
                  <Select
                    value={entity}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setStageNudge(s.key, null);
                        return;
                      }
                      const e = v as StageNudgeEntity;
                      const defaultStage = (e === "journeyStage" ? journeyStages : lifecycleStages)[0]?.key;
                      if (!defaultStage) return;
                      setStageNudge(s.key, { entity: e, stage: defaultStage });
                    }}
                    className={`${inputClass} w-44`}
                  >
                    <SelectOption value="__none__">No suggestion</SelectOption>
                    {journeyModuleEnabled && (
                      <SelectOption value="journeyStage">
                        {STAGE_NUDGE_ENTITY_LABEL.journeyStage}
                      </SelectOption>
                    )}
                    {lifecycleModuleEnabled && (
                      <SelectOption value="lifecycleStage">
                        {STAGE_NUDGE_ENTITY_LABEL.lifecycleStage}
                      </SelectOption>
                    )}
                  </Select>
                  {s.stageNudge && (
                    <Select
                      value={s.stageNudge.stage}
                      onValueChange={(v) => setStageNudge(s.key, { entity: s.stageNudge!.entity, stage: v })}
                      className={`${inputClass} w-40`}
                    >
                      {stageOptions.map((opt) => (
                        <SelectOption key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectOption>
                      ))}
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium text-ink">
          Allowed transitions (from row → to column)
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-slate">From \ To</th>
                {statuses.map((s) => (
                  <th key={s.key} className="p-1.5 text-center font-medium text-slate">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((from) => (
                <tr key={from.key} className="border-t border-border">
                  <td className="p-1.5 font-medium text-ink">{from.label}</td>
                  {statuses.map((to) => (
                    <td key={to.key} className="p-1.5 text-center">
                      {from.key === to.key ? (
                        <span className="text-slate">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={transitions.has(`${from.key}|${to.key}`)}
                          onChange={() => toggleTransition(from.key, to.key)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {transitions.size > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink">Required fields per transition (WF-4)</div>
          <p className="mb-2 text-[11px] text-slate">
            Block a transition until these fields are already filled in (or set in the same edit).
          </p>
          <div className="space-y-1.5">
            {[...transitions].map((pair) => {
              const [from, to] = pair.split("|");
              const fromLabel = statuses.find((s) => s.key === from)?.label ?? from;
              const toLabel = statuses.find((s) => s.key === to)?.label ?? to;
              const required = requiredFieldsMap.get(pair) ?? [];
              return (
                <div key={pair} className="flex flex-wrap items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs text-ink">
                    {fromLabel} → {toLabel}
                  </span>
                  {REQUIRABLE_FIELDS.map((f) => (
                    <label key={f} className="inline-flex items-center gap-1 text-[11px] text-ink">
                      <input
                        type="checkbox"
                        checked={required.includes(f)}
                        onChange={() => toggleRequiredField(pair, f)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {REQUIRABLE_FIELD_LABEL[f]}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <p
          className={`text-xs font-medium ${
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
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Workflow"}
      </button>
    </div>
  );
}
