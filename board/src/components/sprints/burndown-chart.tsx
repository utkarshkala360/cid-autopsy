import { LineChart } from "lucide-react";
import type { BurndownPoint } from "@board/lib/sprint-reports";
import { LineAreaChart, type LinePoint } from "@board/components/dashboard/charts/line-area-chart";
import type { BurndownChartType } from "@board/lib/chart-types";

// RP-1 (Burndown) and its Burnup twin — same replay data (BurndownPoint now
// carries `completed = totalItems - remaining` alongside `remaining`/`ideal`,
// src/lib/sprint-reports.ts), just a different pair of series plotted
// through the shared LineAreaChart primitive. Burndown: Remaining (solid,
// Primary) vs. Ideal (dashed, Slate reference). Burnup: Completed (solid,
// Primary) vs. Total scope (dashed, Slate reference) — the same visual
// grammar, inverted.
export function BurndownChart({
  points,
  totalItems,
  chartType = "burndown",
}: {
  points: BurndownPoint[];
  totalItems: number;
  chartType?: BurndownChartType;
}) {
  if (points.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate">
          <LineChart className="h-5 w-5" />
        </div>
        <p className="text-xs text-slate">
          {chartType === "burnup" ? "Burnup appears once items are added to this Sprint." : "Burndown appears once items are added to this Sprint."}
        </p>
      </div>
    );
  }

  const linePoints: LinePoint[] = points.map((p) => ({
    date: p.date,
    values: { remaining: p.remaining, ideal: p.ideal, completed: p.completed, total: totalItems },
  }));

  const series =
    chartType === "burnup"
      ? [
          { key: "completed", label: "Completed", tone: "primary" as const },
          { key: "total", label: "Total scope", tone: "slate" as const, dashed: true },
        ]
      : [
          { key: "remaining", label: "Remaining", tone: "primary" as const },
          { key: "ideal", label: "Ideal", tone: "slate" as const, dashed: true },
        ];

  return (
    <LineAreaChart
      points={linePoints}
      series={series}
      yMax={totalItems}
      ariaLabel={chartType === "burnup" ? "Sprint burnup chart: completed items vs. time" : "Sprint burndown chart: remaining items vs. time"}
      emptyMessage=""
    />
  );
}
