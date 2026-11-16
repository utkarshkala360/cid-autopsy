"use client";

import { useState } from "react";
import type { BreakdownGroup } from "@board/lib/dashboard-breakdown";
import type { CategoryChartType } from "@board/lib/chart-types";

const MAX_ROWS = 12;
// Donut is an identity (part-to-whole) chart, not a magnitude list — capped
// to the categorical palette's 7 real hues (src/app/globals.css) plus one
// "Other" fold slot, per the dataviz skill's "past ~7 color classes" rule.
const MAX_DONUT_SLICES = 7;
const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
] as const;
const DONUT_OTHER_COLOR = "var(--chart-other)";

// One generic component for every chart style the configurable `breakdown`
// widget can render (Bar/Stacked bar/Grouped bar/Donut/Lollipop) — same
// `BreakdownGroup[]` input every style already gets from computeBreakdown
// (src/lib/dashboard-breakdown.ts), just a different mark per `variant`.
// Replaces the old fixed-shape BreakdownTable; "bar" reproduces its exact
// look so existing widgets (which default to "bar") render unchanged.
export function CategoryChart({
  groups,
  matchedTotal,
  variant,
}: {
  groups: BreakdownGroup[];
  matchedTotal: number;
  variant: CategoryChartType;
}) {
  if (matchedTotal === 0) {
    return <p className="text-xs text-slate">No Work Items match this widget&apos;s filters.</p>;
  }

  switch (variant) {
    case "bar":
      return <BarList groups={groups} />;
    case "lollipop":
      return <BarList groups={groups} lollipop />;
    case "stacked_bar":
      return <StackedOrGroupedBar groups={groups} stacked />;
    case "grouped_bar":
      return <StackedOrGroupedBar groups={groups} stacked={false} />;
    case "donut":
      return <Donut groups={groups} />;
  }
}

// Shared "N more groups not shown" footer (BreakdownTable's original note).
function OverflowNote({ hiddenCount, noun = "group" }: { hiddenCount: number; noun?: string }) {
  if (hiddenCount <= 0) return null;
  return (
    <p className="text-[11px] text-slate">
      +{hiddenCount} more {noun}
      {hiddenCount === 1 ? "" : "s"} not shown.
    </p>
  );
}

// Bar (default) and Lollipop share the same per-row list layout — a single
// magnitude series, so one color (primary) rather than the categorical
// palette (identity is not the job here, per the dataviz skill's "one series
// -> one color" rule).
function BarList({ groups, lollipop = false }: { groups: BreakdownGroup[]; lollipop?: boolean }) {
  const visible = groups.slice(0, MAX_ROWS);
  const hiddenCount = groups.length - visible.length;
  const max = Math.max(1, ...visible.map((g) => g.total));

  return (
    <div className="space-y-3">
      {visible.map((g) => {
        const widthPct = Math.max(4, Math.round((g.total / max) * 100));
        return (
          <div key={g.key} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs font-medium text-slate" title={g.label}>
              {g.label}
            </span>
            {lollipop ? (
              <div className="relative h-2 flex-1">
                <div className="absolute inset-y-1/2 left-0 h-px w-full bg-muted" />
                <div
                  className="absolute inset-y-1/2 left-0 h-px -translate-y-1/2 bg-primary"
                  style={{ width: `${widthPct}%` }}
                />
                <div
                  className="ring-panel absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary ring-2"
                  style={{ left: `${widthPct}%` }}
                />
              </div>
            ) : (
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
              </div>
            )}
            <span className="w-16 shrink-0 text-right text-[11px] text-slate">
              {g.open} open · {g.closed} done
            </span>
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-ink">{g.total}</span>
          </div>
        );
      })}
      <OverflowNote hiddenCount={hiddenCount} />
    </div>
  );
}

function SeriesLegend() {
  return (
    <div className="mb-3 flex items-center gap-4 text-[11px] font-medium text-slate">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
        Open
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-status-done inline-block h-2 w-2 rounded-sm" />
        Done
      </span>
    </div>
  );
}

// Stacked: open+closed segments end-to-end, bar length ∝ total (same scale
// as plain Bar). Grouped: open/closed as two separate half-height bars
// sharing one scale, so their lengths compare directly. Both are 2-series
// (open vs. closed), so both carry the same fixed-color legend once, per the
// "legend always present for >=2 series" rule — no categorical palette
// needed since there are only ever these 2 named series.
function StackedOrGroupedBar({ groups, stacked }: { groups: BreakdownGroup[]; stacked: boolean }) {
  const visible = groups.slice(0, MAX_ROWS);
  const hiddenCount = groups.length - visible.length;
  const max = stacked
    ? Math.max(1, ...visible.map((g) => g.total))
    : Math.max(1, ...visible.flatMap((g) => [g.open, g.closed]));

  return (
    <div className="space-y-3">
      <SeriesLegend />
      {visible.map((g) => {
        const openPct = Math.max(g.open > 0 ? 3 : 0, Math.round((g.open / max) * 100));
        const closedPct = Math.max(g.closed > 0 ? 3 : 0, Math.round((g.closed / max) * 100));
        return (
          <div key={g.key} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs font-medium text-slate" title={g.label}>
              {g.label}
            </span>
            {stacked ? (
              <div className="flex h-2 flex-1 items-center gap-0.5 overflow-hidden">
                {g.open > 0 && <div className="h-full rounded-full bg-primary" style={{ width: `${openPct}%` }} />}
                {g.closed > 0 && (
                  <div className="bg-status-done h-full rounded-full" style={{ width: `${closedPct}%` }} />
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${openPct}%` }} />
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="bg-status-done h-full rounded-full" style={{ width: `${closedPct}%` }} />
                </div>
              </div>
            )}
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-ink">{g.total}</span>
          </div>
        );
      })}
      <OverflowNote hiddenCount={hiddenCount} />
    </div>
  );
}

const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 1.5; // percent of circumference, the ring's "2px surface gap" equivalent

function Donut({ groups }: { groups: BreakdownGroup[] }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const visible = groups.slice(0, MAX_DONUT_SLICES);
  const rest = groups.slice(MAX_DONUT_SLICES);
  const otherTotal = rest.reduce((sum, g) => sum + g.total, 0);
  const slices: { key: string; label: string; total: number; color: string }[] = visible.map((g, i) => ({
    key: g.key,
    label: g.label,
    total: g.total,
    color: DONUT_COLORS[i],
  }));
  if (otherTotal > 0) {
    slices.push({ key: "__other__", label: `Other (${rest.length})`, total: otherTotal, color: DONUT_OTHER_COLOR });
  }
  const grandTotal = slices.reduce((sum, s) => sum + s.total, 0);

  type Arc = { key: string; label: string; total: number; color: string; pct: number; dash: number; offset: number };
  const { arcs } = slices.reduce<{ arcs: Arc[]; cumulative: number }>(
    (acc, s) => {
      const pct = s.total / grandTotal;
      const dash = Math.max(0, pct * CIRCUMFERENCE - GAP);
      return {
        arcs: [...acc.arcs, { ...s, pct, dash, offset: -acc.cumulative }],
        cumulative: acc.cumulative + pct * CIRCUMFERENCE,
      };
    },
    { arcs: [], cumulative: 0 }
  );

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 100 100"
        className="h-36 w-36 shrink-0"
        role="img"
        aria-label="Donut chart of grouped Work Item counts"
      >
        <g transform="rotate(-90 50 50)">
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={hoverKey === a.key ? 18 : 16}
              strokeDasharray={`${a.dash} ${CIRCUMFERENCE - a.dash}`}
              strokeDashoffset={a.offset}
              opacity={hoverKey && hoverKey !== a.key ? 0.45 : 1}
              className="cursor-pointer transition-[stroke-width,opacity]"
              onMouseEnter={() => setHoverKey(a.key)}
              onMouseLeave={() => setHoverKey(null)}
            >
              <title>
                {a.label}: {a.total} ({Math.round(a.pct * 100)}%)
              </title>
            </circle>
          ))}
        </g>
        <text x={50} y={47} textAnchor="middle" className="fill-ink text-[15px] font-semibold">
          {grandTotal}
        </text>
        <text x={50} y={60} textAnchor="middle" className="fill-slate text-[7px]">
          total
        </text>
      </svg>

      <div className="w-full min-w-0 space-y-1.5">
        {arcs.map((a) => (
          <div
            key={a.key}
            className="flex items-center gap-2 text-[11px]"
            onMouseEnter={() => setHoverKey(a.key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: a.color }} />
            <span className="min-w-0 flex-1 truncate font-medium text-slate" title={a.label}>
              {a.label}
            </span>
            <span className="shrink-0 font-semibold text-ink">{a.total}</span>
            <span className="w-9 shrink-0 text-right text-slate">{Math.round(a.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
