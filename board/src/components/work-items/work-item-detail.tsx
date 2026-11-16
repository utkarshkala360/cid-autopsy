"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Trash2,
  Building2,
  Target,
  CalendarRange,
  Layers,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@board/components/work-items/status-pill";
import { PriorityBadge } from "@board/components/work-items/priority-badge";
import {
  HistoryFeed,
  type HistoryEntry,
} from "@board/components/work-items/history-feed";
import { CommentForm } from "@board/components/work-items/comment-form";
import {
  CustomFieldInput,
  type FieldDef,
} from "@board/components/work-items/custom-field-input";
import { LabelsInput } from "@board/components/work-items/labels-input";
import {
  WorkItemLinksPanel,
  type LinkedItem,
} from "@board/components/work-items/work-item-links-panel";
import { OriginPanel, type OriginValue } from "@board/components/shared/origin-panel";
import { MacroStagePicker } from "@board/components/shared/macro-stage-picker";
import type { StageDef } from "@board/lib/stage-track-types";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@board/components/work-items/attachments-panel";
import {
  GuestAccessPanel,
  type GuestGrantView,
} from "@board/components/access/guest-access-panel";
import {
  CollaboratorsPanel,
  type CollaboratorView,
} from "@board/components/work-items/collaborators-panel";
import {
  SubtasksPanel,
  type SubtaskItem,
} from "@board/components/work-items/subtasks-panel";
import {
  WorkLogPanel,
  type WorkLogEntryView,
} from "@board/components/work-items/work-log-panel";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type StatusCategory,
} from "@board/lib/status-categories";
import { uploadFilesFromEvent } from "@board/lib/attachment-upload";
import type { WorkflowTransition } from "@board/lib/workflow";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { NotOnTeamBadge } from "@board/components/ui/not-on-team-badge";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { Select, SelectOption } from "@board/components/ui/select";
import { DatePicker } from "@board/components/ui/date-picker";
import { fullDateTimeTitle } from "@board/lib/format-date";
import { toast } from "sonner";

export type StatusOption = {
  key: string;
  label: string;
  category: StatusCategory;
};

type WorkItemProps = {
  id: string;
  key: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  labels: string[];
  dueDate: string | null;
  customFields: Record<string, unknown>;
  customerId: string | null;
  initiativeId: string | null;
  // Renamed from `sprintId` (`ref: "Sprint"`), Phase 16 (Design 2,
  // Sprint/Initiative unification) — same field, now pointing at a
  // Team-run `Initiative`.
  teamInitiativeId: string | null;
  parentId: string | null;
  isEpic: boolean;
  macroStage: string | null;
  // WL-2/WL-4: estimate is independent, actualTotal is the denormalized
  // live sum of WorkLog rows (kept in sync automatically by every
  // work-logs mutation) — both null/0 and hidden entirely when the Team
  // has no timeTrackingUnit.
  estimate: number | null;
  actualTotal: number;
  createdAt: string;
  updatedAt: string;
};

const inputClass =
  "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function WorkItemDetail({
  teamId,
  teamName,
  typeLabel,
  requiresCustomer,
  canEdit,
  canComment = canEdit,
  isGuest = false,
  canManageGuests = false,
  isTeamAdmin = false,
  isOrgAdmin = false,
  workItemStageTrackEnabled = false,
  workItemStages = [],
  currentMemberId,
  workItem: initialWorkItem,
  statuses,
  transitions,
  fields,
  teamMembers,
  mentionCandidates = teamMembers,
  customers,
  initiatives,
  sprints = [],
  memberNames,
  memberEmails = {},
  initialHistory,
  initialLinks,
  initialOrigin = null,
  initialAttachments,
  initialGuestGrants = [],
  initialCollaborators = [],
  initialSubtasks = [],
  parentRef = null,
  existingLabels = [],
  timeTrackingUnit = null,
  initialWorkLogEntries = [],
}: {
  teamId: string;
  teamName: string;
  typeLabel: string;
  // Phase 16 (Design 3): generalizes the old `item.type === "ticket"`
  // hardcode — the server-rendered parent looks this up from the live
  // WorkItemTemplateDef registry and hands it down.
  requiresCustomer: boolean;
  canEdit: boolean;
  canComment?: boolean;
  isGuest?: boolean;
  canManageGuests?: boolean;
  // WL-3: owner-or-Team-Admin correction rights on a WorkLog entry — a
  // stricter/narrower concept than canManageGuests, which mixes in
  // "member who's also the reporter."
  isTeamAdmin?: boolean;
  // Phase 16 (Design 1, StageTrack generalization): WorkItem.macroStage is
  // Org-Admin-only, same floor CJ-1/PL-1 already set for Customer/
  // Initiative — gated by both the live "work_item" StageTrack's `enabled`
  // flag (CJ-5/PL-5's "invisible when off" precedent) and isOrgAdmin.
  isOrgAdmin?: boolean;
  workItemStageTrackEnabled?: boolean;
  workItemStages?: StageDef[];
  currentMemberId: string;
  workItem: WorkItemProps;
  statuses: StatusOption[];
  transitions: WorkflowTransition[];
  fields: FieldDef[];
  teamMembers: { id: string; name: string; email?: string }[];
  // Wider than teamMembers on purpose — @mentions can reach any active Org
  // Member, not just people with Team access (see getOrgMentionCandidates).
  // Falls back to teamMembers so existing callers/tests don't need updating.
  mentionCandidates?: { id: string; name: string; email?: string }[];
  customers: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  // BD-3: empty for a Team that hasn't opted into Sprints — the Sprint
  // field below renders nothing at all in that case, not a disabled control.
  sprints?: { id: string; name: string; status: string }[];
  memberNames: Record<string, string>;
  memberEmails?: Record<string, string>;
  initialHistory: HistoryEntry[];
  initialLinks: LinkedItem[];
  initialOrigin?: OriginValue | null;
  initialAttachments: AttachmentView[];
  initialGuestGrants?: GuestGrantView[];
  initialCollaborators?: CollaboratorView[];
  initialSubtasks?: SubtaskItem[];
  parentRef?: { id: string; key: string; title: string } | null;
  // Every label ever used on this Team's Work Items — powers the chip
  // input's autocomplete so labels stay reusable instead of re-typed.
  existingLabels?: string[];
  // WL-1: null when this Team hasn't turned on time tracking — the
  // Estimate field and the whole WorkLogPanel render nothing at all in
  // that case, same "invisible, not disabled" idiom `sprints` uses above.
  timeTrackingUnit?: "story_points" | "hours_minutes" | null;
  initialWorkLogEntries?: WorkLogEntryView[];
}) {
  const router = useRouter();
  // Assignee/custom-field member pickers show every active Org Member
  // (mentionCandidates), not just people on this Team — this set is only
  // used to flag the ones who aren't, via NotOnTeamBadge.
  const teamMemberIds = new Set(teamMembers.map((m) => m.id));
  const [item, setItem] = useState(initialWorkItem);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [names, setNames] = useState(memberNames);
  const [emails, setEmails] = useState(memberEmails);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description);
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelsDraft, setLabelsDraft] = useState<string[]>(item.labels);
  const [customFieldDrafts, setCustomFieldDrafts] = useState<
    Record<string, string>
  >(
    Object.fromEntries(
      fields.map((f) => [f.key, String(item.customFields[f.key] ?? "")])
    )
  );
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // A6: paste/drop an image or file directly into the description — uploads
  // it as a real Attachment (logged to history like any other upload) and
  // inserts a Markdown image/link reference at the cursor. Plain text
  // paste is left alone (no files on the clipboard/drop = default behavior).
  async function handleDescriptionFiles(files: FileList | File[]) {
    const { markdown, errors } = await uploadFilesFromEvent(
      teamId,
      item.id,
      files
    );
    if (errors.length) setError(errors[0]);
    if (!markdown) return;
    const el = descriptionRef.current;
    const start = el?.selectionStart ?? descriptionDraft.length;
    const end = el?.selectionEnd ?? descriptionDraft.length;
    setDescriptionDraft(
      (prev) => `${prev.slice(0, start)}${markdown}\n${prev.slice(end)}`
    );
  }

  function mapHistoryRows(rows: Record<string, unknown>[]): HistoryEntry[] {
    return rows.map(
      (h) =>
        ({
          id: String(h._id),
          kind: h.kind,
          field: h.field,
          oldValue: h.oldValue,
          newValue: h.newValue,
          commentText: h.commentText,
          mentions: (h.mentions as string[]) ?? [],
          attachmentAction: h.attachmentAction,
          attachmentFilename: h.attachmentFilename,
          memberId: String(h.memberId),
          createdAt: h.createdAt,
        }) as HistoryEntry
    );
  }

  async function patchItem(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return false;
    }
    const data = await res.json();
    setItem((prev) => ({
      ...prev,
      ...data.workItem,
      id: String(data.workItem._id),
      assignee: data.workItem.assignee ? String(data.workItem.assignee) : null,
      dueDate: data.workItem.dueDate
        ? new Date(data.workItem.dueDate).toISOString()
        : null,
      customerId: data.workItem.customerId
        ? String(data.workItem.customerId)
        : null,
      initiativeId: data.workItem.initiativeId
        ? String(data.workItem.initiativeId)
        : null,
    }));
    // A newly-picked assignee may not be in the initial memberNames map yet.
    if (payload.assignee) {
      const picked = teamMembers.find((m) => m.id === payload.assignee);
      if (picked) {
        setNames((prev) => ({ ...prev, [picked.id]: picked.name }));
        if (picked.email) {
          setEmails((prev) => ({ ...prev, [picked.id]: picked.email! }));
        }
      }
    }
    // The PATCH response already carries the ChangeHistory rows it just
    // wrote (oldest-first, matching GET .../history's sort) — append rather
    // than re-fetching the whole feed.
    if (data.history?.length) {
      setHistory((prev) => [...prev, ...mapHistoryRows(data.history)]);
    }
    // XM-3: a Team Admin-configured suggestion, never an automatic change
    // (CJ-3/PL-3) — a toast with a link to go make the call manually, not a
    // one-click apply from here.
    if (data.stageNudge) {
      const n = data.stageNudge as {
        entity: "journeyStage" | "lifecycleStage";
        targetLabel: string;
        targetHref: string;
        currentStageLabel: string;
        suggestedStageLabel: string;
      };
      const entityLabel = n.entity === "journeyStage" ? "Journey Stage" : "Lifecycle Stage";
      toast.info(
        `${n.targetLabel}'s ${entityLabel} looks ready to move: ${n.currentStageLabel} → ${n.suggestedStageLabel}`,
        {
          action: { label: "Open", onClick: () => router.push(n.targetHref) },
          duration: 8000,
        }
      );
    }
    return true;
  }

  const allowedNextStatuses = new Set(
    transitions.filter((t) => t.from === item.status).map((t) => t.to)
  );

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${item.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success(`${typeLabel} deleted.`);
      router.push(`/dashboard/board/teams/${teamId}/work-items`);
    } else {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? `Could not delete this ${typeLabel}.`;
      setError(message);
      toast.error(message);
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  const statusMeta = statuses.find((s) => s.key === item.status) ?? {
    key: item.status,
    label: item.status,
    category: "todo" as StatusCategory,
  };

  const isTicket = requiresCustomer;
  const customerName = item.customerId
    ? (customers.find((c) => c.id === item.customerId)?.name ?? null)
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Link
              href={isGuest ? "/dashboard/board/guest-access" : `/dashboard/board/teams/${teamId}/work-items`}
              className="text-slate hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
            >
              <ArrowLeft className="h-3 w-3" />
              {isGuest ? "My Guest Access" : `${teamName} ${typeLabel}s`}
            </Link>
            {isGuest && (
              <span className="bg-muted text-slate rounded-full px-2 py-0.5 text-[10px] font-medium">
                Viewing as Guest — shared with you only
              </span>
            )}
          </div>

          <p className="mt-2 font-mono text-xs font-medium text-slate">{item.key}</p>
          {parentRef && (
            <p className="mt-1 text-xs text-slate">
              Sub-task of{" "}
              <Link
                href={`/dashboard/board/teams/${teamId}/work-items/${parentRef.id}`}
                className="font-medium text-primary hover:text-primary-hover"
              >
                {parentRef.key} — {parentRef.title}
              </Link>
            </p>
          )}

          <div className="mt-1 flex items-start gap-1.5">
            {editingTitle ? (
              <div className="flex flex-1 items-center gap-1.5">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="border-border bg-surface font-heading text-ink focus:border-primary focus:ring-primary h-9 flex-1 rounded-md border px-2.5 text-xl font-bold focus:ring-1 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Save title"
                  onClick={async () => {
                    if (await patchItem({ title: titleDraft }))
                      setEditingTitle(false);
                  }}
                  className="text-status-done hover:bg-status-done-bg rounded-md p-1.5"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => {
                    setTitleDraft(item.title);
                    setEditingTitle(false);
                  }}
                  className="text-slate hover:bg-muted rounded-md p-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-ink text-2xl font-bold tracking-tight">
                  {item.title}
                </h1>
                {item.isEpic && (
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Layers className="h-3 w-3" />
                    Epic
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Edit title"
                    onClick={() => setEditingTitle(true)}
                    className="text-slate hover:bg-muted hover:text-ink mt-1 rounded-md p-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
          {/* IT-8: only a top-level item can be an Epic — a sub-task can't
              contain sub-tasks (validateSubtaskParent's "no grandchildren"),
              so marking one an Epic would be a contradiction. */}
          {canEdit && !parentRef && (
            <button
              type="button"
              onClick={() => patchItem({ isEpic: !item.isEpic })}
              className="text-primary hover:text-primary-hover mt-1.5 text-xs font-medium"
            >
              {item.isEpic ? "Unmark as Epic" : "Mark as Epic"}
            </button>
          )}
        </div>

        {error && (
          <p className="bg-status-blocked-bg text-status-blocked rounded-md px-3 py-2 text-xs font-medium">
            {error}
          </p>
        )}

        <div className="border-border bg-panel rounded-lg border p-5 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-slate text-[11px] font-semibold tracking-wider uppercase">
              Description
            </div>
            {canEdit && !editingDescription && (
              <button
                type="button"
                onClick={() => setEditingDescription(true)}
                className="text-primary hover:text-primary-hover text-xs font-medium"
              >
                Edit
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="space-y-2">
              <textarea
                ref={descriptionRef}
                autoFocus
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onPaste={(e) => {
                  if (e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    handleDescriptionFiles(e.clipboardData.files);
                  }
                }}
                onDrop={(e) => {
                  if (e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    handleDescriptionFiles(e.dataTransfer.files);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                rows={8}
                className="border-border bg-surface text-ink focus:border-primary focus:ring-primary w-full resize-y rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (await patchItem({ description: descriptionDraft })) {
                      setEditingDescription(false);
                    }
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-7 items-center rounded-md px-2.5 text-xs font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionDraft(item.description);
                    setEditingDescription(false);
                  }}
                  className="text-slate hover:text-ink inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : item.description ? (
            <div className="prose prose-sm text-ink [&_a]:text-primary [&_code]:bg-muted max-w-none text-sm [&_code]:rounded [&_code]:px-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.description}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-slate text-xs">No description.</p>
          )}
        </div>

        <AttachmentsPanel
          teamId={teamId}
          itemId={item.id}
          canEdit={canEdit}
          initialAttachments={initialAttachments}
          memberNames={names}
          memberEmails={emails}
          currentMemberId={currentMemberId}
        />

        {!isGuest && (
          <WorkItemLinksPanel
            teamId={teamId}
            itemId={item.id}
            canEdit={canEdit}
            initialLinks={initialLinks}
          />
        )}

        {!isGuest && (
          <OriginPanel
            patchEndpoint={`/dashboard/board/api/teams/${teamId}/work-items/${item.id}`}
            canEdit={canEdit}
            initialOrigin={initialOrigin}
            customers={customers}
            excludeWorkItemId={item.id}
          />
        )}

        {!isGuest && workItemStageTrackEnabled && (
          <MacroStagePicker
            endpoint={`/dashboard/board/api/teams/${teamId}/work-items/${item.id}/macro-stage`}
            stages={workItemStages}
            isOrgAdmin={isOrgAdmin}
            initialValue={item.macroStage}
          />
        )}

        {/* Capped one level deep (validateSubtaskParent) — a sub-task can't
            have sub-tasks of its own, so this only renders for a top-level
            item. */}
        {!isGuest && !parentRef && (
          <SubtasksPanel
            teamId={teamId}
            itemId={item.id}
            itemType={item.type}
            itemCustomerId={item.customerId}
            typeLabel={typeLabel}
            statuses={statuses}
            transitions={transitions}
            canEdit={canEdit}
            initialSubtasks={initialSubtasks}
            isEpic={item.isEpic}
          />
        )}

        {!isGuest && timeTrackingUnit && (
          <WorkLogPanel
            teamId={teamId}
            itemId={item.id}
            unit={timeTrackingUnit}
            estimate={item.estimate}
            canEdit={canEdit}
            canManageAll={isTeamAdmin}
            currentMemberId={currentMemberId}
            initialEntries={initialWorkLogEntries}
            initialActualTotal={item.actualTotal}
            memberNames={names}
            memberEmails={emails}
            onEstimateSave={
              canEdit
                ? async (value) => patchItem({ estimate: value })
                : undefined
            }
          />
        )}

        {canEdit && (
          <CollaboratorsPanel
            endpoint={`/dashboard/board/api/teams/${teamId}/work-items/${item.id}/collaborators`}
            initialCollaborators={initialCollaborators}
          />
        )}

        {canManageGuests && (
          <GuestAccessPanel
            endpoint={`/dashboard/board/api/teams/${teamId}/work-items/${item.id}/guests`}
            targetLabel={typeLabel}
            initialGrants={initialGuestGrants}
          />
        )}

        <div className="border-border bg-panel rounded-lg border p-5 shadow-xs">
          <div className="text-slate mb-4 text-[11px] font-semibold tracking-wider uppercase">
            Activity
          </div>
          <HistoryFeed
            entries={history}
            statuses={statuses}
            fields={fields}
            memberNames={names}
            memberEmails={emails}
            teamMembersForMentions={mentionCandidates}
            realTeamMemberIds={teamMemberIds}
            teamName={teamName}
          />
          {canComment && (
            <div className="border-border mt-4 border-t pt-4">
              <CommentForm
                teamId={teamId}
                itemId={item.id}
                teamMembers={mentionCandidates}
                realTeamMemberIds={teamMemberIds}
                teamName={teamName}
                onSubmit={async (text) => {
                  const res = await fetch(
                    `/dashboard/board/api/teams/${teamId}/work-items/${item.id}/comments`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text }),
                    }
                  );
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    return { error: body.error ?? "Something went wrong." };
                  }
                  if (!names[currentMemberId]) {
                    setNames((prev) => ({ ...prev, [currentMemberId]: "You" }));
                  }
                  // The POST response already carries the new comment row —
                  // append it instead of re-fetching the whole feed (Phase 11).
                  const { comment } = await res.json();
                  setHistory((prev) => [...prev, ...mapHistoryRows([comment])]);
                  return {};
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <div className="border-border bg-panel rounded-lg border p-4 shadow-xs">
          <div className="space-y-3">
            <div>
              <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                Status
              </div>
              {canEdit ? (
                <Select
                  value={item.status}
                  onValueChange={(v) => patchItem({ status: v })}
                  className={inputClass}
                >
                  {statuses.map((s) => (
                    <SelectOption
                      key={s.key}
                      value={s.key}
                      disabled={
                        s.key !== item.status && !allowedNextStatuses.has(s.key)
                      }
                    >
                      {s.label}
                    </SelectOption>
                  ))}
                </Select>
              ) : (
                <StatusPill
                  label={statusMeta.label}
                  category={statusMeta.category}
                />
              )}
            </div>

            <div>
              <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                Priority
              </div>
              {canEdit ? (
                <Select
                  value={item.priority}
                  onValueChange={(v) => patchItem({ priority: v })}
                  className={inputClass}
                >
                  {PRIORITIES.map((p) => (
                    <SelectOption key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectOption>
                  ))}
                </Select>
              ) : (
                <PriorityBadge
                  priority={item.priority as (typeof PRIORITIES)[number]}
                />
              )}
            </div>

            <div>
              <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                Assignee
              </div>
              {canEdit ? (
                <Select
                  value={item.assignee ?? "__unassigned__"}
                  onValueChange={(v) =>
                    patchItem({ assignee: v === "__unassigned__" ? null : v })
                  }
                  className={inputClass}
                >
                  <SelectOption value="__unassigned__">Unassigned</SelectOption>
                  {mentionCandidates.map((m) => (
                    <SelectOption key={m.id} value={m.id}>
                      <span className="flex items-center gap-1.5">
                        {m.name}
                        {!teamMemberIds.has(m.id) && <NotOnTeamBadge teamName={teamName} />}
                      </span>
                    </SelectOption>
                  ))}
                </Select>
              ) : (
                <p className="text-ink flex items-center gap-1.5 text-xs">
                  {item.assignee ? (
                    <>
                      <MemberHoverCard
                        name={names[item.assignee] ?? "—"}
                        email={emails[item.assignee]}
                      >
                        {names[item.assignee] ?? "—"}
                      </MemberHoverCard>
                      {!teamMemberIds.has(item.assignee) && (
                        <NotOnTeamBadge teamName={teamName} />
                      )}
                    </>
                  ) : (
                    "Unassigned"
                  )}
                </p>
              )}
            </div>

            {isTicket && (
              <div>
                <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                  Customer
                </div>
                {canEdit ? (
                  <Select
                    value={item.customerId ?? "__none__"}
                    onValueChange={(v) =>
                      patchItem({ customerId: v === "__none__" ? null : v })
                    }
                    placeholder="Select a Customer…"
                    className={inputClass}
                  >
                    <SelectOption value="__none__">No Customer</SelectOption>
                    {customers.map((c) => (
                      <SelectOption key={c.id} value={c.id}>
                        {c.name}
                      </SelectOption>
                    ))}
                  </Select>
                ) : customerName ? (
                  <Link
                    href={`/dashboard/board/customers/${item.customerId}`}
                    className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
                  >
                    <Building2 className="h-3 w-3" />
                    {customerName}
                  </Link>
                ) : (
                  <p className="text-slate text-xs">—</p>
                )}
              </div>
            )}

            <div>
              <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                Due date
              </div>
              {canEdit ? (
                <DatePicker
                  value={item.dueDate ? item.dueDate.slice(0, 10) : null}
                  onChange={(v) => patchItem({ dueDate: v })}
                  className={inputClass}
                />
              ) : (
                <p
                  className="text-ink text-xs"
                  title={item.dueDate ? fullDateTimeTitle(item.dueDate) : undefined}
                >
                  {item.dueDate
                    ? new Date(item.dueDate).toLocaleDateString()
                    : "—"}
                </p>
              )}
            </div>

            <div>
              <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                Initiative
              </div>
              {canEdit ? (
                <Select
                  value={item.initiativeId ?? "__none__"}
                  onValueChange={(v) =>
                    patchItem({ initiativeId: v === "__none__" ? null : v })
                  }
                  className={inputClass}
                >
                  <SelectOption value="__none__">None</SelectOption>
                  {initiatives.map((i) => (
                    <SelectOption key={i.id} value={i.id}>
                      {i.name}
                    </SelectOption>
                  ))}
                </Select>
              ) : item.initiativeId ? (
                <Link
                  href={`/dashboard/board/initiatives/${item.initiativeId}`}
                  className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
                >
                  <Target className="h-3 w-3" />
                  {initiatives.find((i) => i.id === item.initiativeId)?.name ??
                    "—"}
                </Link>
              ) : (
                <p className="text-slate text-xs">—</p>
              )}
            </div>

            {sprints.length > 0 && (
              <div>
                <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                  Sprint
                </div>
                {canEdit ? (
                  <Select
                    value={item.teamInitiativeId ?? "__backlog__"}
                    onValueChange={(v) =>
                      patchItem({ teamInitiativeId: v === "__backlog__" ? null : v })
                    }
                    className={inputClass}
                  >
                    <SelectOption value="__backlog__">Backlog</SelectOption>
                    {sprints.map((s) => (
                      <SelectOption
                        key={s.id}
                        value={s.id}
                        disabled={
                          s.status === "completed" && s.id !== item.teamInitiativeId
                        }
                      >
                        {s.name} ({s.status})
                      </SelectOption>
                    ))}
                  </Select>
                ) : item.teamInitiativeId ? (
                  <Link
                    href={`/dashboard/board/initiatives/${item.teamInitiativeId}`}
                    className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
                  >
                    <CalendarRange className="h-3 w-3" />
                    {sprints.find((s) => s.id === item.teamInitiativeId)?.name ?? "—"}
                  </Link>
                ) : (
                  <p className="text-slate text-xs">Backlog</p>
                )}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-slate text-[11px] font-semibold tracking-wider uppercase">
                  Labels
                </div>
                {canEdit && !editingLabels && (
                  <button
                    type="button"
                    onClick={() => setEditingLabels(true)}
                    className="text-primary hover:text-primary-hover text-[10px] font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingLabels ? (
                <div className="space-y-1.5">
                  <LabelsInput
                    value={labelsDraft}
                    onChange={setLabelsDraft}
                    suggestions={existingLabels}
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        if (await patchItem({ labels: labelsDraft }))
                          setEditingLabels(false);
                      }}
                      className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-6 items-center rounded-md px-2 text-[10px] font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLabelsDraft(item.labels);
                        setEditingLabels(false);
                      }}
                      className="text-slate hover:text-ink inline-flex h-6 items-center rounded-md px-2 text-[10px] font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : item.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {item.labels.map((label) => (
                    <span
                      key={label}
                      className="bg-muted text-slate rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate text-xs">None</p>
              )}
            </div>

            {fields.length > 0 && (
              <div className="border-border space-y-3 border-t pt-3">
                {fields.map((field) => (
                  <div key={field.id}>
                    <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
                      {field.label}
                    </div>
                    {canEdit ? (
                      <CustomFieldInput
                        field={field}
                        value={customFieldDrafts[field.key] ?? ""}
                        onChange={(v) => {
                          setCustomFieldDrafts((prev) => ({
                            ...prev,
                            [field.key]: v,
                          }));
                          if (
                            field.fieldType !== "text" &&
                            field.fieldType !== "number"
                          ) {
                            patchItem({
                              customFields: { [field.key]: v || null },
                            });
                          }
                        }}
                        teamMembers={teamMembers}
                        mentionCandidates={mentionCandidates}
                        teamName={teamName}
                      />
                    ) : (
                      <p className="text-ink text-xs">
                        {String(item.customFields[field.key] ?? "—")}
                      </p>
                    )}
                    {canEdit &&
                      (field.fieldType === "text" ||
                        field.fieldType === "number") && (
                        <button
                          type="button"
                          onClick={() =>
                            patchItem({
                              customFields: {
                                [field.key]:
                                  customFieldDrafts[field.key] || null,
                              },
                            })
                          }
                          className="text-primary hover:text-primary-hover mt-1 text-[10px] font-medium"
                        >
                          Save
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}

            <div className="border-border text-slate border-t pt-3 text-[11px]">
              Reported by{" "}
              <MemberHoverCard
                name={names[item.reporter] ?? "—"}
                email={emails[item.reporter]}
              >
                {names[item.reporter] ?? "—"}
              </MemberHoverCard>
              <br />
              <span title={fullDateTimeTitle(item.createdAt)}>
                Created {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="border-border text-status-blocked hover:bg-status-blocked-bg inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium shadow-2xs transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete {typeLabel}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete "${item.title}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
