"use client";

import { Loader2 } from "lucide-react";

// Shared "Load More" pagination control — one presentational component
// reused by Work Items (flat + per-group), Customers, Initiatives, and the
// Board's per-column/Backlog pagination, instead of four bespoke
// implementations. Always renders a real state (Non-Negotiable #7): a
// spinner while fetching the next page, or an explicit "all N loaded" end
// state once there's nothing left — never nothing, never a silent stop.
export function LoadMoreButton({
  hasMore,
  loading,
  loadedCount,
  total,
  onClick,
  itemLabel = "item",
  className = "",
}: {
  hasMore: boolean;
  loading: boolean;
  loadedCount: number;
  total: number;
  onClick: () => void;
  itemLabel?: string;
  className?: string;
}) {
  if (!hasMore) {
    if (total === 0) return null;
    return (
      <p className={`py-2.5 text-center text-[11px] text-slate ${className}`}>
        All {total} {itemLabel}
        {total === 1 ? "" : "s"} loaded.
      </p>
    );
  }

  return (
    <div className={`flex items-center justify-center py-2.5 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {loading ? "Loading…" : `Load more (${loadedCount} of ${total})`}
      </button>
    </div>
  );
}
