import Link from "next/link";
import type { EstimateVsActualRow } from "@board/lib/work-log-reports";
import { formatWorkLogAmount } from "@board/lib/work-log-format";
import type { WorkLogUnit } from "@board/models/WorkLog";

// WL-5: management-visibility report — Estimate and Actual are always
// independent numbers (no automatic reconciliation), rendered side by side
// per Work Item plus a plain difference column.
export function EstimateVsActualTable({
  teamId,
  rows,
  unit,
}: {
  teamId: string;
  rows: EstimateVsActualRow[];
  unit: WorkLogUnit;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-xs leading-relaxed text-slate">
        No Estimates or logged time yet for this Team.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate text-[10px] font-semibold tracking-wider uppercase">
            <th className="px-2 py-1.5 text-left">Item</th>
            <th className="px-2 py-1.5 text-right">Estimate</th>
            <th className="px-2 py-1.5 text-right">Actual</th>
            <th className="px-2 py-1.5 text-right">Variance</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row) => {
            const variance = row.estimate !== null ? row.actual - row.estimate : null;
            return (
              <tr key={row.workItemId}>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/dashboard/board/teams/${teamId}/work-items/${row.workItemId}`}
                    className="text-primary hover:text-primary-hover font-medium"
                  >
                    {row.key}
                  </Link>{" "}
                  <span className="text-slate">{row.title}</span>
                </td>
                <td className="text-ink px-2 py-1.5 text-right">
                  {row.estimate !== null ? formatWorkLogAmount(row.estimate, unit) : "—"}
                </td>
                <td className="text-ink px-2 py-1.5 text-right">
                  {formatWorkLogAmount(row.actual, unit)}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-medium ${
                    variance === null
                      ? "text-slate"
                      : variance > 0
                        ? "text-status-blocked"
                        : "text-status-done"
                  }`}
                >
                  {variance === null
                    ? "—"
                    : `${variance >= 0 ? "+" : "-"}${formatWorkLogAmount(Math.abs(variance), unit)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
