import Link from "next/link";
import { ArrowUpRight, MessageSquare, Sparkles, GitCommitHorizontal } from "lucide-react";
import type { TimelineEntry } from "@board/lib/timeline";
import { fullDateTimeTitle } from "@board/lib/format-date";

/**
 * XM-2: a single chronological feed per Customer/Initiative, merging macro
 * stage changes with activity (creation, status changes, comments) from
 * every Work Item linked to it. Pure presentational — no data fetching, no
 * client state — the page loader already built and sorted `entries`
 * (sortTimeline in lib/timeline.ts), the same "server-fetched, no
 * mount-time effect" convention every other read-only panel in this
 * codebase follows.
 */
export function TimelineFeed({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-4 text-center text-xs text-slate">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-2.5 text-xs">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-slate">
            {entry.kind === "stage_change" && <Sparkles className="h-3 w-3" />}
            {entry.kind === "item_created" && <ArrowUpRight className="h-3 w-3" />}
            {entry.kind === "item_status_change" && <GitCommitHorizontal className="h-3 w-3" />}
            {entry.kind === "item_comment" && <MessageSquare className="h-3 w-3" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-ink">
              <span className="font-medium">{entry.memberName}</span>{" "}
              {entry.kind === "stage_change" && (
                <>
                  moved the stage{" "}
                  <span className="font-medium">{entry.oldLabel ?? "(none)"}</span> →{" "}
                  <span className="font-medium">{entry.newLabel ?? "(none)"}</span>
                </>
              )}
              {entry.kind === "item_created" && (
                <>
                  created{" "}
                  <Link
                    href={`/dashboard/board/teams/${entry.teamId}/work-items/${entry.itemId}`}
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    {entry.itemKey} — {entry.itemTitle}
                  </Link>
                </>
              )}
              {entry.kind === "item_status_change" && (
                <>
                  moved{" "}
                  <Link
                    href={`/dashboard/board/teams/${entry.teamId}/work-items/${entry.itemId}`}
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    {entry.itemKey}
                  </Link>{" "}
                  from <span className="font-medium">{entry.oldLabel}</span> to{" "}
                  <span className="font-medium">{entry.newLabel}</span>
                </>
              )}
              {entry.kind === "item_comment" && (
                <>
                  commented on{" "}
                  <Link
                    href={`/dashboard/board/teams/${entry.teamId}/work-items/${entry.itemId}`}
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    {entry.itemKey}
                  </Link>
                  {entry.commentPreview ? `: "${entry.commentPreview}"` : ""}
                </>
              )}
            </p>
            <span className="text-[10px] text-slate" title={fullDateTimeTitle(entry.createdAt)}>
              {new Date(entry.createdAt).toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
