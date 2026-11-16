import "server-only";

// Shared "raw Work Item -> display row" resolution, used by both the Work
// Items list page (first-page server render) and
// GET /api/teams/[teamId]/work-items (subsequent "Load More" pages) — so
// a page-2 row looks identical to a page-1 row without the client needing
// its own copy of the workflow/assignee/customer name maps. The API route
// returns fully-resolved WorkItemRow objects, not raw WorkItemDocs, keeping
// label resolution server-side and the "Load More" client dumb (append).
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import { fullDateTimeTitle } from "@board/lib/format-date";
import type { EffectiveWorkflow } from "@board/lib/workflow";
import type { PageWorkItem } from "@board/lib/work-item-page-query";
import type { WorkItemRow } from "@board/components/work-items/work-items-table";

export function formatDueDate(date: Date | string | null | undefined) {
  if (!date) return null;
  const d = new Date(date);
  const isOverdue = d < new Date();
  return {
    text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    title: fullDateTimeTitle(d),
    isOverdue,
  };
}

export type RowResolutionContext = {
  workflow: EffectiveWorkflow;
  /** Member id -> display name. */
  assigneeMap: Map<string, string>;
  /** Customer id -> display name. */
  customerMap: Map<string, string>;
};

export function toWorkItemRow(item: PageWorkItem, ctx: RowResolutionContext): WorkItemRow {
  const statusMeta = resolveStatusMeta(ctx.workflow.statuses, item.status);
  const due = formatDueDate(item.dueDate);
  return {
    id: String(item._id),
    key: item.key,
    title: item.title,
    labels: item.labels ?? [],
    statusLabel: statusMeta.label,
    statusCategory: statusMeta.category,
    priority: item.priority as WorkItemRow["priority"],
    customerId: item.customerId ? String(item.customerId) : null,
    customerName: item.customerId ? (ctx.customerMap.get(String(item.customerId)) ?? null) : null,
    assigneeName: item.assignee ? (ctx.assigneeMap.get(item.assignee) ?? null) : null,
    dueDateText: due?.text ?? null,
    dueDateTitle: due?.title ?? null,
    dueDateOverdue: due?.isOverdue ?? false,
    isEpic: Boolean(item.isEpic),
  };
}

/** Builds the assignee/customer name maps a page of Work Items needs to
 * resolve rows — only for the ids actually present in `items`, not every
 * Member/Customer in the Team/Org. */
export async function buildRowMaps(items: PageWorkItem[]) {
  const { Member } = await import("@board/models/Member");
  const { Customer } = await import("@board/models/Customer");

  const assigneeIds = [...new Set(items.map((i) => i.assignee).filter((v): v is string => Boolean(v)))];
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
