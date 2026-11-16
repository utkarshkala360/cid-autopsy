"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableBoardCard, type BoardItem } from "@board/components/work-items/board-card";
import { STATUS_CATEGORY_CLASSES, type StatusCategory } from "@board/lib/status-categories";
import { orderBetween, type ReorderRequest } from "@board/lib/ordering";
import { LoadMoreButton } from "@board/components/shared/load-more-button";
import type { WorkflowTransition } from "@board/lib/workflow";

export type BoardColumnDef = {
  key: string;
  label: string;
  category: StatusCategory;
  // BD-5: optional soft cap — shown as a visual warning past this count,
  // never enforced as a hard block on the drop itself.
  wipLimit?: number | null;
};

const DOT_CLASSES: Record<StatusCategory, string> = {
  todo: "bg-status-todo",
  in_progress: "bg-status-in-progress",
  done: "bg-status-done",
  blocked: "bg-status-blocked",
};

function groupByStatus(items: BoardItem[], columns: BoardColumnDef[]) {
  const map = new Map<string, BoardItem[]>(columns.map((c) => [c.key, []]));
  for (const item of items) {
    const bucket = map.get(item.status) ?? map.get(columns[0]?.key ?? "");
    bucket?.push(item);
  }
  for (const [, list] of map) list.sort((a, b) => a.order - b.order);
  return map;
}

function findContainer(id: string, grouped: Map<string, BoardItem[]>): string | undefined {
  if (grouped.has(id)) return id;
  for (const [status, list] of grouped) {
    if (list.some((i) => i.id === id)) return status;
  }
  return undefined;
}

function Column({
  column,
  items,
  itemHrefBase,
  canEdit,
  isValidDropTarget,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  showLoadMore,
}: {
  column: BoardColumnDef;
  items: BoardItem[];
  itemHrefBase: string;
  canEdit: boolean;
  isValidDropTarget: boolean;
  // Pagination redesign: the API's true count for this column, NOT
  // items.length (only what's currently loaded client-side) — a WIP-limit
  // warning must stay correct even when the column is paginated and only
  // partially loaded.
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  showLoadMore: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const overLimit = !!column.wipLimit && total > column.wipLimit;

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOT_CLASSES[column.category]}`} />
          <span className="text-xs font-semibold text-ink">{column.label}</span>
        </div>
        <span
          title={overLimit ? `Over the WIP limit of ${column.wipLimit}` : undefined}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            overLimit
              ? "bg-status-blocked-bg text-status-blocked"
              : "bg-muted text-slate"
          }`}
        >
          {total}
          {column.wipLimit ? ` / ${column.wipLimit}` : ""}
        </span>
      </div>
      {overLimit && (
        <p className="border-b border-status-blocked-bg bg-status-blocked-bg px-3 py-1 text-[10px] font-medium text-status-blocked">
          Over WIP limit — consider finishing some before starting more.
        </p>
      )}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto p-2.5 transition-colors ${
            isOver && isValidDropTarget ? "bg-primary/5" : ""
          } ${isOver && !isValidDropTarget ? "bg-status-blocked-bg" : ""}`}
        >
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border py-6 text-center text-[11px] text-slate">
              Drop here
            </div>
          ) : (
            items.map((item) => (
              <SortableBoardCard
                key={item.id}
                item={item}
                itemHref={`${itemHrefBase}/${item.id}`}
                canDrag={canEdit}
              />
            ))
          )}
        </div>
      </SortableContext>
      {showLoadMore && (
        <LoadMoreButton
          hasMore={hasMore}
          loading={loadingMore}
          loadedCount={items.length}
          total={total}
          onClick={onLoadMore}
          itemLabel="card"
          className="border-t border-border"
        />
      )}
    </div>
  );
}

export type ColumnPageMeta = { total: number; hasMore: boolean; loading: boolean };

export function KanbanBoard({
  items,
  columns,
  transitions,
  itemHrefBase,
  canEdit,
  onMove,
  itemLabel = "Task",
  columnMeta,
  onLoadMoreColumn,
  showLoadMore,
}: {
  items: BoardItem[];
  columns: BoardColumnDef[];
  transitions: WorkflowTransition[];
  itemHrefBase: string;
  canEdit: boolean;
  onMove: (itemId: string, patch: { status?: string; order: number; reorder: ReorderRequest }) => void;
  itemLabel?: string;
  // Pagination redesign — per-column "Load More" (Design 3). Keyed by
  // status key; a column not present here (shouldn't happen — board/
  // page.tsx seeds one entry per Workflow status) falls back to
  // items.length/no-more, never a crash.
  columnMeta: Record<string, ColumnPageMeta>;
  onLoadMoreColumn: (statusKey: string) => void;
  // false for the two non-paginated BoardView consumers (Sprint board,
  // Subtask board) — suppresses the Load More UI (including the "all N
  // loaded" end state) entirely, keeping them visually identical to before
  // this redesign.
  showLoadMore: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragStatus, setDragStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Map<string, BoardItem[]> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const grouped = useMemo(() => groupByStatus(items, columns), [items, columns]);
  const view = preview ?? grouped;

  const allowedTargets = useMemo(() => {
    if (!dragStatus) return null;
    const set = new Set(
      transitions.filter((t) => t.from === dragStatus).map((t) => t.to)
    );
    set.add(dragStatus);
    return set;
  }, [dragStatus, transitions]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setDragStatus(findContainer(id, grouped) ?? null);
    setPreview(new Map([...grouped].map(([k, v]) => [k, [...v]])));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !preview) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const fromContainer = findContainer(activeId, preview);
    const toContainer = findContainer(overId, preview);
    if (!fromContainer || !toContainer) return;
    if (allowedTargets && !allowedTargets.has(toContainer)) return;

    setPreview((prev) => {
      if (!prev) return prev;
      const next = new Map([...prev].map(([k, v]) => [k, [...v]]));
      const fromList = next.get(fromContainer)!;
      const movingIndex = fromList.findIndex((i) => i.id === activeId);
      if (movingIndex === -1) return prev;

      if (fromContainer === toContainer) {
        const overIndex = fromList.findIndex((i) => i.id === overId);
        if (overIndex === -1) return prev;
        next.set(fromContainer, arrayMove(fromList, movingIndex, overIndex));
        return next;
      }

      const [moving] = fromList.splice(movingIndex, 1);
      const toList = next.get(toContainer)!;
      const overIndex = toList.findIndex((i) => i.id === overId);
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, moving);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const id = String(active.id);
    const originalStatus = dragStatus;
    setActiveId(null);
    setDragStatus(null);

    if (!over || !preview || !originalStatus) {
      setPreview(null);
      return;
    }

    const finalContainer = findContainer(id, preview) ?? originalStatus;
    const finalList = preview.get(finalContainer) ?? [];
    const index = finalList.findIndex((i) => i.id === id);
    // Predecessor/successor in the locally-loaded (possibly paginated) list
    // — used for an immediate optimistic visual placeholder only. The
    // server (resolveServerOrder, Design 2) re-derives the TRUE
    // DB-adjacent sibling from the ids below rather than trusting this
    // client-computed order value, so a drop at the edge of a
    // partially-loaded column still lands correctly.
    const predecessor = index > 0 ? finalList[index - 1] : undefined;
    const successor = index >= 0 && index < finalList.length - 1 ? finalList[index + 1] : undefined;
    const newOrder = orderBetween(predecessor?.order, successor?.order);
    const reorder: ReorderRequest = {
      scope: "column",
      afterItemId: predecessor?.id ?? null,
      beforeItemId: successor?.id ?? null,
    };

    setPreview(null);
    if (finalContainer === originalStatus) {
      // Pure reorder within the same column — still worth persisting so the
      // rank survives a refresh, but it's not a status change.
      if (newOrder !== items.find((i) => i.id === id)?.order) {
        onMove(id, { order: newOrder, reorder });
      }
      return;
    }
    onMove(id, { status: finalContainer, order: newOrder, reorder });
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Inbox className="h-7 w-7" />
        </div>
        <h2 className="font-heading text-lg font-bold text-ink">Board is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
          No {itemLabel.toLowerCase()}s yet — create one to see it land in{" "}
          {columns[0]?.label ?? "the first column"}.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const meta = columnMeta[column.key];
          const columnItems = view.get(column.key) ?? [];
          return (
            <Column
              key={column.key}
              column={column}
              items={columnItems}
              itemHrefBase={itemHrefBase}
              canEdit={canEdit}
              isValidDropTarget={!allowedTargets || allowedTargets.has(column.key)}
              total={meta?.total ?? columnItems.length}
              hasMore={meta?.hasMore ?? false}
              loadingMore={meta?.loading ?? false}
              onLoadMore={() => onLoadMoreColumn(column.key)}
              showLoadMore={showLoadMore}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeItem ? (
          <SortableBoardCard item={activeItem} itemHref={`${itemHrefBase}/${activeItem.id}`} canDrag />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
