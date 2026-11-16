import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { Team, type TeamDoc } from "@board/models/Team";
import { Member } from "@board/models/Member";
import { Customer } from "@board/models/Customer";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { PRIORITIES, type Priority, type StatusCategory } from "@board/lib/status-categories";

export type TeamStats = {
  teamId: string;
  teamName: string;
  total: number;
  open: number;
  closed: number;
  overdue: number;
};

export type AssigneeStats = {
  assigneeId: string | null;
  assigneeName: string;
  total: number;
  open: number;
  closed: number;
};

export type DashboardData = {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  byPriority: Record<Priority, number>;
  perTeam: TeamStats[];
  byAssignee: AssigneeStats[];
};

// One resolved Work Item, scoped to a Team/Initiative window and carrying
// its already-resolved ORG-7 status category — the shared unit every
// Dashboard/Team Dashboard widget computes from. Fetched once per page
// render (fetchScopedWorkItems, below) and reused by every widget instance
// on that page (computeDashboardFromItems for the summary numbers,
// computeBreakdown in src/lib/dashboard-breakdown.ts for a configurable
// widget's own filter+group-by) — one Mongo query serves however many
// widgets are on the page, each just doing an in-memory filter/group over
// the same array.
export type ScopedWorkItem = {
  id: string;
  teamId: string;
  type: string;
  status: string;
  statusCategory: StatusCategory;
  priority: Priority;
  assignee: string | null;
  customerId: string | null;
  initiativeId: string | null;
  labels: string[];
  dueDate: Date | null;
};

export type ScopedWorkItemsResult = {
  items: ScopedWorkItem[];
  assigneeNameById: Map<string, string>;
  customerNameById: Map<string, string>;
};

function emptyByPriority(): Record<Priority, number> {
  return { low: 0, medium: 0, high: 0, urgent: 0 };
}

/**
 * DB-1: the shared fetch behind every widget on a Dashboard/Team Dashboard
 * page — every Work Item in `teamIds` (optionally narrowed to one
 * Initiative), with its ORG-7 status category already resolved per the
 * item's own Team+type Workflow, so nothing downstream needs to re-resolve
 * it or re-fetch the Workflow. `teamIds` is the caller's already-authorized
 * scope (Non-Negotiable #9) — this function does no authz of its own, same
 * convention every other data-layer helper in this codebase follows.
 */
export async function fetchScopedWorkItems(params: {
  organizationId: unknown;
  teamIds: string[];
  initiativeId?: string | null;
}): Promise<ScopedWorkItemsResult> {
  await connectDB();
  if (params.teamIds.length === 0) {
    return { items: [], assigneeNameById: new Map(), customerNameById: new Map() };
  }

  const query: Record<string, unknown> = {
    organizationId: params.organizationId,
    teamId: { $in: params.teamIds },
  };
  if (params.initiativeId) query.initiativeId = params.initiativeId;

  const raw = await WorkItem.find(
    query,
    "teamId type status priority dueDate assignee customerId initiativeId labels"
  ).lean<
    {
      _id: unknown;
      teamId: unknown;
      type: string;
      status: string;
      priority: Priority;
      dueDate: Date | null;
      assignee: unknown;
      customerId: unknown;
      initiativeId: unknown;
      labels: string[];
    }[]
  >();

  const combos = new Map<string, { teamId: string; type: string }>();
  for (const item of raw) {
    const teamId = String(item.teamId);
    combos.set(`${teamId}|${item.type}`, { teamId, type: item.type });
  }
  const workflowByCombo = new Map(
    await Promise.all(
      [...combos.entries()].map(
        async ([key, c]) => [key, await getEffectiveWorkflow(c.teamId, c.type)] as const
      )
    )
  );

  const items: ScopedWorkItem[] = raw.map((item) => {
    const teamId = String(item.teamId);
    const workflow = workflowByCombo.get(`${teamId}|${item.type}`);
    const category = (workflow?.statuses.find((s) => s.key === item.status)?.category ??
      "todo") as StatusCategory;
    return {
      id: String(item._id),
      teamId,
      type: item.type,
      status: item.status,
      statusCategory: category,
      priority: item.priority,
      assignee: item.assignee ? String(item.assignee) : null,
      customerId: item.customerId ? String(item.customerId) : null,
      initiativeId: item.initiativeId ? String(item.initiativeId) : null,
      labels: item.labels ?? [],
      dueDate: item.dueDate ?? null,
    };
  });

  const assigneeIds = [...new Set(items.map((i) => i.assignee).filter((v): v is string => !!v))];
  const customerIds = [...new Set(items.map((i) => i.customerId).filter((v): v is string => !!v))];
  const [assigneeMembers, customers] = await Promise.all([
    assigneeIds.length
      ? Member.find({ _id: { $in: assigneeIds } }, "name").lean<{ _id: unknown; name: string }[]>()
      : Promise.resolve([]),
    customerIds.length
      ? Customer.find({ _id: { $in: customerIds } }, "name").lean<{ _id: unknown; name: string }[]>()
      : Promise.resolve([]),
  ]);

  return {
    items,
    assigneeNameById: new Map(assigneeMembers.map((m) => [String(m._id), m.name])),
    customerNameById: new Map(customers.map((c) => [String(c._id), c.name])),
  };
}

/** Pure aggregate over an already-fetched, already-category-resolved item set — DB-1's fixed summary shape (open/closed/overdue/byPriority/perTeam/byAssignee). No DB access; callers needing a fresh fetch should call `computeDashboard` below instead. */
export function computeDashboardFromItems(
  items: ScopedWorkItem[],
  teamIds: string[],
  teamNameById: Map<string, string>,
  assigneeNameById: Map<string, string>
): DashboardData {
  const now = new Date();
  const statsByTeam = new Map<string, TeamStats>();
  for (const teamId of teamIds) {
    statsByTeam.set(teamId, {
      teamId,
      teamName: teamNameById.get(teamId) ?? "Unknown Team",
      total: 0,
      open: 0,
      closed: 0,
      overdue: 0,
    });
  }

  const byPriority = emptyByPriority();
  const statsByAssignee = new Map<string, AssigneeStats>();
  let total = 0;
  let open = 0;
  let closed = 0;
  let overdue = 0;

  for (const item of items) {
    const isDone = item.statusCategory === "done";
    const isOverdue = !isDone && !!item.dueDate && new Date(item.dueDate) < now;

    total += 1;
    if (isDone) closed += 1;
    else open += 1;
    if (isOverdue) overdue += 1;
    if (item.priority in byPriority) byPriority[item.priority] += 1;

    const teamStats = statsByTeam.get(item.teamId);
    if (teamStats) {
      teamStats.total += 1;
      if (isDone) teamStats.closed += 1;
      else teamStats.open += 1;
      if (isOverdue) teamStats.overdue += 1;
    }

    // RP-4: items-by-assignee — "unassigned" is its own bucket (key ""),
    // sorted to the end regardless of count, same treatment the Saved Views
    // UNASSIGNED sentinel gives it elsewhere (work-item-views.ts).
    const assigneeKey = item.assignee ?? "";
    let assigneeStats = statsByAssignee.get(assigneeKey);
    if (!assigneeStats) {
      assigneeStats = {
        assigneeId: assigneeKey || null,
        assigneeName: assigneeKey ? (assigneeNameById.get(assigneeKey) ?? "Unknown Member") : "Unassigned",
        total: 0,
        open: 0,
        closed: 0,
      };
      statsByAssignee.set(assigneeKey, assigneeStats);
    }
    assigneeStats.total += 1;
    if (isDone) assigneeStats.closed += 1;
    else assigneeStats.open += 1;
  }

  const byAssignee = [...statsByAssignee.values()].sort((a, b) => {
    if (a.assigneeId === null) return 1;
    if (b.assigneeId === null) return -1;
    return b.total - a.total || a.assigneeName.localeCompare(b.assigneeName);
  });

  return {
    total,
    open,
    closed,
    overdue,
    byPriority,
    perTeam: [...statsByTeam.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)),
    byAssignee,
  };
}

/** Just the 4 headline counts, over an arbitrary (already-filtered) item subset — what the `summary` widget needs, without paying for `computeDashboardFromItems`'s perTeam/byAssignee/byPriority buckets it would otherwise throw away. */
export function summarizeScopedItems(items: ScopedWorkItem[]): {
  total: number;
  open: number;
  closed: number;
  overdue: number;
} {
  const now = new Date();
  let total = 0;
  let open = 0;
  let closed = 0;
  let overdue = 0;
  for (const item of items) {
    const isDone = item.statusCategory === "done";
    total += 1;
    if (isDone) closed += 1;
    else open += 1;
    if (!isDone && item.dueDate && new Date(item.dueDate) < now) overdue += 1;
  }
  return { total, open, closed, overdue };
}

/**
 * Convenience wrapper kept byte-for-byte compatible with every existing
 * caller (the `summary`/`priority_breakdown`/`team_breakdown`/
 * `assignee_breakdown` widgets' original shape, `GET /api/dashboard/export`)
 * — fetches Team names + Scoped Work Items itself rather than requiring the
 * caller to. `dashboard/page.tsx` calls `fetchScopedWorkItems` +
 * `computeDashboardFromItems` directly instead, so the one Mongo query it
 * needs is shared with every `breakdown` widget on the same page rather than
 * this wrapper re-querying for each.
 */
export async function computeDashboard(params: {
  organizationId: unknown;
  teamIds: string[];
  initiativeId?: string | null;
}): Promise<DashboardData> {
  const [{ items, assigneeNameById }, teams] = await Promise.all([
    fetchScopedWorkItems(params),
    params.teamIds.length
      ? Team.find({ _id: { $in: params.teamIds } }, "name").lean<Pick<TeamDoc, "_id" | "name">[]>()
      : Promise.resolve([]),
  ]);
  const teamNameById = new Map(teams.map((t) => [String(t._id), t.name]));
  return computeDashboardFromItems(items, params.teamIds, teamNameById, assigneeNameById);
}

export { PRIORITIES };
