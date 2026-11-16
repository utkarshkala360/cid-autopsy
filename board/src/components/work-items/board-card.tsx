"use client";

import Link from "next/link";
import { GripVertical, CalendarClock, Building2, Layers } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PriorityBadge } from "@board/components/work-items/priority-badge";
import { StatusPill } from "@board/components/work-items/status-pill";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { fullDateTimeTitle } from "@board/lib/format-date";
import type { Priority, StatusCategory } from "@board/lib/status-categories";

// Shared card shape for the Kanban board and the Backlog list (Phase 5) —
// keeping one card type/renderer means both views always look and behave
// identically, and Support's Ticket board (Phase 6) gets this for free.
export type BoardItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: Priority;
  assigneeName: string | null;
  labels: string[];
  dueDate: string | null;
  order: number;
  createdAt: string;
  // Set only for Ticket work items (WT-1) — a Support agent should be able
  // to see who a Ticket belongs to without opening it. Null/absent for
  // every other template, so this adds nothing to a Task card.
  customerName?: string | null;
  // IT-8: marks this card as an Epic container — purely a display flag,
  // Epic children are ordinary cards with their own status.
  isEpic?: boolean;
};

const PRIORITY_ACCENT: Record<Priority, string> = {
  low: "border-l-status-todo",
  medium: "border-l-status-in-progress",
  high: "border-l-status-blocked",
  urgent: "border-l-status-blocked",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CardBody({
  item,
  itemHref,
  statusMeta,
}: {
  item: BoardItem;
  itemHref: string;
  statusMeta?: { label: string; category: StatusCategory };
}) {
  const due = item.dueDate ? new Date(item.dueDate) : null;
  const isOverdue = due ? due < new Date() : false;

  return (
    <Link href={itemHref} className="block min-w-0 flex-1 py-2.5 pr-2.5">
      <p className="text-[10px] font-mono font-medium text-slate">{item.key}</p>
      <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">{item.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.isEpic && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            <Layers className="h-2.5 w-2.5" />
            Epic
          </span>
        )}
        {statusMeta && <StatusPill label={statusMeta.label} category={statusMeta.category} />}
        <PriorityBadge priority={item.priority} />
        {item.labels.slice(0, 2).map((label) => (
          <span
            key={label}
            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate"
          >
            {label}
          </span>
        ))}
      </div>
      {item.customerName && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{item.customerName}</span>
        </div>
      )}
      {(due || item.assigneeName) && (
        <div className="mt-2 flex items-center justify-between">
          {due ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${
                isOverdue ? "font-medium text-status-blocked" : "text-slate"
              }`}
              title={fullDateTimeTitle(due)}
            >
              <CalendarClock className="h-3 w-3" />
              {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ) : (
            <span />
          )}
          {item.assigneeName && (
            <MemberHoverCard name={item.assigneeName}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                {initials(item.assigneeName)}
              </span>
            </MemberHoverCard>
          )}
        </div>
      )}
    </Link>
  );
}

/** Draggable card — used inside a dnd-kit SortableContext. */
export function SortableBoardCard({
  item,
  itemHref,
  canDrag,
  statusMeta,
}: {
  item: BoardItem;
  itemHref: string;
  canDrag: boolean;
  statusMeta?: { label: string; category: StatusCategory };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`card-${item.key}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch rounded-md border border-border bg-panel shadow-2xs border-l-2 ${
        PRIORITY_ACCENT[item.priority]
      } ${isDragging ? "opacity-40" : "hover:border-primary/40"}`}
    >
      {canDrag && (
        <button
          type="button"
          aria-label="Drag to move"
          {...attributes}
          {...listeners}
          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center text-slate/60 hover:text-slate active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <CardBody item={item} itemHref={itemHref} statusMeta={statusMeta} />
    </div>
  );
}
