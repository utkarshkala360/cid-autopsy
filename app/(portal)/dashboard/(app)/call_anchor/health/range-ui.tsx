import type { Comparison, Totals } from "@/lib/callanchor/health";
import { RANGE_KEYS, RANGE_LABELS, type TimeRange } from "@/lib/callanchor/range";
import { cardClass } from "@/components/ui";
import { int } from "./format";
import { RangeSelect } from "./RangeSelect";

// The range picker and the comparison with the dates before the range (owner, 2026-11-19), shared by
// every health page.

type Query = Record<string, string | string[] | undefined>;
const RANGE_PARAMS = new Set(["range", "window", "from", "to", "page"]);

// `bounds` are the custom inputs' limits: the days calls are stored, up to now (customBounds).
export function RangePicker({ range, path, query, bounds }: { range: TimeRange; path: string; query: Query; bounds: { min: string; max: string } }) {
  const keep = Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && !RANGE_PARAMS.has(e[0]) && e[1].length <= 2000);
  const link = (key: string) => {
    const next = new URLSearchParams(keep);
    if (key !== "today") next.set("range", key);
    return `${path}${next.size ? `?${next}` : ""}`;
  };
  const options = RANGE_KEYS.filter((k) => k !== "custom").map((k) => ({ key: k, label: RANGE_LABELS[k], href: link(k) }));
  return <RangeSelect key={range.id} current={range.key} options={options} custom={{ path, keep, from: range.input.from, to: range.input.to, ...bounds }} />;
}

const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "+8%" against the dates before; empty when there's nothing to compare.
export function changeText(now: number, prev: number) {
  if (prev === 0) return now === 0 ? "" : "new";
  const change = Math.round(((now - prev) / prev) * 100);
  return `${change > 0 ? "+" : ""}${change}%`;
}

// One line for a count: "vs 290 yesterday (+8%)", for a hero note or a row.
export function vsText(now: number, prev: Totals | null, label: string, pick: (t: Totals) => number = (t) => t.calls) {
  if (!prev) return `nothing stored for ${label}`;
  const change = changeText(now, pick(prev));
  return `vs ${int(pick(prev))} ${label}${change ? ` (${change})` : ""}`;
}

// The share that reached the CRM: "vs 97.0% yesterday".
export function reachVsText(now: Totals, prev: Totals | null, label: string) {
  const before = prev ? share(prev.delivered, prev.due) : null;
  if (before === null) return prev ? `none due ${label}` : `nothing stored for ${label}`;
  const nowShare = share(now.delivered, now.due);
  const points = nowShare === null ? null : Math.round((nowShare - before) * 10) / 10;
  return `vs ${before}% ${label}${points ? ` (${points > 0 ? "+" : ""}${points} pts)` : ""}`;
}

type Cell = { label: string; value: string; before: string | null; change: number | null; higherIsBetter: boolean | null };

// The range's headline numbers next to the same numbers on the dates before it. Numbers only: the
// dates before come from the daily totals, so they don't open calls.
export function CompareStrip({ totals, comparison, recordings = true }: { totals: Totals; comparison: Comparison; recordings?: boolean }) {
  const prev = comparison.prev;
  const reachNow = share(totals.delivered, totals.due);
  const reachBefore = prev ? share(prev.delivered, prev.due) : null;
  const count = (label: string, pick: (t: Totals) => number, higherIsBetter: boolean | null): Cell => ({
    label,
    value: int(pick(totals)),
    before: prev ? int(pick(prev)) : null,
    change: prev && pick(prev) > 0 ? Math.round(((pick(totals) - pick(prev)) / pick(prev)) * 100) : null,
    higherIsBetter,
  });
  const cells: Cell[] = [
    count("Calls", (t) => t.calls, null),
    {
      label: "Reached the CRM",
      value: reachNow === null ? "—" : `${reachNow}%`,
      before: reachBefore === null ? (prev ? "none due" : null) : `${reachBefore}%`,
      change: reachNow !== null && reachBefore !== null ? Math.round((reachNow - reachBefore) * 10) / 10 : null,
      higherIsBetter: true,
    },
    ...(recordings ? [count("Recordings uploaded", (t) => t.uploaded, null), count("Recordings synced", (t) => t.synced, null)] : []),
  ];
  return (
    <div className={`${cardClass} mt-3 p-3`}>
      <p className="text-xs text-slate-500">
        Compared with {comparison.label}
        {comparison.days.length > 1 ? ` (${comparison.days.length} days)` : ""}, whole days, from the daily totals: numbers only.
      </p>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => {
          const tone =
            c.change === null || c.change === 0 || c.higherIsBetter === null ? "text-slate-500" : (c.change > 0) === c.higherIsBetter ? "text-emerald-700" : "text-red-700";
          const unit = c.label === "Reached the CRM" ? " pts" : "%";
          return (
            <div key={c.label}>
              <dt className="text-xs text-slate-500">{c.label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">{c.value}</dd>
              <dd className="text-xs tabular-nums text-slate-500">
                {c.before === null ? (
                  `Nothing stored for ${comparison.label}`
                ) : (
                  <>
                    {capital(comparison.label)}: {c.before}
                    {c.change !== null && c.change !== 0 && (
                      <span className={`ml-1 font-medium ${tone}`}>
                        {c.change > 0 ? "▲" : "▼"} {Math.abs(c.change)}
                        {unit}
                      </span>
                    )}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
