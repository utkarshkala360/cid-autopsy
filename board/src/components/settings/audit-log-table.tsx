import Link from "next/link";
import { MessageSquare, History as HistoryIcon, Paperclip } from "lucide-react";
import type { AuditLogEntry } from "@board/lib/audit-log";
import { fullDateTimeTitle } from "@board/lib/format-date";

const KIND_ICON = {
  field_change: HistoryIcon,
  comment: MessageSquare,
  attachment: Paperclip,
  // Pre-existing gap (not introduced by this change) — see the matching
  // comment on HistoryEntry.kind in history-feed.tsx. No real work_log
  // rows exist yet, so this is a safe generic fallback, not full work-log
  // iconography.
  work_log: HistoryIcon,
} as const;

// CT-7: flat, filterable rows across every Team/Customer/Initiative — a
// deliberately simpler visual language than the per-entity HistoryFeed
// (no mention highlighting, no image thumbnails), since this view's job is
// "find the change," not "read the conversation."
export function AuditLogTable({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate">
        No activity matches the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
            <th className="pb-2 pr-4 font-semibold">When</th>
            <th className="pb-2 pr-4 font-semibold">Who</th>
            <th className="pb-2 pr-4 font-semibold">Team</th>
            <th className="pb-2 pr-4 font-semibold">Entity</th>
            <th className="pb-2 pr-4 font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const Icon = KIND_ICON[entry.kind];
            return (
              <tr key={entry.id} className="border-b border-border align-top last:border-0">
                <td
                  className="whitespace-nowrap py-2.5 pr-4 text-xs text-slate"
                  title={fullDateTimeTitle(entry.createdAt)}
                >
                  {new Date(entry.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-2.5 pr-4 text-xs font-medium text-ink">{entry.memberName}</td>
                <td className="py-2.5 pr-4 text-xs text-slate">{entry.teamName ?? "—"}</td>
                <td className="py-2.5 pr-4 text-xs">
                  {entry.entityHref ? (
                    <Link href={entry.entityHref} className="font-medium text-ink hover:text-primary">
                      {entry.entityLabel}
                    </Link>
                  ) : (
                    <span className="text-slate">{entry.entityLabel}</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-xs text-slate">
                  <span className="inline-flex items-start gap-1.5">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{entry.description}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
