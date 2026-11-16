// Pure formatting helper, deliberately kept out of work-log-reports.ts
// (which is `server-only`, DB-querying) — this is used from client
// components (WorkLogPanel, WorkItemDetail) as well as server code, so it
// can't carry that import.
import type { WorkLogUnit } from "@board/models/WorkLog";

export function formatWorkLogAmount(amount: number, unit: WorkLogUnit | null): string {
  if (unit === "hours_minutes") {
    const hours = Math.floor(amount / 60);
    const minutes = Math.round(amount % 60);
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }
  if (unit === "story_points") {
    return `${amount % 1 === 0 ? amount : amount.toFixed(1)} pts`;
  }
  return String(amount);
}
