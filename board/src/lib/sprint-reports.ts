import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { ChangeHistory } from "@board/models/ChangeHistory";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";

// `completed` is `totalItems - remaining` — the Burnup chart style (Dashboard
// Views) reads this instead of `remaining`/`ideal`, off the exact same replay
// this function already does, so Burnup needed no new query or reconstruction
// logic of its own, just a second derived field on each point.
export type BurndownPoint = { date: string; remaining: number; ideal: number; completed: number };
export type BurndownReport = { totalItems: number; points: BurndownPoint[] };

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor <= last) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

/**
 * Phase 16 (Design 2, Sprint/Initiative unification): same function, same
 * signature/behavior as before, now taking a Team-run `Initiative` doc
 * (`teamId` set) instead of a `Sprint` doc — every caller already passes
 * whatever `getActiveSprint()` returns, so no call site needed to change.
 *
 * RP-1: remaining work vs. time, reconstructed from the append-only
 * `ChangeHistory` audit trail (CT-1) — no separate daily snapshot mechanism
 * exists or is needed. "Remaining" is item COUNT, not story points — every
 * Team has items, not every Team has a points field (WF-2 is optional per
 * Team), so count is the one unit guaranteed to exist everywhere (ORG-4).
 *
 * Scope decision, stated plainly: this counts the Initiative's CURRENT item
 * membership and replays only their status history — an item manually
 * pulled out mid-flight (not via the Complete-Sprint rollover, which IS
 * reflected since those items keep the closed Initiative's id) drops out of
 * the whole reconstruction, not just from the day it left.
 */
export async function computeBurndown(sprint: InitiativeDoc): Promise<BurndownReport> {
  await connectDB();
  const items = await WorkItem.find(
    { teamId: sprint.teamId, teamInitiativeId: sprint._id },
    "type status createdAt"
  ).lean<{ _id: unknown; type: string; status: string; createdAt: Date }[]>();

  if (items.length === 0) {
    return { totalItems: 0, points: [] };
  }

  const types = [...new Set(items.map((i) => i.type))];
  const workflowByType = new Map(
    await Promise.all(
      types.map(async (type) => [type, await getEffectiveWorkflow(String(sprint.teamId), type)] as const)
    )
  );

  const history = await ChangeHistory.find(
    { workItemId: { $in: items.map((i) => i._id) }, kind: "field_change", field: "status" },
    "workItemId oldValue newValue createdAt"
  )
    .sort({ createdAt: 1 })
    .lean<{ workItemId: unknown; oldValue: string; newValue: string; createdAt: Date }[]>();

  const historyByItem = new Map<string, { oldValue: string; newValue: string; createdAt: Date }[]>();
  for (const h of history) {
    const key = String(h.workItemId);
    const list = historyByItem.get(key) ?? [];
    list.push(h);
    historyByItem.set(key, list);
  }

  function statusAsOf(item: (typeof items)[number], at: Date): string {
    const changes = historyByItem.get(String(item._id));
    if (!changes || changes.length === 0) return item.status;
    if (at < changes[0].createdAt) return changes[0].oldValue;
    let status = changes[0].oldValue;
    for (const change of changes) {
      if (change.createdAt > at) break;
      status = change.newValue;
    }
    return status;
  }

  function isDone(type: string, status: string): boolean {
    const workflow = workflowByType.get(type)!;
    return resolveStatusMeta(workflow.statuses, status).category === "done";
  }

  const now = new Date();
  const rangeEnd = sprint.endDate && sprint.endDate < now ? sprint.endDate : now;
  const days = eachDay(sprint.startDate ?? sprint.createdAt, rangeEnd);
  const totalItems = items.length;

  const points: BurndownPoint[] = days.map((day, index) => {
    const asOf = endOfDay(day);
    const remaining = items.filter((item) => !isDone(item.type, statusAsOf(item, asOf))).length;
    const idealStep = totalItems / Math.max(1, days.length - 1);
    const ideal = days.length === 1 ? 0 : Math.max(0, totalItems - idealStep * index);
    return {
      date: startOfDay(day).toISOString(),
      remaining,
      ideal: Math.round(ideal * 10) / 10,
      completed: totalItems - remaining,
    };
  });

  return { totalItems, points };
}

export type VelocityPoint = { sprintId: string; sprintName: string; completedAt: string; count: number };

/**
 * RP-2: last N completed Team-run Initiatives for a Team. After
 * Complete-Sprint rollover (src/lib/sprints.ts), only the items that were
 * actually DONE remain assigned to a closed one — every incomplete item was
 * moved off — so velocity is a plain count query, not a point-in-time
 * snapshot. Filtered by category === "done" again here defensively (e.g.
 * an item re-tagged into a closed Initiative after the fact shouldn't
 * inflate the number). `sprintId` in the returned shape is kept as the
 * field name (not renamed to `initiativeId`) — VelocityChart and every
 * existing consumer already key off it, and it's still "the identifying id
 * of the Sprint-like thing this point represents," which is exactly what
 * it is here too.
 */
export async function computeVelocity(teamId: string, limit = 6): Promise<VelocityPoint[]> {
  await connectDB();
  const sprints = await Initiative.find({ teamId, sprintStatus: "completed" })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean<InitiativeDoc[]>();

  if (sprints.length === 0) return [];

  const results = await Promise.all(
    sprints.map(async (sprint) => {
      const items = await WorkItem.find(
        { teamId, teamInitiativeId: sprint._id },
        "type status"
      ).lean<{ type: string; status: string }[]>();

      const types = [...new Set(items.map((i) => i.type))];
      const workflowByType = new Map(
        await Promise.all(
          types.map(async (type) => [type, await getEffectiveWorkflow(teamId, type)] as const)
        )
      );
      const count = items.filter(
        (item) => resolveStatusMeta(workflowByType.get(item.type)!.statuses, item.status).category === "done"
      ).length;

      return {
        sprintId: String(sprint._id),
        sprintName: sprint.name,
        completedAt: sprint.updatedAt.toISOString(),
        count,
      };
    })
  );

  return results.reverse(); // oldest-completed-first, so the chart reads left-to-right chronologically
}
