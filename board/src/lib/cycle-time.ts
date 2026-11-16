import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { ChangeHistory } from "@board/models/ChangeHistory";
import { getEffectiveWorkflow, type EffectiveWorkflow } from "@board/lib/workflow";

export type CycleTimeStat = {
  type: string;
  count: number;
  avgLeadTimeHours: number;
  avgCycleTimeHours: number;
};

/**
 * RP-3: cycle time (work-start to done) and lead time (creation to done),
 * per Work-Item-type, reconstructed from the append-only `field: "status"`
 * ChangeHistory rows — the exact same replay technique
 * `computeBurndown()` already uses (src/lib/sprint-reports.ts), just walked
 * forward to two timestamps per item instead of a remaining-count-per-day
 * series. Only items currently in a `done`-category status are counted; an
 * item re-opened after being marked done is excluded for that reason (its
 * current status isn't `done`), not because its history was ignored.
 *
 * `teamIds` is the caller's already-authorized scope, same convention as
 * `computeDashboard` — no authz of its own (Non-Negotiable #9).
 */
export async function computeCycleTime(params: {
  teamIds: string[];
  initiativeId?: string | null;
}): Promise<CycleTimeStat[]> {
  await connectDB();
  if (params.teamIds.length === 0) return [];

  const query: Record<string, unknown> = { teamId: { $in: params.teamIds } };
  if (params.initiativeId) query.initiativeId = params.initiativeId;

  const items = await WorkItem.find(query, "teamId type status createdAt").lean<
    { _id: unknown; teamId: unknown; type: string; status: string; createdAt: Date }[]
  >();
  if (items.length === 0) return [];

  const combos = new Map<string, { teamId: string; type: string }>();
  for (const item of items) {
    const teamId = String(item.teamId);
    combos.set(`${teamId}|${item.type}`, { teamId, type: item.type });
  }
  const workflowByCombo = new Map<string, EffectiveWorkflow>(
    await Promise.all(
      [...combos.entries()].map(
        async ([key, c]) => [key, await getEffectiveWorkflow(c.teamId, c.type)] as const
      )
    )
  );

  function categoryOf(teamId: string, type: string, status: string): string {
    const workflow = workflowByCombo.get(`${teamId}|${type}`);
    return workflow?.statuses.find((s) => s.key === status)?.category ?? "todo";
  }

  const doneItems = items.filter(
    (item) => categoryOf(String(item.teamId), item.type, item.status) === "done"
  );
  if (doneItems.length === 0) return [];

  const history = await ChangeHistory.find(
    { workItemId: { $in: doneItems.map((i) => i._id) }, kind: "field_change", field: "status" },
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

  const hoursByType = new Map<string, { count: number; leadHours: number; cycleHours: number }>();

  for (const item of doneItems) {
    const teamId = String(item.teamId);
    const changes = historyByItem.get(String(item._id)) ?? [];

    let doneAt = item.createdAt;
    let cycleStartAt = item.createdAt;
    let sawInProgress = false;
    for (const change of changes) {
      const newCategory = categoryOf(teamId, item.type, change.newValue);
      if (newCategory === "done") doneAt = change.createdAt;
      if (!sawInProgress && newCategory === "in_progress") {
        cycleStartAt = change.createdAt;
        sawInProgress = true;
      }
    }
    // Never had an in_progress-category status (e.g. todo -> done in one
    // hop, or created already done) — cycle time collapses to lead time
    // rather than reporting a meaningless near-zero gap.
    if (!sawInProgress) cycleStartAt = item.createdAt;

    const leadHours = Math.max(0, (doneAt.getTime() - item.createdAt.getTime()) / 3_600_000);
    const cycleHours = Math.max(0, (doneAt.getTime() - cycleStartAt.getTime()) / 3_600_000);

    const bucket = hoursByType.get(item.type) ?? { count: 0, leadHours: 0, cycleHours: 0 };
    bucket.count += 1;
    bucket.leadHours += leadHours;
    bucket.cycleHours += cycleHours;
    hoursByType.set(item.type, bucket);
  }

  return [...hoursByType.entries()]
    .map(([type, b]) => ({
      type,
      count: b.count,
      avgLeadTimeHours: Math.round((b.leadHours / b.count) * 10) / 10,
      avgCycleTimeHours: Math.round((b.cycleHours / b.count) * 10) / 10,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}
