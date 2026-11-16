"use client";

import { useState } from "react";
import Link from "next/link";
import { ListTree, Plus, X, List, Columns3 } from "lucide-react";
import { StatusPill, resolveStatusMeta } from "@board/components/work-items/status-pill";
import { Select, SelectOption } from "@board/components/ui/select";
import { BoardView } from "@board/components/work-items/board-view";
import type { BoardItem } from "@board/components/work-items/board-card";
import type { WorkflowTransition } from "@board/lib/workflow";
import type { StatusCategory, Priority } from "@board/lib/status-categories";
import { toast } from "sonner";

// IT-12 (Phase 16): a sub-task carries every BoardItem field now, not just
// {id,key,title,status} — the new Board view mode below needs the full
// shape, and this is the one array both List and Board render from, so a
// create/link/unlink in either mode is immediately reflected in the other.
export type SubtaskItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: Priority;
  assigneeName: string | null;
  labels: string[];
  dueDate: string | null;
  order: number;
  createdAt: string;
  isEpic: boolean;
};

type StatusOption = { key: string; label: string; category: StatusCategory };
type EligibleItem = { id: string; key: string; title: string };

const inputClass =
  "h-8 rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function toSubtaskItem(w: {
  _id: string;
  key: string;
  title: string;
  status: string;
  priority?: string;
  labels?: string[];
  dueDate?: string | null;
  order?: number;
  createdAt?: string;
  isEpic?: boolean;
}): SubtaskItem {
  return {
    id: String(w._id),
    key: w.key,
    title: w.title,
    status: w.status,
    priority: (w.priority as Priority) ?? "medium",
    assigneeName: null,
    labels: w.labels ?? [],
    dueDate: w.dueDate ?? null,
    order: w.order ?? 0,
    createdAt: w.createdAt ?? new Date().toISOString(),
    isEpic: Boolean(w.isEpic),
  };
}

// Sub-tasks are just ordinary Work Items with a parentId (capped one level
// deep — see validateSubtaskParent). "New" creates one directly; "Link
// existing" fetches the Team's own item list and offers whichever ones
// aren't already someone's parent or child (server re-validates regardless).
//
// IT-12 (Phase 16): a List/Board toggle next to the flat list — Board mode
// reuses the already-shared, already-generic <BoardView> component, scoped
// by `{ parentId: itemId }` instead of `{ teamId, type }`/
// `{ teamId, teamInitiativeId }` (BoardView itself needs no changes — this
// is a genuine reuse of its existing generic scoping, not a new component,
// Non-Negotiable #6). Children are already same-Team by
// validateSubtaskParent, so the parent's own Workflow columns apply as-is.
export function SubtasksPanel({
  teamId,
  itemId,
  itemType,
  itemCustomerId,
  typeLabel,
  statuses,
  transitions,
  canEdit,
  initialSubtasks,
  isEpic = false,
}: {
  teamId: string;
  itemId: string;
  itemType: string;
  // A Ticket requires a linked Customer (WT-1) — a sub-task of a Ticket
  // inherits the parent's Customer automatically rather than asking again.
  itemCustomerId?: string | null;
  typeLabel: string;
  statuses: StatusOption[];
  transitions: WorkflowTransition[];
  canEdit: boolean;
  initialSubtasks: SubtaskItem[];
  // IT-8: an Epic is a plain Work Item with isEpic=true — its "sub-tasks"
  // here ARE its Epic children, no second parent/child mechanism. Only
  // changes the header from a count badge to a real progress bar.
  isEpic?: boolean;
}) {
  const [subtasks, setSubtasks] = useState(initialSubtasks);
  const [view, setView] = useState<"list" | "board">("list");
  const [mode, setMode] = useState<"none" | "new" | "link">("none");
  const [newTitle, setNewTitle] = useState("");
  const [eligible, setEligible] = useState<EligibleItem[] | null>(null);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doneCount = subtasks.filter(
    (s) => resolveStatusMeta(statuses, s.status).category === "done"
  ).length;

  function reset() {
    setMode("none");
    setNewTitle("");
    setLinkTargetId("");
    setError(null);
  }

  async function createSubtask() {
    if (!newTitle.trim()) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        type: itemType,
        parentId: itemId,
        customerId: itemCustomerId ?? undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const { workItem } = await res.json();
    setSubtasks((prev) => [...prev, toSubtaskItem(workItem)]);
    reset();
  }

  async function openLink() {
    setMode("link");
    if (eligible) return;
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items?type=${itemType}`);
    if (!res.ok) return;
    const data = await res.json();
    setEligible(
      (data.workItems ?? [])
        .filter((w: { _id: string; parentId: string | null }) => w._id !== itemId && !w.parentId)
        .map((w: { _id: string; key: string; title: string }) => ({
          id: w._id,
          key: w.key,
          title: w.title,
        }))
    );
  }

  async function linkExisting() {
    if (!linkTargetId) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${linkTargetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: itemId }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const { workItem } = await res.json();
    setSubtasks((prev) => [...prev, toSubtaskItem(workItem)]);
    reset();
  }

  async function unlink(subtaskId: string) {
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null }),
    });
    if (!res.ok) {
      toast.error("Could not remove that sub-task.");
      return;
    }
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    toast.success("Sub-task removed — the item itself wasn't deleted.");
  }

  const boardItems: BoardItem[] = subtasks.map((s) => ({
    id: s.id,
    key: s.key,
    title: s.title,
    status: s.status,
    priority: s.priority,
    assigneeName: s.assigneeName,
    labels: s.labels,
    dueDate: s.dueDate,
    order: s.order,
    createdAt: s.createdAt,
    isEpic: s.isEpic,
  }));

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
            {isEpic ? "Epic progress" : "Sub-tasks"}
          </div>
          {subtasks.length > 0 && !isEpic && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate">
              {doneCount}/{subtasks.length} done
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {subtasks.length > 0 && (
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              <button
                type="button"
                aria-label="List view"
                onClick={() => setView("list")}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  view === "list" ? "bg-primary text-primary-foreground" : "text-slate hover:text-ink"
                }`}
              >
                <List className="h-3 w-3" />
                List
              </button>
              <button
                type="button"
                aria-label="Board view"
                onClick={() => setView("board")}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  view === "board" ? "bg-primary text-primary-foreground" : "text-slate hover:text-ink"
                }`}
              >
                <Columns3 className="h-3 w-3" />
                Board
              </button>
            </div>
          )}
          {canEdit && mode === "none" && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMode("new")}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
              <button
                type="button"
                onClick={openLink}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                Link existing
              </button>
            </div>
          )}
        </div>
      </div>

      {isEpic && subtasks.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((doneCount / subtasks.length) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-medium text-slate">
            {doneCount}/{subtasks.length} done
          </span>
        </div>
      )}

      {subtasks.length === 0 && mode === "none" ? (
        <div className="py-4 text-center">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-slate">
            <ListTree className="h-4 w-4" />
          </div>
          <p className="text-xs text-slate">No sub-{typeLabel.toLowerCase()}s yet.</p>
        </div>
      ) : view === "board" ? (
        <BoardView
          teamId={teamId}
          itemHrefBase={`/dashboard/board/teams/${teamId}/work-items`}
          columns={statuses}
          transitions={transitions}
          initialItems={boardItems}
          canEdit={canEdit}
          itemLabel={typeLabel}
        />
      ) : (
        <ul className="divide-y divide-border">
          {subtasks.map((s) => {
            const meta = resolveStatusMeta(statuses, s.status);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="mr-1.5 font-mono text-[10px] text-slate">{s.key}</span>
                  <Link
                    href={`/dashboard/board/teams/${teamId}/work-items/${s.id}`}
                    className="text-sm font-medium text-ink hover:text-primary"
                  >
                    {s.title}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusPill label={meta.label} category={meta.category} />
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="Remove sub-task"
                      title="Removes the sub-task relationship — doesn't delete the item"
                      onClick={() => unlink(s.id)}
                      className="rounded-md p-1 text-slate hover:bg-status-blocked-bg hover:text-status-blocked"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mode === "new" && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`New sub-${typeLabel.toLowerCase()} title…`}
            className={`${inputClass} w-full`}
          />
          {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!newTitle.trim() || pending}
              onClick={createSubtask}
              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "link" && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Select
            value={linkTargetId}
            onValueChange={setLinkTargetId}
            placeholder={eligible === null ? "Loading…" : "Select a Work Item…"}
            className={`${inputClass} w-full`}
            disabled={eligible === null}
          >
            {(eligible ?? []).map((w) => (
              <SelectOption key={w.id} value={w.id}>
                {w.key} — {w.title}
              </SelectOption>
            ))}
          </Select>
          {eligible !== null && eligible.length === 0 && (
            <p className="text-xs text-slate">
              No eligible Work Items — everything on this Team is already a parent or a sub-task.
            </p>
          )}
          {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!linkTargetId || pending}
              onClick={linkExisting}
              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Linking…" : "Link"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
