"use client";

import { useState } from "react";
import { Clock, Pencil, Trash2, X, Check } from "lucide-react";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { DatePicker } from "@board/components/ui/date-picker";
import { AddTimePopover } from "@board/components/work-items/add-time-popover";
import { fullDateTimeTitle } from "@board/lib/format-date";
import { formatWorkLogAmount } from "@board/lib/work-log-format";
import { toast } from "sonner";

export type WorkLogUnit = "story_points" | "hours_minutes";

export type WorkLogEntryView = {
  id: string;
  memberId: string;
  date: string; // ISO
  amount: number;
  unit: WorkLogUnit;
  note: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// WL-3: multiple entries per person/item/day are allowed — logging today
// again on the same item creates a new row rather than merging into an
// existing one, matching what was confirmed with the user. Hidden entirely
// (rendered nowhere) for a Team with no timeTrackingUnit configured, and for
// a Guest, same "invisible, not disabled" idiom SubtasksPanel/
// CollaboratorsPanel already use.
export function WorkLogPanel({
  teamId,
  itemId,
  unit,
  estimate,
  canEdit,
  canManageAll,
  currentMemberId,
  initialEntries,
  initialActualTotal,
  memberNames,
  memberEmails = {},
  onEstimateSave,
}: {
  teamId: string;
  itemId: string;
  unit: WorkLogUnit;
  estimate: number | null;
  canEdit: boolean;
  // Team Admin can edit/delete anyone's entry, not just their own.
  canManageAll: boolean;
  currentMemberId: string;
  initialEntries: WorkLogEntryView[];
  // WL-4: the denormalized rollup from WorkItem.actualTotal, kept in sync by
  // every mutation below from the server's response — not recomputed
  // client-side from `entries`, so it stays correct even though `entries`
  // only ever reflects this one client's view.
  initialActualTotal: number;
  memberNames: Record<string, string>;
  memberEmails?: Record<string, string>;
  onEstimateSave?: (value: number | null) => Promise<boolean>;
}) {
  const [entries, setEntries] = useState<WorkLogEntryView[]>(initialEntries);
  const [actualTotal, setActualTotal] = useState(initialActualTotal);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ hours: string; minutes: string; points: string; note: string }>({
    hours: "",
    minutes: "",
    points: "",
    note: "",
  });

  const [logDate, setLogDate] = useState(todayIso());
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");

  function amountFromInputs(h: string, m: string, p: string): number | null {
    if (unit === "hours_minutes") {
      const hVal = Number(h || 0);
      const mVal = Number(m || 0);
      if (Number.isNaN(hVal) || Number.isNaN(mVal) || (hVal === 0 && mVal === 0)) return null;
      return hVal * 60 + mVal;
    }
    const pVal = Number(p);
    if (Number.isNaN(pVal) || pVal <= 0) return null;
    return pVal;
  }

  async function submitEntry(amount: number, date: string, entryNote?: string): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${itemId}/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, amount, note: entryNote || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? "Could not log time.";
      setError(message);
      toast.error(message);
      return false;
    }
    const data = await res.json();
    setEntries((prev) => [
      {
        id: String(data.entry._id),
        memberId: String(data.entry.memberId),
        date: new Date(data.entry.date).toISOString(),
        amount: data.entry.amount,
        unit: data.entry.unit,
        note: data.entry.note ?? "",
      },
      ...prev,
    ]);
    setActualTotal(data.actualTotal);
    toast.success("Time logged.");
    return true;
  }

  async function handleLog() {
    const pVal = Number(points);
    if (Number.isNaN(pVal) || pVal <= 0) {
      setError("Enter a positive number of points.");
      return;
    }
    const ok = await submitEntry(pVal, logDate, note.trim() || undefined);
    if (ok) {
      setPoints("");
      setNote("");
    }
  }

  function canManage(entry: WorkLogEntryView): boolean {
    return canManageAll || entry.memberId === currentMemberId;
  }

  function startEdit(entry: WorkLogEntryView) {
    setEditingId(entry.id);
    if (unit === "hours_minutes") {
      setEditDraft({
        hours: String(Math.floor(entry.amount / 60)),
        minutes: String(Math.round(entry.amount % 60)),
        points: "",
        note: entry.note,
      });
    } else {
      setEditDraft({ hours: "", minutes: "", points: String(entry.amount), note: entry.note });
    }
  }

  async function saveEdit(entryId: string) {
    const amount = amountFromInputs(editDraft.hours, editDraft.minutes, editDraft.points);
    if (!amount) {
      setError(unit === "hours_minutes" ? "Enter hours and/or minutes." : "Enter a positive number of points.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${itemId}/work-logs/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: editDraft.note.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? "Could not update this entry.";
      setError(message);
      toast.error(message);
      return;
    }
    const data = await res.json();
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, amount: data.entry.amount, note: data.entry.note ?? "" } : e
      )
    );
    setActualTotal(data.actualTotal);
    setEditingId(null);
    toast.success("Entry updated.");
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setDeleting(true);
    const res = await fetch(
      `/dashboard/board/api/teams/${teamId}/work-items/${itemId}/work-logs/${deleteTargetId}`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (res.ok) {
      const data = await res.json();
      setEntries((prev) => prev.filter((e) => e.id !== deleteTargetId));
      setActualTotal(data.actualTotal);
      toast.success("Entry deleted.");
    } else {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? "Could not delete this entry.";
      setError(message);
      toast.error(message);
    }
    setDeleteTargetId(null);
  }

  function entryName(memberId: string): string {
    if (memberNames[memberId]) return memberNames[memberId];
    return memberId === currentMemberId ? "You" : "Someone";
  }

  return (
    <div className="border-border bg-panel rounded-lg border p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-slate text-[11px] font-semibold tracking-wider uppercase">
          Time Tracking
        </div>
        <div className="text-xs text-slate">
          {estimate !== null && (
            <span>
              Est. <span className="font-medium text-ink">{formatWorkLogAmount(estimate, unit)}</span>
              {" · "}
            </span>
          )}
          Actual <span className="font-medium text-ink">{formatWorkLogAmount(actualTotal, unit)}</span>
        </div>
      </div>

      {error && (
        <p className="text-status-blocked mb-2 text-xs font-medium">{error}</p>
      )}

      {canEdit && onEstimateSave && (
        <EstimateEditor unit={unit} initialEstimate={estimate} onSave={onEstimateSave} />
      )}

      {canEdit && (
        <div className="border-border mb-4 border-b pb-4">
          {unit === "hours_minutes" ? (
            <AddTimePopover
              memberInitial={entryName(currentMemberId).charAt(0).toUpperCase()}
              onSubmit={submitEntry}
              disabled={submitting}
            />
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-slate mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                  Date
                </label>
                <DatePicker
                  value={logDate}
                  onChange={(v) => setLogDate(v ?? todayIso())}
                  className="h-8 rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-slate mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                  Points
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="min-w-[160px] flex-1">
                <label className="text-slate mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                  Note (optional)
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What did you work on?"
                  maxLength={500}
                  className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleLog}
                className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Log time
              </button>
            </div>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="py-4 text-center">
          <div className="bg-muted text-slate mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl">
            <Clock className="h-4 w-4" />
          </div>
          <p className="text-slate text-xs">No time logged yet.</p>
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2.5">
              {editingId === entry.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  {unit === "hours_minutes" ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={editDraft.hours}
                        onChange={(e) => setEditDraft((d) => ({ ...d, hours: e.target.value }))}
                        aria-label="Hours"
                        className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-xs text-ink"
                      />
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={editDraft.minutes}
                        onChange={(e) => setEditDraft((d) => ({ ...d, minutes: e.target.value }))}
                        aria-label="Minutes"
                        className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-xs text-ink"
                      />
                    </>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={editDraft.points}
                      onChange={(e) => setEditDraft((d) => ({ ...d, points: e.target.value }))}
                      aria-label="Points"
                      className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-xs text-ink"
                    />
                  )}
                  <input
                    value={editDraft.note}
                    onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                    maxLength={500}
                    className="h-8 min-w-[140px] flex-1 rounded-md border border-border bg-surface px-2 text-xs text-ink"
                  />
                  <button
                    type="button"
                    aria-label="Save entry"
                    disabled={submitting}
                    onClick={() => saveEdit(entry.id)}
                    className="text-status-done hover:bg-status-done-bg rounded-md p-1.5"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel edit"
                    onClick={() => setEditingId(null)}
                    className="text-slate hover:bg-muted rounded-md p-1.5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium">
                      {formatWorkLogAmount(entry.amount, unit)}{" "}
                      <span className="text-slate text-xs font-normal">
                        ·{" "}
                        <span title={fullDateTimeTitle(entry.date)}>
                          {new Date(entry.date).toLocaleDateString(undefined, { timeZone: "UTC" })}
                        </span>{" "}
                        ·{" "}
                        <MemberHoverCard name={entryName(entry.memberId)} email={memberEmails[entry.memberId]}>
                          {entryName(entry.memberId)}
                        </MemberHoverCard>
                      </span>
                    </p>
                    {entry.note && <p className="text-slate truncate text-xs">{entry.note}</p>}
                  </div>
                  {canManage(entry) && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Edit entry"
                        onClick={() => startEdit(entry)}
                        className="text-slate hover:bg-muted hover:text-ink rounded-md p-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete entry"
                        onClick={() => setDeleteTargetId(entry.id)}
                        className="text-slate hover:bg-status-blocked-bg hover:text-status-blocked rounded-md p-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete this log entry?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function EstimateEditor({
  unit,
  initialEstimate,
  onSave,
}: {
  unit: WorkLogUnit;
  initialEstimate: number | null;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  const initialHours = initialEstimate !== null ? Math.floor(initialEstimate / 60) : null;
  const initialMinutes = initialEstimate !== null ? Math.round(initialEstimate % 60) : null;
  const [hours, setHours] = useState(initialHours !== null ? String(initialHours) : "");
  const [minutes, setMinutes] = useState(initialMinutes !== null ? String(initialMinutes) : "");
  const [points, setPoints] = useState(initialEstimate !== null ? String(initialEstimate) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    let value: number | null;
    if (unit === "hours_minutes") {
      const hVal = Number(hours || 0);
      const mVal = Number(minutes || 0);
      value = hVal === 0 && mVal === 0 ? null : hVal * 60 + mVal;
    } else {
      value = points === "" ? null : Number(points);
    }
    setSaving(true);
    await onSave(value);
    setSaving(false);
  }

  return (
    <div className="border-border mb-4 flex flex-wrap items-end gap-2 border-b pb-4">
      <span className="text-slate text-[10px] font-semibold tracking-wider uppercase">
        Estimate
      </span>
      {unit === "hours_minutes" ? (
        <>
          <input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="h"
            aria-label="Estimated hours"
            className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-xs text-ink"
          />
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="m"
            aria-label="Estimated minutes"
            className="h-8 w-16 rounded-md border border-border bg-surface px-2 text-xs text-ink"
          />
        </>
      ) : (
        <input
          type="number"
          min={0}
          step={0.5}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          placeholder="points"
          aria-label="Estimated points"
          className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-xs text-ink"
        />
      )}
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="text-primary hover:text-primary-hover text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}
