"use client";

import { useState } from "react";
import { ListOrdered } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableBoardCard, type BoardItem } from "@board/components/work-items/board-card";
import { orderBetween, sortByOrder, type ReorderRequest } from "@board/lib/ordering";
import { LoadMoreButton } from "@board/components/shared/load-more-button";
import type { BoardColumnDef } from "@board/components/work-items/kanban-board";

// Flat, all-statuses prioritization list (BD-7) — a Team's whole queue
// ranked by drag order, independent of which column a card happens to be
// in. Reuses the same BoardItem/SortableBoardCard as the Kanban board so
// the two views never visually drift apart.
export function BacklogList({
  items,
  columns,
  itemHrefBase,
  canEdit,
  onReorder,
  itemLabel = "Task",
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  showLoadMore,
}: {
  items: BoardItem[];
  columns: BoardColumnDef[];
  itemHrefBase: string;
  canEdit: boolean;
  onReorder: (itemId: string, order: number, reorder: ReorderRequest) => void;
  itemLabel?: string;
  // Pagination redesign — Backlog is one paginated flat list (Design 3).
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  showLoadMore: boolean;
}) {
  const [prevItems, setPrevItems] = useState(items);
  const [ordered, setOrdered] = useState(() => sortByOrder(items));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const statusMetaByKey = new Map(columns.map((c) => [c.key, { label: c.label, category: c.category }]));

  // The shared items array can change from outside this view (e.g. a status
  // move made on the Kanban tab) — resync when the parent hands us a new
  // reference (React's documented "adjusting state on prop change" pattern).
  if (items !== prevItems) {
    setPrevItems(items);
    setOrdered(sortByOrder(items));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((i) => i.id === active.id);
    const newIndex = ordered.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(reordered);

    // Same "optimistic placeholder + server re-derives the true sibling"
    // split as KanbanBoard — see that component's handleDragEnd for the
    // full rationale. Backlog's scope is "team" (no status filter): it's
    // one flat, all-statuses priority queue, not per-column.
    const predecessor = newIndex > 0 ? reordered[newIndex - 1] : undefined;
    const successor = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : undefined;
    const newOrder = orderBetween(predecessor?.order, successor?.order);
    onReorder(String(active.id), newOrder, {
      scope: "team",
      afterItemId: predecessor?.id ?? null,
      beforeItemId: successor?.id ?? null,
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ListOrdered className="h-7 w-7" />
        </div>
        <h2 className="font-heading text-lg font-bold text-ink">Backlog is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
          {itemLabel}s you create will show up here, ranked by priority order.
        </p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {ordered.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-[11px] font-medium text-slate">
                {index + 1}
              </span>
              <SortableBoardCard
                item={item}
                itemHref={`${itemHrefBase}/${item.id}`}
                canDrag={canEdit}
                statusMeta={statusMetaByKey.get(item.status)}
              />
            </div>
          ))}
        </div>
      </SortableContext>
      {showLoadMore && (
        <LoadMoreButton
          hasMore={hasMore}
          loading={loadingMore}
          loadedCount={items.length}
          total={total}
          onClick={onLoadMore}
          itemLabel={itemLabel.toLowerCase()}
          className="mx-auto max-w-2xl"
        />
      )}
    </DndContext>
  );
}
