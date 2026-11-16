import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { Team } from "@board/models/Team";
import { WorkItem } from "@board/models/WorkItem";
import { Member } from "@board/models/Member";
import { WorkLog, type WorkLogUnit } from "@board/models/WorkLog";

// Re-exported for existing/server-side callers of this module — the
// definition itself lives in work-log-format.ts (no "server-only") so
// client components can import it directly without pulling this whole
// DB-querying module into the client bundle.
export { formatWorkLogAmount } from "@board/lib/work-log-format";

export type WorkLogExportRow = {
  date: Date;
  workItemKey: string;
  workItemTitle: string;
  memberName: string;
  amount: number;
  unit: WorkLogUnit;
  note: string;
};

/** RP-5-style export source: every WorkLog row for a Team in a date range, joined with the Work Item key/title and logger name a CSV needs. */
export async function getWorkLogsForTeamRange(
  teamId: string,
  range: { from?: Date; to?: Date }
): Promise<WorkLogExportRow[]> {
  await connectDB();
  const query: Record<string, unknown> = { teamId };
  if (range.from || range.to) {
    query.date = {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    };
  }

  const entries = await WorkLog.find(query)
    .sort({ date: -1 })
    .lean<
      {
        _id: unknown;
        workItemId: unknown;
        memberId: unknown;
        date: Date;
        amount: number;
        unit: WorkLogUnit;
        note: string;
      }[]
    >();
  if (entries.length === 0) return [];

  const workItemIds = [...new Set(entries.map((e) => String(e.workItemId)))];
  const memberIds = [...new Set(entries.map((e) => String(e.memberId)))];
  const [items, members] = await Promise.all([
    WorkItem.find({ _id: { $in: workItemIds } }, "key title").lean<
      { _id: unknown; key: string; title: string }[]
    >(),
    Member.find({ _id: { $in: memberIds } }, "name").lean<{ _id: unknown; name: string }[]>(),
  ]);
  const itemById = new Map(items.map((i) => [String(i._id), i]));
  const nameById = new Map(members.map((m) => [String(m._id), m.name]));

  return entries.map((e) => ({
    date: e.date,
    workItemKey: itemById.get(String(e.workItemId))?.key ?? "—",
    workItemTitle: itemById.get(String(e.workItemId))?.title ?? "—",
    memberName: nameById.get(String(e.memberId)) ?? "Unknown Member",
    amount: e.amount,
    unit: e.unit,
    note: e.note ?? "",
  }));
}

export type EstimateVsActualRow = {
  workItemId: string;
  key: string;
  title: string;
  estimate: number | null;
  actual: number;
};

export type EstimateVsActualReport = {
  unit: WorkLogUnit | null;
  rows: EstimateVsActualRow[];
};

/**
 * Management-visibility report (WL-5): every Work Item on a Team that has
 * either an Estimate set or a nonzero Actual, with both numbers side by
 * side. Reads the denormalized `WorkItem.actualTotal` directly — no
 * WorkLog aggregation at read time — since every WorkLog mutation already
 * keeps that field in sync via recomputeWorkItemActualTotal below. A
 * self-contained per-instance DB fetch, same "burndown/velocity do their
 * own query" precedent in widget-grid.tsx — not folded into the shared
 * fetchScopedWorkItems() item set, since Estimate/Actual only mean
 * anything for a Team with a configured unit.
 */
export async function computeEstimateVsActual(teamId: string): Promise<EstimateVsActualReport> {
  await connectDB();
  const team = await Team.findById(teamId, "timeTrackingUnit").lean<{
    timeTrackingUnit: WorkLogUnit | null;
  }>();
  const unit = team?.timeTrackingUnit ?? null;
  if (!unit) return { unit: null, rows: [] };

  const items = await WorkItem.find(
    {
      teamId,
      $or: [{ estimate: { $ne: null } }, { actualTotal: { $gt: 0 } }],
    },
    "key title estimate actualTotal"
  ).lean<
    { _id: unknown; key: string; title: string; estimate: number | null; actualTotal: number }[]
  >();

  const rows = items
    .map((i) => ({
      workItemId: String(i._id),
      key: i.key,
      title: i.title,
      estimate: i.estimate ?? null,
      actual: i.actualTotal ?? 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { unit, rows };
}

/**
 * WL-4: recomputes `WorkItem.actualTotal` from the live WorkLog rows for one
 * item and writes it back — called synchronously by every WorkLog POST/
 * PATCH/DELETE route, so the stored total is always correct immediately
 * after the request that changed it, with no separate job or manual step
 * (per direct user request: real-time and automatic, not a live
 * aggregate-on-read value and not a scheduled recompute).
 */
export async function recomputeWorkItemActualTotal(workItemId: string): Promise<number> {
  await connectDB();
  const [result] = await WorkLog.aggregate<{ _id: null; total: number }>([
    { $match: { workItemId: new mongoose.Types.ObjectId(workItemId) } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const total = result?.total ?? 0;
  await WorkItem.updateOne({ _id: workItemId }, { $set: { actualTotal: total } });
  return total;
}
