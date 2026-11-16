import { MessageSquare, History as HistoryIcon, Paperclip } from "lucide-react";
import { splitMentionSegments } from "@board/lib/mentions";
import { PRIORITY_LABEL, type Priority } from "@board/lib/status-categories";
import type { WorkflowStatus as StatusOption } from "@board/lib/workflow";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { NotOnTeamBadge } from "@board/components/ui/not-on-team-badge";
import { fullDateTimeTitle } from "@board/lib/format-date";

export type HistoryEntry = {
  id: string;
  // Pre-existing gap found (not introduced) while fixing an unrelated
  // pagination-redesign build: `ChangeHistory.kind` (models/ChangeHistory.ts)
  // has included "work_log" since the WL-3 time-tracking feature, but this
  // display type was never widened to match, and audit-log-table.tsx's
  // KIND_ICON lookup was never given a "work_log" case either — both were
  // silently masked by Next's/tsc's incremental build cache until a full
  // `.next` wipe (needed for unrelated reasons this session) forced a fresh
  // typecheck that surfaced it. Zero `work_log` rows exist in the real
  // database today (confirmed directly), so this was a real but dormant gap,
  // not something exercised in practice. Widened here to unblock the build
  // (Non-Negotiable #8) — the fallback rendering below (same branch
  // "field_change" already falls into) is a reasonable, non-crashing
  // placeholder, not full work-log UI, which is out of this phase's scope.
  kind: "field_change" | "comment" | "attachment" | "work_log";
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  commentText?: string;
  mentions?: string[];
  attachmentAction?: "added" | "removed";
  attachmentFilename?: string;
  memberId: string;
  createdAt: string;
};

// Pulls ![alt](url) image markdown out of a comment so it can render as a
// real inline thumbnail (pasted/dropped images, A6) while the remaining text
// still goes through the existing @mention-highlighting splitter below —
// the two renderers don't compose, so this keeps mentions working without
// switching comments over to a full Markdown renderer.
const IMAGE_MARKDOWN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function splitCommentImageSegments(
  text: string
): { isImage: boolean; text: string; url?: string }[] {
  const segments: { isImage: boolean; text: string; url?: string }[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(IMAGE_MARKDOWN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ isImage: false, text: text.slice(lastIndex, index) });
    segments.push({ isImage: true, text: match[1] || "attachment", url: match[2] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ isImage: false, text: text.slice(lastIndex) });
  return segments;
}

type FieldDefLite = { key: string; label: string; fieldType?: string };

function formatValue(
  field: string | undefined,
  value: unknown,
  ctx: { statuses: StatusOption[]; memberNames: Record<string, string>; fields: FieldDefLite[] }
): string {
  if (value === null || value === undefined || value === "") return "(none)";

  if (field === "status") {
    return ctx.statuses.find((s) => s.key === value)?.label ?? String(value);
  }
  if (field === "priority") {
    return PRIORITY_LABEL[value as Priority] ?? String(value);
  }
  if (field === "assignee") {
    return ctx.memberNames[String(value)] ?? "Unassigned";
  }
  if (field === "dueDate") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (field?.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    const def = ctx.fields.find((f) => f.key === key);
    if (def?.fieldType === "date") {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
  }
  if (field === "labels") {
    return Array.isArray(value) && value.length ? value.join(", ") : "(none)";
  }
  if (field === "isEpic") {
    return value ? "Epic" : "Not an Epic";
  }
  if (field === "collaborators") {
    if (!Array.isArray(value) || value.length === 0) return "(none)";
    return value.map((id) => ctx.memberNames[String(id)] ?? "Someone").join(", ");
  }
  if (field?.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    const def = ctx.fields.find((f) => f.key === key);
    if (def?.fieldType === "user_picker") {
      return ctx.memberNames[String(value)] ?? String(value);
    }
    return String(value);
  }
  return String(value);
}

// Full local date+time for the hover title on a rendered date value (dueDate
// or a "date"-type custom field) — mirrors formatValue's own date detection
// so the tooltip only shows up where the visible text is actually a date.
function formatValueTitle(
  field: string | undefined,
  value: unknown,
  ctx: { fields: FieldDefLite[] }
): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const isDateField =
    field === "dueDate" ||
    (field?.startsWith("customFields.") &&
      ctx.fields.find((f) => f.key === field.slice("customFields.".length))?.fieldType === "date");
  if (!isDateField) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : fullDateTimeTitle(d);
}

function fieldLabel(field: string | undefined, fields: FieldDefLite[]): string {
  if (!field) return "field";
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    return fields.find((f) => f.key === key)?.label ?? key;
  }
  const labels: Record<string, string> = {
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    assignee: "Assignee",
    collaborators: "Collaborators",
    labels: "Labels",
    dueDate: "Due date",
    originatedFromKind: "Origin type",
    originatedFromId: "Origin reference",
    isEpic: "Epic status",
  };
  return labels[field] ?? field;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function HistoryFeed({
  entries,
  statuses,
  fields,
  memberNames,
  memberEmails = {},
  teamMembersForMentions,
  realTeamMemberIds,
  teamName = "this Team",
}: {
  entries: HistoryEntry[];
  statuses: StatusOption[];
  fields: FieldDefLite[];
  memberNames: Record<string, string>;
  memberEmails?: Record<string, string>;
  teamMembersForMentions: { id: string; name: string }[];
  // Only used to flag a mentioned Member who isn't actually on this Team —
  // see the same prop on CommentForm.
  realTeamMemberIds?: Set<string>;
  teamName?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate">
        No activity yet. Changes and comments will show up here.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {entries.map((entry) => {
        const authorName = memberNames[entry.memberId] ?? "Someone";
        const authorEmail = memberEmails[entry.memberId];
        const author = (
          <MemberHoverCard name={authorName} email={authorEmail}>
            {authorName}
          </MemberHoverCard>
        );
        return (
          <li key={entry.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-slate">
              {entry.kind === "comment" ? (
                <MessageSquare className="h-3 w-3" />
              ) : entry.kind === "attachment" ? (
                <Paperclip className="h-3 w-3" />
              ) : (
                <HistoryIcon className="h-3 w-3" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {entry.kind === "comment" ? (
                <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-ink">{author}</span>
                    <span className="text-slate" title={fullDateTimeTitle(entry.createdAt)}>
                      · {timeAgo(entry.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-xs text-ink">
                    {splitCommentImageSegments(entry.commentText ?? "").map((imgSeg, i) =>
                      imgSeg.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={imgSeg.url}
                          alt={imgSeg.text}
                          className="my-1 block h-32 w-auto max-w-full rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span key={i}>
                          {splitMentionSegments(imgSeg.text, teamMembersForMentions).map((seg, j) => {
                            if (!seg.isMention) return <span key={j}>{seg.text}</span>;
                            const mentioned = teamMembersForMentions.find(
                              (m) => `@${m.name}`.toLowerCase() === seg.text.toLowerCase()
                            );
                            return (
                              <span key={j} className="inline-flex items-center gap-1">
                                <MemberHoverCard
                                  name={mentioned?.name ?? seg.text.slice(1)}
                                  email={mentioned ? memberEmails[mentioned.id] : undefined}
                                >
                                  <span className="font-medium text-primary">{seg.text}</span>
                                </MemberHoverCard>
                                {mentioned && realTeamMemberIds && !realTeamMemberIds.has(mentioned.id) && (
                                  <NotOnTeamBadge teamName={teamName} />
                                )}
                              </span>
                            );
                          })}
                        </span>
                      )
                    )}
                  </div>
                </div>
              ) : entry.kind === "attachment" ? (
                <p className="text-xs text-slate">
                  <span className="font-medium text-ink">{author}</span>{" "}
                  {entry.attachmentAction === "removed" ? "removed" : "added"}{" "}
                  <span className="font-medium text-ink">{entry.attachmentFilename}</span>{" "}
                  <span title={fullDateTimeTitle(entry.createdAt)}>· {timeAgo(entry.createdAt)}</span>
                </p>
              ) : (
                <p className="text-xs text-slate">
                  <span className="font-medium text-ink">{author}</span> changed{" "}
                  <span className="font-medium text-ink">
                    {fieldLabel(entry.field, fields)}
                  </span>{" "}
                  from{" "}
                  <span
                    className="font-medium text-ink"
                    title={formatValueTitle(entry.field, entry.oldValue, { fields })}
                  >
                    {formatValue(entry.field, entry.oldValue, { statuses, memberNames, fields })}
                  </span>{" "}
                  to{" "}
                  <span
                    className="font-medium text-ink"
                    title={formatValueTitle(entry.field, entry.newValue, { fields })}
                  >
                    {formatValue(entry.field, entry.newValue, { statuses, memberNames, fields })}
                  </span>{" "}
                  <span title={fullDateTimeTitle(entry.createdAt)}>· {timeAgo(entry.createdAt)}</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
