"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// The range picker on every health page (owner, 2026-11-19): a dropdown of calendar ranges, and a
// custom date and time range held inside the days calls are stored. Links are built on the server;
// while the next range loads, the page stays on screen with a spinner here.
export type RangeOption = { key: string; label: string; href: string };
export type CustomRange = { path: string; keep: [string, string][]; from: string; to: string; min: string; max: string };

export function RangeSelect({ current, options, custom }: { current: string; options: RangeOption[]; custom: CustomRange }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState(current);
  const [from, setFrom] = useState(custom.from);
  const [to, setTo] = useState(custom.to);
  const go = (href: string) => start(() => router.push(href, { scroll: false }));

  const valid = from && to && from < to && from >= custom.min && to <= custom.max;
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const query = new URLSearchParams(custom.keep);
    query.set("range", "custom");
    query.set("from", from);
    query.set("to", to);
    go(`${custom.path}?${query}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Range
        <select
          value={picked}
          onChange={(event) => {
            const key = event.target.value;
            setPicked(key);
            const option = options.find((o) => o.key === key);
            if (option) go(option.href);
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
          <option value="custom">Custom date / time…</option>
        </select>
      </label>
      {picked === "custom" && (
        <form onSubmit={apply} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <input type="datetime-local" aria-label="From (IST)" value={from} min={custom.min} max={custom.max} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <span>to</span>
          <input type="datetime-local" aria-label="To (IST)" value={to} min={custom.min} max={custom.max} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <span className="text-slate-400">IST</span>
          <button type="submit" disabled={!valid} className="rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white disabled:opacity-40">
            Apply
          </button>
          {!valid && <span className="text-amber-800">Pick a start before the end, within the stored days.</span>}
        </form>
      )}
      {pending && <span aria-label="Loading" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700" />}
    </div>
  );
}
