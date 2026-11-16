import "server-only";

// Board pagination (Design 3, Board section) — resolves a raw WorkItem
// (Board always sorts by {order,createdAt}, never the Work Items list's
// semantic sort/group-by, so this deliberately does NOT go through
// getWorkItemsPage()/toWorkItemRow — those are shaped around ViewConfig
// sort/group, which the Board toolbar disables entirely,
// showSortAndGroup={false}) into the BoardItem shape KanbanBoard/
// BacklogList render, so a "Load More" page-2+ card looks identical to a
// server-rendered page-1 card.
import type { BoardItem } from "@board/components/work-items/board-card";

export type BoardRowSource = {
  _id: unknown;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee: unknown;
  labels?: string[] | null;
  dueDate: Date | string | null;
  order: number;
  createdAt: Date | string;
  customerId?: unknown;
  isEpic?: boolean | null;
};

export function toBoardItem(
  item: BoardRowSource,
  ctx: { assigneeMap: Map<string, string>; customerMap: Map<string, string> }
): BoardItem {
  const assigneeId = item.assignee ? String(item.assignee) : null;
  const customerId = item.customerId ? String(item.customerId) : null;
  return {
    id: String(item._id),
    key: item.key,
    title: item.title,
    status: item.status,
    priority: item.priority as BoardItem["priority"],
    assigneeName: assigneeId ? (ctx.assigneeMap.get(assigneeId) ?? null) : null,
    labels: item.labels ?? [],
    dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
    order: item.order ?? 0,
    createdAt: new Date(item.createdAt).toISOString(),
    customerName: customerId ? (ctx.customerMap.get(customerId) ?? null) : null,
    isEpic: Boolean(item.isEpic),
  };
}

/** Same "only look up ids actually present in this page" discipline as
 * work-item-row.ts's buildRowMaps — separate copy since Board rows aren't
 * PageWorkItem-shaped (no dueDate/assignee string coercion applied yet). */
export async function buildBoardRowMaps(items: BoardRowSource[]) {
  const { Member } = await import("@board/models/Member");
  const { Customer } = await import("@board/models/Customer");

  const assigneeIds = [...new Set(items.map((i) => (i.assignee ? String(i.assignee) : null)).filter((v): v is string => Boolean(v)))];
  const customerIds = [
    ...new Set(items.map((i) => (i.customerId ? String(i.customerId) : null)).filter((v): v is string => Boolean(v))),
  ];

  const [members, customers] = await Promise.all([
    assigneeIds.length ? Member.find({ _id: { $in: assigneeIds } }, "name").lean<{ _id: unknown; name: string }[]>() : Promise.resolve([]),
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }, "name").lean<{ _id: unknown; name: string }[]>() : Promise.resolve([]),
  ]);

  return {
    assigneeMap: new Map(members.map((m) => [String(m._id), m.name])),
    customerMap: new Map(customers.map((c) => [String(c._id), c.name])),
  };
}
