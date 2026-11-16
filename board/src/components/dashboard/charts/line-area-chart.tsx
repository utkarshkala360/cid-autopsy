"use client";

import { useState } from "react";
import { fullDateTimeTitle } from "@board/lib/format-date";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 28;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export type LinePoint = { date: string; values: Record<string, number> };
export type LineSeriesDef = {
  key: string;
  label: string;
  /** "primary" is the real data series (solid); "slate" is a dashed reference line. */
  tone: "primary" | "slate";
  dashed?: boolean;
};

// Generic 2-series line chart — the SVG machinery (grid, hover crosshair,
// direct-labeled legend) `BurndownChart` originally had all to itself,
// pulled out so Burndown (remaining/ideal) and Burnup (completed/total) can
// share it instead of duplicating an SVG line-chart idiom twice. Per the
// dataviz skill: solid 2px stroke for the real series, dashed for a
// reference line, legend always present for >=2 series, wide invisible hit
// targets for hover, one crosshair driving one tooltip that lists every
// series at that X.
export function LineAreaChart({
  points,
  series,
  yMax: yMaxOverride,
  ariaLabel,
  emptyMessage,
}: {
  points: LinePoint[];
  series: LineSeriesDef[];
  yMax?: number;
  ariaLabel: string;
  emptyMessage: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-slate">{emptyMessage}</p>
      </div>
    );
  }

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yMax = Math.max(
    yMaxOverride ?? 1,
    ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)),
    1
  );

  const xAt = (i: number) => PAD_LEFT + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + (1 - v / yMax) * plotH;

  const pathFor = (key: string) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.values[key] ?? 0)}`).join(" ");

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));
  const toneClass = (tone: LineSeriesDef["tone"]) => (tone === "primary" ? "stroke-primary" : "stroke-slate");

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3 flex items-center gap-4 text-[11px] font-medium text-slate">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-block h-0.5 w-4 rounded-full ${toneClass(s.tone)}`}
                style={
                  s.dashed
                    ? { backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px)" }
                    : undefined
                }
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHoverIndex(null)}>
        {gridLines.map((v) => (
          <line key={v} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yAt(v)} y2={yAt(v)} className="stroke-border" strokeWidth={1} />
        ))}
        {gridLines.map((v) => (
          <text key={v} x={PAD_LEFT - 6} y={yAt(v) + 3} textAnchor="end" className="fill-slate text-[9px]">
            {v}
          </text>
        ))}

        {series.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.key)}
            fill="none"
            className={toneClass(s.tone)}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {series
          .filter((s) => !s.dashed)
          .map((s) =>
            points.map((p, i) => (
              <circle key={`${s.key}-${p.date}`} cx={xAt(i)} cy={yAt(p.values[s.key] ?? 0)} r={3} className="fill-primary" />
            ))
          )}

        {/* Wide invisible hit targets — bigger than the marks themselves. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={xAt(i) - plotW / Math.max(1, points.length - 1) / 2}
            y={PAD_TOP}
            width={plotW / Math.max(1, points.length - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {hovered && hoverIndex !== null && (
          <line
            x1={xAt(hoverIndex)}
            x2={xAt(hoverIndex)}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
            className="stroke-slate"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {points.length > 1 && (
          <>
            <text x={xAt(0)} y={HEIGHT - 6} textAnchor="start" className="fill-slate text-[9px]">
              <title>{fullDateTimeTitle(points[0].date)}</title>
              {new Date(points[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
            <text x={xAt(points.length - 1)} y={HEIGHT - 6} textAnchor="end" className="fill-slate text-[9px]">
              <title>{fullDateTimeTitle(points[points.length - 1].date)}</title>
              {new Date(points[points.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          </>
        )}
      </svg>

      {hovered && (
        <div className="mt-1 flex items-center justify-center gap-3 text-[11px] text-ink">
          <span className="font-medium" title={fullDateTimeTitle(hovered.date)}>
            {new Date(hovered.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          {series.map((s) => (
            <span key={s.key} className={s.tone === "primary" ? "text-primary" : "text-slate"}>
              {s.label}: {hovered.values[s.key] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
