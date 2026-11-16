"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Check, X, Layers, Play, CheckCircle2, LineChart as LineChartIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@board/components/work-items/status-pill";
import { PriorityBadge } from "@board/components/work-items/priority-badge";
import { GuestAccessPanel, type GuestGrantView } from "@board/components/access/guest-access-panel";
import { OriginPanel, type OriginValue } from "@board/components/shared/origin-panel";
import { TimelineFeed } from "@board/components/shared/timeline-feed";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { Select, SelectOption } from "@board/components/ui/select";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { BoardView } from "@board/components/work-items/board-view";
import type { BoardItem } from "@board/components/work-items/board-card";
import type { BoardColumnDef } from "@board/components/work-items/kanban-board";
import { BurndownChart } from "@board/components/sprints/burndown-chart";
import { SprintItemMover, type MoverItem } from "@board/components/sprints/sprint-item-mover";
import type { BurndownPoint } from "@board/lib/sprint-reports";
import type { WorkflowTransition } from "@board/lib/workflow";
import { SPRINT_STATUS_LABEL, type SprintStatus } from "@board/lib/sprint-status";
import { fullDateTimeTitle } from "@board/lib/format-date";
import type { StatusCategory, Priority } from "@board/lib/status-categories";
import type { TimelineEntry } from "@board/lib/timeline";

type StageOption = { key: string; label: string };
type TeamOption = { _id: string; name: string; active: boolean };
type WorkItemOption = { _id: string; title: string; initiativeId: string | null };

const SPRINT_STATUS_BADGE: Record<SprintStatus, string> = {
  planned: "bg-muted text-slate",
  active: "bg-status-in-progress-bg text-status-in-progress",
  completed: "bg-status-done-bg text-status-done",
};

// Phase 16 (Design 2, Sprint/Initiative unification): a Team-run
// Initiative's Sprint controls — status badge, goal/dates, start/complete
// actions. Deliberately not a full reuse of the old SprintHeader (which
// also owned name-editing) since this Initiative's name is already edited
// by the h1 block above; this is additive, alongside it.
function SprintStatusBar({
  initiativeId,
  status,
  goal,
  startDate,
  endDate,
  canManage,
}: {
  initiativeId: string;
  status: SprintStatus;
  goal: string;
  startDate: string;
  endDate: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(goal);
  const [currentGoal, setCurrentGoal] = useState(goal);

  async function run(action: "start" | "complete") {
    setError(null);
    setBusy(true);
    const res = await fetch(`/dashboard/board/api/initiatives/${initiativeId}/${action}`, { method: "POST" });
    setBusy(false);
    setConfirmOpen(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? "Something went wrong.";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success(action === "start" ? "Sprint started." : "Sprint completed.");
    router.refresh();
  }

  // Same "only while planned" rule the Sprint's own PATCH always had (once
  // started, the planned window is history, not a draft) — enforced again
  // server-side regardless of what this button shows.
  async function saveGoal() {
    setError(null);
    const res = await fetch(`/dashboard/board/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintGoal: goalDraft }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setCurrentGoal(goalDraft);
    setEditingGoal(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SPRINT_STATUS_BADGE[status]}`}>
              {SPRINT_STATUS_LABEL[status]}
            </span>
            {!editingGoal && currentGoal && <span className="text-xs text-slate">{currentGoal}</span>}
            {canManage && status === "planned" && !editingGoal && (
              <button
                type="button"
                aria-label="Edit Sprint goal"
                onClick={() => {
                  setGoalDraft(currentGoal);
                  setEditingGoal(true);
                }}
                className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {editingGoal && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                autoFocus
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="Sprint goal (optional)"
                className="h-8 w-full max-w-sm rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                aria-label="Save goal"
                onClick={saveGoal}
                className="rounded-md p-1 text-status-done hover:bg-status-done-bg"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setEditingGoal(false)}
                className="rounded-md p-1 text-slate hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate">
            <span title={fullDateTimeTitle(startDate)}>
              {new Date(startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
            {" – "}
            <span title={fullDateTimeTitle(endDate)}>
              {new Date(endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {status === "planned" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run("start")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" /> Start Sprint
              </button>
            )}
            {status === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete Sprint
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-status-blocked">{error}</p>}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Complete this Sprint?"
        description="Incomplete items will roll over to the next Sprint or the backlog."
        confirmLabel="Complete"
        pending={busy}
        onConfirm={() => run("complete")}
      />
    </div>
  );
}

// Phase 16 (Design 1, StageTrack generalization): the live `initiative`
// StageTrack's stage list, no longer a fixed LIFECYCLE_STAGES const array —
// this client component receives it as a prop from its server-rendered
// parent instead of importing it directly.
function stageLabelFrom(stages: StageOption[], key: string | null): string {
  if (!key) return "—";
  return stages.find((s) => s.key === key)?.label ?? "—";
}

export type StageHistoryEntry = {
  id: string;
  oldValue: string | null;
  newValue: string | null;
  memberName: string;
  createdAt: string;
};

// Phase 16 (Design 2, Sprint/Initiative unification): exported so the
// server page loader (initiatives/[initiativeId]/page.tsx) can type the
// object it builds without duplicating this shape.
export type InitiativeSprintPanel = {
  teamId: string;
  status: SprintStatus;
  goal: string;
  startDate: string;
  endDate: string;
  canManage: boolean;
  boardItems: BoardItem[];
  columns: BoardColumnDef[];
  transitions: WorkflowTransition[];
  itemLabel: string;
  burndown: { totalItems: number; points: BurndownPoint[] };
  // BD-3's "move items in/out of a sprint" — the Board only shows items
  // already assigned; this is how a backlog item gets pulled in (or sent
  // back), same SprintItemMover the old Sprint detail page used.
  initialSprintItems: MoverItem[];
  initialBacklog: MoverItem[];
};

export type LinkedWorkItem = {
  id: string;
  title: string;
  teamId: string;
  teamName: string;
  typeLabel: string;
  statusLabel: string;
  statusCategory: StatusCategory;
  priority: Priority;
};

export function InitiativeDetail({
  initiativeId,
  initialName,
  initialDescription,
  canManage,
  linkedItems,
  hiddenCount = 0,
  initialGuestGrants = [],
  lifecycleModuleEnabled = false,
  lifecycleStages = [],
  isOrgAdmin = false,
  initialLifecycleStage = null,
  stageHistory = [],
  initialOrigin = null,
  customers = [],
  timelineEntries = [],
  sprint = null,
}: {
  initiativeId: string;
  initialName: string;
  initialDescription: string;
  canManage: boolean;
  linkedItems: LinkedWorkItem[];
  hiddenCount?: number;
  initialGuestGrants?: GuestGrantView[];
  lifecycleModuleEnabled?: boolean;
  lifecycleStages?: StageOption[];
  isOrgAdmin?: boolean;
  initialLifecycleStage?: string | null;
  stageHistory?: StageHistoryEntry[];
  initialOrigin?: OriginValue | null;
  customers?: { id: string; name: string }[];
  timelineEntries?: TimelineEntry[];
  // Phase 16 (Design 2, Sprint/Initiative unification): set only when this
  // Initiative is Team-run (`teamId` set) — the second render mode the plan
  // calls for, additive alongside every section above (a Team-run
  // Initiative is still a fully valid Initiative). `null` for an ordinary
  // cross-team tag renders exactly as this page always has.
  sprint?: InitiativeSprintPanel | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(initialDescription);
  const [lifecycleStage, setLifecycleStage] = useState(initialLifecycleStage);
  const [error, setError] = useState<string | null>(null);

  // Forward direction of ORG-5 tagging (the reverse — picking an Initiative
  // from a Work Item — already exists on WorkItemDetail). Mirrors
  // WorkItemLinksPanel's Team → Work Item picker pattern: client-side the
  // Team list isn't role-filtered, the PATCH below is the real enforcement
  // (Non-Negotiable #1), same as cross-team linking already relies on.
  const [addingItem, setAddingItem] = useState(false);
  const [addTeams, setAddTeams] = useState<TeamOption[] | null>(null);
  const [addTeamsLoading, setAddTeamsLoading] = useState(false);
  const [addTeamId, setAddTeamId] = useState("");
  const [addItems, setAddItems] = useState<WorkItemOption[]>([]);
  const [addItemsLoading, setAddItemsLoading] = useState(false);
  const [addItemId, setAddItemId] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function openAddItem() {
    setAddingItem(true);
    if (addTeams) return;
    setAddTeamsLoading(true);
    const res = await fetch("/dashboard/board/api/teams");
    setAddTeamsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setAddTeams((data.teams ?? []).filter((t: TeamOption) => t.active));
  }

  async function selectAddTeam(id: string) {
    setAddTeamId(id);
    setAddItemId("");
    setAddItems([]);
    if (!id) return;
    setAddItemsLoading(true);
    const res = await fetch(`/dashboard/board/api/teams/${id}/work-items`);
    setAddItemsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setAddItems(
      (data.workItems ?? []).filter(
        (w: WorkItemOption) => w.initiativeId !== initiativeId
      )
    );
  }

  function closeAddItem() {
    setAddingItem(false);
    setAddError(null);
    setAddTeamId("");
    setAddItemId("");
    setAddItems([]);
    setAddItemsLoading(false);
  }

  async function addLinkedItem() {
    if (!addTeamId || !addItemId) return;
    setAddPending(true);
    setAddError(null);
    const res = await fetch(`/dashboard/board/api/teams/${addTeamId}/work-items/${addItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiativeId }),
    });
    setAddPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error ?? "Something went wrong.");
      return;
    }
    toast.success("Work Item tagged with this Initiative.");
    closeAddItem();
    router.refresh();
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  // PL-1: Org-Admin-only, a stricter floor than name/description
  // (Team-Admin-eligible via `canManage`) — a separate endpoint, not reused
  // through `patch()`/`canManage` above.
  async function setStage(next: string) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/initiatives/${initiativeId}/lifecycle-stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifecycleStage: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setLifecycleStage(next);
    router.refresh();
  }

  // Grouped by Team so a cross-team Initiative reads as "who's working on
  // this," not a flat undifferentiated list (ORG-5's whole point).
  const byTeam = new Map<string, { teamName: string; items: LinkedWorkItem[] }>();
  for (const item of linkedItems) {
    const entry = byTeam.get(item.teamId) ?? { teamName: item.teamName, items: [] };
    entry.items.push(item);
    byTeam.set(item.teamId, entry);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link href="/dashboard/board/initiatives" className="text-xs font-medium text-slate hover:text-ink">
            ← All Initiatives
          </Link>
          <div className="mt-2 flex items-center gap-1.5">
            {editingName ? (
              <div className="flex flex-1 items-center gap-1.5">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-surface px-2.5 font-heading text-xl font-bold text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  aria-label="Save name"
                  onClick={async () => {
                    if (await patch({ name: nameDraft })) {
                      setName(nameDraft);
                      setEditingName(false);
                    }
                  }}
                  className="rounded-md p-1.5 text-status-done hover:bg-status-done-bg"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => {
                    setNameDraft(name);
                    setEditingName(false);
                  }}
                  className="rounded-md p-1.5 text-slate hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">{name}</h1>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Edit name"
                    onClick={() => setEditingName(true)}
                    className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-md bg-status-blocked-bg px-3 py-2 text-xs font-medium text-status-blocked">
            {error}
          </p>
        )}

        {sprint && (
          <div className="space-y-4">
            <SprintStatusBar
              initiativeId={initiativeId}
              status={sprint.status}
              goal={sprint.goal}
              startDate={sprint.startDate}
              endDate={sprint.endDate}
              canManage={sprint.canManage}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
              <div className="min-w-0">
                <BoardView
                  teamId={sprint.teamId}
                  itemHrefBase={`/dashboard/board/teams/${sprint.teamId}/work-items`}
                  columns={sprint.columns}
                  transitions={sprint.transitions}
                  initialItems={sprint.boardItems}
                  canEdit={sprint.canManage && sprint.status !== "completed"}
                  itemLabel={sprint.itemLabel}
                />
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    <LineChartIcon className="h-3.5 w-3.5" />
                    Burndown
                  </div>
                  {sprint.status === "planned" ? (
                    <p className="text-xs text-slate">Burndown appears once this Sprint starts.</p>
                  ) : (
                    <BurndownChart points={sprint.burndown.points} totalItems={sprint.burndown.totalItems} />
                  )}
                </div>
                <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    Sprint Items
                  </div>
                  <SprintItemMover
                    teamId={sprint.teamId}
                    sprintId={initiativeId}
                    itemHrefBase={`/dashboard/board/teams/${sprint.teamId}/work-items`}
                    initialSprintItems={sprint.initialSprintItems}
                    initialBacklog={sprint.initialBacklog}
                    disabled={!sprint.canManage || sprint.status === "completed"}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
                Linked Work Items
              </div>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate">
                {linkedItems.length}
              </span>
            </div>
            {canManage && !addingItem && (
              <button
                type="button"
                onClick={openAddItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          </div>
          {hiddenCount > 0 && (
            <p className="mb-3 text-[11px] text-slate">
              {hiddenCount} more {hiddenCount === 1 ? "item is" : "items are"} tagged here on Teams
              you don&apos;t have access to.
            </p>
          )}
          {linkedItems.length === 0 && !addingItem ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
                <Layers className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate">No Work Items tagged with this Initiative yet.</p>
            </div>
          ) : linkedItems.length > 0 ? (
            <div className="space-y-5">
              {[...byTeam.entries()].map(([teamId, group]) => (
                <div key={teamId}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
                    {group.teamName}
                  </div>
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/board/teams/${item.teamId}/work-items/${item.id}`}
                            className="block truncate text-sm font-medium text-ink hover:text-primary"
                          >
                            {item.title}
                          </Link>
                          <span className="text-[11px] text-slate">{item.typeLabel}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <StatusPill label={item.statusLabel} category={item.statusCategory} />
                          <PriorityBadge priority={item.priority} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {addingItem && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-ink">Team</label>
                  <Select
                    value={addTeamId}
                    onValueChange={selectAddTeam}
                    disabled={addTeamsLoading}
                    placeholder={addTeamsLoading ? "Loading Teams…" : "Select a Team…"}
                    className="h-8 w-36 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(addTeams ?? []).map((t) => (
                      <SelectOption key={t._id} value={t._id}>
                        {t.name}
                      </SelectOption>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-ink">Work Item</label>
                  <Select
                    value={addItemId}
                    onValueChange={setAddItemId}
                    disabled={!addTeamId || addItemsLoading || (addTeamId !== "" && addItems.length === 0)}
                    placeholder={
                      !addTeamId
                        ? "Pick a Team first"
                        : addItemsLoading
                          ? "Loading Work Items…"
                          : addItems.length === 0
                            ? "No Work Items to add"
                            : "Select a Work Item…"
                    }
                    className="h-8 w-48 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addItems.map((w) => (
                      <SelectOption key={w._id} value={w._id}>
                        {w.title}
                      </SelectOption>
                    ))}
                  </Select>
                </div>
              </div>

              {addError && <p className="text-xs font-medium text-status-blocked">{addError}</p>}

              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={!addItemId || addPending}
                  onClick={addLinkedItem}
                  className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addPending ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={closeAddItem}
                  className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate">
            Timeline
          </div>
          <TimelineFeed entries={timelineEntries} />
        </div>
      </div>

      <div className="space-y-4">
        {lifecycleModuleEnabled && (
          <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate">
              Lifecycle Stage
            </div>
            {isOrgAdmin ? (
              <Select
                value={lifecycleStage ?? ""}
                onValueChange={setStage}
                placeholder="Not set"
                className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {lifecycleStages.map((s) => (
                  <SelectOption key={s.key} value={s.key}>
                    {s.label}
                  </SelectOption>
                ))}
              </Select>
            ) : (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {stageLabelFrom(lifecycleStages, lifecycleStage)}
              </span>
            )}
            {stageHistory.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {stageHistory.map((h) => (
                  <li key={h.id} className="text-[11px] text-slate">
                    <MemberHoverCard name={h.memberName}>
                      <span className="font-medium text-ink">{h.memberName}</span>
                    </MemberHoverCard>{" "}
                    moved{" "}
                    {stageLabelFrom(lifecycleStages, h.oldValue)} → {stageLabelFrom(lifecycleStages, h.newValue)} ·{" "}
                    <span title={fullDateTimeTitle(h.createdAt)}>
                      {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
              Description
            </div>
            {canManage && !editingDescription && (
              <button
                type="button"
                onClick={() => setEditingDescription(true)}
                className="text-[10px] font-medium text-primary hover:text-primary-hover"
              >
                Edit
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    if (await patch({ description: descriptionDraft })) {
                      setDescription(descriptionDraft);
                      setEditingDescription(false);
                    }
                  }}
                  className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionDraft(description);
                    setEditingDescription(false);
                  }}
                  className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink">
              {description || <span className="text-slate">No description.</span>}
            </p>
          )}
        </div>

        <OriginPanel
          patchEndpoint={`/dashboard/board/api/initiatives/${initiativeId}`}
          canEdit={canManage}
          initialOrigin={initialOrigin}
          customers={customers}
        />

        {canManage && (
          <GuestAccessPanel
            endpoint={`/dashboard/board/api/initiatives/${initiativeId}/guests`}
            targetLabel="Initiative"
            initialGrants={initialGuestGrants}
          />
        )}
      </div>
    </div>
  );
}
