import "server-only";

// Pagination redesign — Design 2: server-side authoritative drag-and-drop
// order. Previously KanbanBoard/BacklogList computed a new fractional
// `order` client-side via orderBetween(), using neighbor items from the
// client's own loaded array — only safe when the client holds every real
// sibling, which stops being true once Board/Backlog are paginated (a card
// dropped at the bottom of a partially-loaded column has no way to know
// its true next DB sibling beyond what's loaded).
//
// This module moves that computation server-side: given the two
// CLIENT-BELIEVED neighbor ids (afterItemId/beforeItemId — see
// ReorderRequest in ordering.ts), it looks up their *current* `order`
// values (trusting the ids, never a client-computed order number), then —
// this is the actual fix — re-derives the TRUE DB-adjacent sibling on
// whichever side is "open" (a null id, or an id that no longer resolves
// within scope) instead of assuming a null side means "the real end/start
// of the list." A same-column interior drop and a boundary drop at the
// edge of a loaded page are therefore the exact same code path here: the
// server never trusts "this is the end" from the client, it always
// re-checks against the live data.
import { WorkItem } from "@board/models/WorkItem";
import { orderBetween } from "@board/lib/ordering";
import type { ReorderRequest } from "@board/lib/ordering";

export type ResolveOrderInput = {
  teamId: string;
  type: string;
  /** The dragged item itself — excluded from every neighbor lookup below,
   * since its own current position is irrelevant to where it's landing. */
  itemId: string;
  /** The item's status AFTER this PATCH is applied (its new status if this
   * request also changes status, else its unchanged current status) — the
   * scope boundary for `scope: "column"`. */
  status: string;
} & ReorderRequest;

type OrderOnly = { order: number };

export async function resolveServerOrder(input: ResolveOrderInput): Promise<number> {
  const { teamId, type, itemId, status, scope, afterItemId, beforeItemId } = input;

  // Base scope filter — teamId/type(/status), deliberately WITHOUT an `_id`
  // key, so it can be safely spread together with an explicit `_id` match
  // (direct neighbor-by-id lookups) or an `_id: { $ne }` exclusion
  // (true-sibling scans) without either clobbering the other via object-
  // spread key collision.
  const baseFilter: Record<string, unknown> = { teamId, type };
  if (scope === "column") baseFilter.status = status;
  const excludeDragged = { _id: { $ne: itemId } };

  // Trust the ids, not any order value the client might have sent — look
  // up each claimed neighbor's REAL, current order directly. A stale/
  // invalid id (deleted, or moved out of scope since the client last
  // fetched) resolves to `null` here, which the re-derivation below treats
  // identically to "client didn't give us one."
  const [afterItem, beforeItem] = await Promise.all([
    afterItemId
      ? WorkItem.findOne({ ...baseFilter, _id: afterItemId }, "order").lean<OrderOnly | null>()
      : Promise.resolve(null),
    beforeItemId
      ? WorkItem.findOne({ ...baseFilter, _id: beforeItemId }, "order").lean<OrderOnly | null>()
      : Promise.resolve(null),
  ]);

  let afterOrder = afterItem?.order;
  let beforeOrder = beforeItem?.order;

  // The "before" side is open (client believes nothing follows the drop
  // position, or its claimed successor no longer resolves) — this is
  // exactly the boundary case pagination introduces: don't assume it's the
  // real end of the column/list, check for a true next sibling first.
  if (beforeOrder === undefined) {
    const realNext = await WorkItem.findOne(
      {
        ...baseFilter,
        ...excludeDragged,
        ...(afterOrder !== undefined ? { order: { $gt: afterOrder } } : {}),
      },
      "order"
    )
      .sort({ order: 1 })
      .lean<OrderOnly | null>();
    if (realNext) beforeOrder = realNext.order;
  }

  // Symmetric on the "after" side (defensive — the client's initial page
  // always includes the true first item of a scope today, so this branch
  // isn't reachable from the current UI, but the server still shouldn't
  // assume that invariant holds forever).
  if (afterOrder === undefined) {
    const realPrev = await WorkItem.findOne(
      {
        ...baseFilter,
        ...excludeDragged,
        ...(beforeOrder !== undefined ? { order: { $lt: beforeOrder } } : {}),
      },
      "order"
    )
      .sort({ order: -1 })
      .lean<OrderOnly | null>();
    if (realPrev) afterOrder = realPrev.order;
  }

  // afterOrder = the resolved predecessor's order -> orderBetween's
  // `before` parameter; beforeOrder = the resolved successor's order ->
  // orderBetween's `after` parameter. Same predecessor/successor concept,
  // opposite param names between the two — see ordering.ts's ReorderRequest
  // comment.
  return orderBetween(afterOrder, beforeOrder);
}
