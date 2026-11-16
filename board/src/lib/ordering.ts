// Fractional-index ordering shared by the Kanban board (within-column order)
// and the Backlog drag-to-reorder view (BD-2/BD-7). Only the moved card's
// `order` is ever written — neighbors are left untouched — so a reorder is
// always a single-field PATCH through the normal Work Item route.
//
// Pagination redesign (Design 2): the actual `order` value is now computed
// SERVER-SIDE (src/lib/work-item-reorder.ts, PATCH .../work-items/[itemId])
// rather than client-side via orderBetween() below using the client's
// locally-loaded neighbor items — that stopped being safe once Board/
// Backlog pages their data (a client can't know the TRUE DB-adjacent
// sibling beyond what it has loaded). `orderBetween` itself is unchanged
// and still used client-side, but now only for an immediate *optimistic*
// visual placeholder (smooth drag feedback) — the server's response is
// authoritative and reconciles local state afterward (board-view.tsx).
//
// This type is the wire shape KanbanBoard/BacklogList send instead of a
// raw order value. Deliberately kept in this DB-free file (not
// work-item-reorder.ts, which is server-only) since both client components
// import it directly.
export type ReorderRequest = {
  // "column": true within-a-status scope (Kanban — same-column reorder or
  // a cross-column drop, always scoped to the item's post-move status).
  // "team": no status scoping at all (Backlog — one flat, all-statuses
  // priority queue for the Team).
  scope: "column" | "team";
  // The sibling the dragged item should land AFTER (its new predecessor) —
  // null means "believed to be the first item" (see afterItemId's use as
  // orderBetween's `before` argument below: same predecessor concept,
  // opposite param name — a known source of confusion, called out
  // deliberately here).
  afterItemId: string | null;
  // The sibling the dragged item should land BEFORE (its new successor) —
  // null means "believed to be the last item," which is exactly the
  // boundary case that's unsafe to trust once a column/list is paginated
  // (see work-item-reorder.ts's re-derivation of the true DB sibling).
  beforeItemId: string | null;
};

const GAP = 1000;

/** Rank to give a brand-new Work Item so it sorts after everything else. */
export function nextCreateOrder(existingOrders: number[]): number {
  if (existingOrders.length === 0) return GAP;
  return Math.max(...existingOrders) + GAP;
}

/**
 * Rank to give a card dropped between `before` and `after` (either end may
 * be undefined for "dropped at the start/end of the list"). Halves the gap
 * between neighbors; falls back to GAP-sized steps off the nearest neighbor
 * when there's no neighbor on that side.
 */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return GAP;
  if (before === undefined) return (after as number) - GAP;
  if (after === undefined) return before + GAP;
  return (before + after) / 2;
}

export function sortByOrder<T extends { order: number; createdAt?: string | Date }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}
