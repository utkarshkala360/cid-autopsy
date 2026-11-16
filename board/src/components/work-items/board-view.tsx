"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { KanbanBoard, type BoardColumnDef, type ColumnPageMeta } from "@board/components/work-items/kanban-board";
import { BacklogList } from "@board/components/work-items/backlog-list";
import type { BoardItem } from "@board/components/work-items/board-card";
import type { WorkflowTransition } from "@board/lib/workflow";
import type { ReorderRequest } from "@board/lib/ordering";
import { encodeViewConfig, type ViewConfig } from "@board/lib/work-item-views";

const BOARD_PAGE_SIZE = 50;

type BacklogMeta = { total: number; hasMore: boolean; loading: boolean };

// Owns the one shared `items` array for both the Kanban and Backlog tabs, so
// a move made in one tab is immediately reflected in the other FOR ANY ITEM
// BOTH TABS HAVE LOADED. Every mutation is optimistic-then-persisted through
// the same PATCH `/dashboard/board/api/teams/{teamId}/work-items/{itemId}` route Phase 4
// built — status moves get diffed into ChangeHistory there exactly as they
// would from the detail page; a failed request rolls the local state back.
//
// Pagination redesign (Design 3, Board section): `items` no longer holds
// EVERY Work Item on the Team — each Kanban column and the Backlog tab now
// load and paginate independently (their own total/hasMore/page), appending
// into this same shared array via "Load More." Perfect cross-tab sync is
// therefore only guaranteed for items already loaded somewhere — the same
// "partial view" tradeoff every paginated UI accepts (e.g. a card that only
// Kanban has loaded won't retroactively appear in Backlog until Backlog's
// own pagination reaches it). Drag-and-drop order itself is always correct
// regardless of what's loaded — see Design 2 / work-item-reorder.ts — this
// tradeoff is purely about which cards are currently *visible*, never about
// where a dropped card's rank actually lands in the true DB order.
export function BoardView({
  teamId,
  type,
  filterConfig,
  itemHrefBase,
  columns,
  transitions,
  initialItems,
  initialColumnMeta,
  initialBacklogMeta,
  canEdit,
  itemLabel = "Task",
}: {
  teamId: string;
  itemHrefBase: string;
  columns: BoardColumnDef[];
  transitions: WorkflowTransition[];
  initialItems: BoardItem[];
  canEdit: boolean;
  // Per-Team template display noun (Task/Ticket, WT-1) used only for empty-
  // state copy — the board layout, drag logic, and column mapping are
  // identical for every template (ORG-4).
  itemLabel?: string;
  // Pagination redesign — all four OPTIONAL: only the Team-level Board page
  // (teams/[teamId]/board/page.tsx) supplies these, opting this instance
  // into per-column/Backlog "Load More." The two other BoardView consumers
  // — the Sprint board (initiative-detail.tsx) and the nested Subtask board
  // (subtasks-panel.tsx) — render a small, already-bounded item set
  // (one Sprint's items / one parent's sub-tasks) where pagination doesn't
  // apply and was explicitly out of scope for this pass; they keep working
  // unchanged by simply omitting these, which puts this component in
  // "static" mode (every item already loaded, no Load More UI shown at
  // all — not even the paginated "all N loaded" footer, to stay visually
  // identical to before for those two surfaces).
  type?: string;
  filterConfig?: ViewConfig;
  initialColumnMeta?: { key: string; total: number; hasMore: boolean }[];
  initialBacklogMeta?: { total: number; hasMore: boolean };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<"board" | "backlog">("board");
  const [error, setError] = useState<string | null>(null);

  const paginationEnabled = type !== undefined && filterConfig !== undefined;

  // Static mode (Sprint board / Subtask board, no pagination props given):
  // every item is already in `initialItems`, so totals are just real counts
  // over that array — NOT zero — otherwise the WIP-limit badge would show
  // "0 / N" instead of the true count for those two surfaces.
  const [columnMeta, setColumnMeta] = useState<Record<string, ColumnPageMeta & { page: number }>>(() =>
    Object.fromEntries(
      (
        initialColumnMeta ??
        columns.map((c) => ({ key: c.key, total: initialItems.filter((i) => i.status === c.key).length, hasMore: false }))
      ).map((c) => [c.key, { total: c.total, hasMore: c.hasMore, loading: false, page: 1 }])
    )
  );
  const [backlogMeta, setBacklogMeta] = useState<BacklogMeta & { page: number }>({
    total: initialBacklogMeta?.total ?? initialItems.length,
    hasMore: initialBacklogMeta?.hasMore ?? false,
    loading: false,
    page: 1,
  });

  function mergeItems(fetched: BoardItem[]) {
    setItems((current) => {
      const existingIds = new Set(current.map((i) => i.id));
      const newOnes = fetched.filter((i) => !existingIds.has(i.id));
      return newOnes.length ? [...current, ...newOnes] : current;
    });
  }

  async function loadMoreColumn(statusKey: string) {
    if (!paginationEnabled) return;
    const meta = columnMeta[statusKey];
    if (!meta || meta.loading || !meta.hasMore) return;
    setColumnMeta((prev) => ({ ...prev, [statusKey]: { ...prev[statusKey], loading: true } }));

    const nextPage = meta.page + 1;
    const search = new URLSearchParams({
      type: type!,
      mode: "board",
      status: statusKey,
      view: encodeViewConfig(filterConfig!),
      page: String(nextPage),
      pageSize: String(BOARD_PAGE_SIZE),
    });
    try {
      const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items?${search.toString()}`);
      if (!res.ok) throw new Error("Load more failed");
      const data = await res.json();
      mergeItems(data.items);
      setColumnMeta((prev) => ({
        ...prev,
        [statusKey]: { total: data.total, hasMore: data.hasMore, loading: false, page: nextPage },
      }));
    } catch {
      setColumnMeta((prev) => ({ ...prev, [statusKey]: { ...prev[statusKey], loading: false } }));
      toast.error("Couldn't load more cards — try again.");
    }
  }

  async function loadMoreBacklog() {
    if (!paginationEnabled) return;
    if (backlogMeta.loading || !backlogMeta.hasMore) return;
    setBacklogMeta((prev) => ({ ...prev, loading: true }));

    const nextPage = backlogMeta.page + 1;
    const search = new URLSearchParams({
      type: type!,
      mode: "board",
      view: encodeViewConfig(filterConfig!),
      page: String(nextPage),
      pageSize: String(BOARD_PAGE_SIZE),
    });
    try {
      const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items?${search.toString()}`);
      if (!res.ok) throw new Error("Load more failed");
      const data = await res.json();
      mergeItems(data.items);
      setBacklogMeta({ total: data.total, hasMore: data.hasMore, loading: false, page: nextPage });
    } catch {
      setBacklogMeta((prev) => ({ ...prev, loading: false }));
      toast.error("Couldn't load more of the Backlog — try again.");
    }
  }

  async function persist(itemId: string, patch: Record<string, unknown>, previous: BoardItem[]) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setItems(previous);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save that move — it's been reverted.");
      return;
    }
    const data = await res.json().catch(() => null);
    // Pagination redesign — Design 2: `order` is now computed
    // server-side (resolveServerOrder), so the optimistic value applied
    // immediately below is only ever a placeholder for smooth drag
    // feedback — reconcile local state with the real, authoritative value
    // the PATCH just returned. Matters most for the boundary-drop case
    // pagination introduces (dropping at the edge of a partially-loaded
    // column): the server's real order can legitimately differ from the
    // client's guess once unseen siblings exist beyond what's loaded.
    if (typeof data?.workItem?.order === "number") {
      const realOrder = data.workItem.order as number;
      setItems((current) => current.map((i) => (i.id === itemId ? { ...i, order: realOrder } : i)));
    }
    // XM-3: same Team-Admin-configured, never-automatic stage suggestion
    // the detail page's status field surfaces — a drag move is just
    // another way a status changes.
    if (data?.stageNudge) {
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
  }

  function applyOptimistic(
    itemId: string,
    patch: { status?: string; order: number; reorder: ReorderRequest }
  ) {
    const previous = items;
    const movedItem = items.find((i) => i.id === itemId);
    const next = items.map((i) =>
      i.id === itemId ? { ...i, ...(patch.status ? { status: patch.status } : {}), order: patch.order } : i
    );
    setItems(next);

    // A cross-column move changes which column's WIP total each side
    // reports — reflect that optimistically too (reconciled to the real
    // server total on this column's next Load More / next full page load,
    // same as every other optimistic value here).
    if (patch.status && movedItem && movedItem.status !== patch.status) {
      const fromKey = movedItem.status;
      const toKey = patch.status;
      setColumnMeta((prev) => ({
        ...prev,
        ...(prev[fromKey] ? { [fromKey]: { ...prev[fromKey], total: Math.max(0, prev[fromKey].total - 1) } } : {}),
        ...(prev[toKey] ? { [toKey]: { ...prev[toKey], total: prev[toKey].total + 1 } } : {}),
      }));
    }

    const serverPatch: Record<string, unknown> = { reorder: patch.reorder };
    if (patch.status) serverPatch.status = patch.status;
    void persist(itemId, serverPatch, previous);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border bg-panel p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setTab("board")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "board" ? "bg-primary text-primary-foreground" : "text-slate hover:text-ink"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setTab("backlog")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "backlog" ? "bg-primary text-primary-foreground" : "text-slate hover:text-ink"
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Backlog
          </button>
        </div>
        {!canEdit && (
          <span className="text-[11px] text-slate">Viewer access — drag is disabled.</span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-status-blocked-bg px-3 py-2 text-xs font-medium text-status-blocked">
          {error}
        </p>
      )}

      {tab === "board" ? (
        <KanbanBoard
          items={items}
          columns={columns}
          transitions={transitions}
          itemHrefBase={itemHrefBase}
          canEdit={canEdit}
          onMove={applyOptimistic}
          itemLabel={itemLabel}
          columnMeta={columnMeta}
          onLoadMoreColumn={loadMoreColumn}
          showLoadMore={paginationEnabled}
        />
      ) : (
        <BacklogList
          items={items}
          columns={columns}
          itemHrefBase={itemHrefBase}
          canEdit={canEdit}
          onReorder={(itemId, order, reorder) => applyOptimistic(itemId, { order, reorder })}
          itemLabel={itemLabel}
          total={backlogMeta.total}
          hasMore={backlogMeta.hasMore}
          loadingMore={backlogMeta.loading}
          onLoadMore={loadMoreBacklog}
          showLoadMore={paginationEnabled}
        />
      )}
    </div>
  );
}
