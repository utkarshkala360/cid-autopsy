import { TrendingUp } from "lucide-react";
import type { VelocityPoint } from "@board/lib/sprint-reports";
import { LineAreaChart, type LinePoint } from "@board/components/dashboard/charts/line-area-chart";
import type { VelocityChartType } from "@board/lib/chart-types";

// RP-2: last N completed Sprints. A single series (items completed per
// Sprint), so no legend box is needed — the section title names it — and
// every bar is direct-labeled since N is small (a handful of Sprints), not
// a dense series where labeling every point would be noise. "bar" keeps its
// own plain-div bar markup (vertical columns, unlike CategoryChart's
// horizontal list — a different enough layout not to share); "line"
// delegates to the shared LineAreaChart primitive (src/components/
// dashboard/charts/line-area-chart.tsx) as a single-series trend view over
// the same points.
export function VelocityChart({ points, chartType = "bar" }: { points: VelocityPoint[]; chartType?: VelocityChartType }) {
  if (points.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate">
          <TrendingUp className="h-5 w-5" />
        </div>
        <p className="text-xs text-slate">Velocity appears here once a Sprint completes.</p>
      </div>
    );
  }

  if (chartType === "line") {
    const linePoints: LinePoint[] = points.map((p) => ({ date: p.completedAt, values: { count: p.count } }));
    return (
      <LineAreaChart
        points={linePoints}
        series={[{ key: "count", label: "Completed", tone: "primary" }]}
        ariaLabel="Sprint velocity chart: completed items per Sprint"
        emptyMessage="Velocity appears here once a Sprint completes."
      />
    );
  }

  const max = Math.max(1, ...points.map((p) => p.count));

  return (
    <div className="flex h-40 items-end gap-3">
      {points.map((p) => {
        const heightPct = Math.max(4, Math.round((p.count / max) * 100));
        return (
          <div key={p.sprintId} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] font-semibold text-ink">{p.count}</span>
            <div
              className="w-full rounded-t-md bg-primary"
              style={{ height: `${p.count > 0 ? heightPct : 0}%` }}
              title={`${p.sprintName} — completed ${new Date(p.completedAt).toLocaleDateString()} — ${p.count} done`}
            />
            <span className="w-full truncate text-center text-[10px] text-slate" title={p.sprintName}>
              {p.sprintName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
