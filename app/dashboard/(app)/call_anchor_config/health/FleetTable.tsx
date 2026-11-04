"use client";

import { useState } from "react";
import Link from "next/link";
import type { FleetRow, Level } from "@/lib/callanchor/health";
import { cardClass, inputClass } from "@/components/ui";
import { DAY_STATES, LEVELS, int, itemsHref, pct, rateClass } from "./format";
import { ItemLink } from "./parts";

// Times are formatted on the server, so the client doesn't re-render them in another zone. Issues
// stay on the server: a row carries only its worst one's title.
export type FleetTableRow = Omit<FleetRow, "issues"> & { lastActivityLabel: string; lastSyncLabel: string; topIssue: string | null };

const FILTERS: (Level | "all")[] = ["all", "critical", "warning", "healthy", "idle", "unknown"];
const td = "whitespace-nowrap px-3 py-2 align-top";

export function FleetTable({ rows, basePath }: { rows: FleetTableRow[]; basePath: string }) {
  const [filter, setFilter] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const visible = rows.filter((r) => showInactive || r.status !== "inactive");
  const inactive = rows.length - rows.filter((r) => r.status !== "inactive").length;
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? visible.length : visible.filter((r) => r.level === f).length]));
  const shown = visible.filter((r) => (filter === "all" || r.level === filter) && r.companyName.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === f ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : LEVELS[f].label} {counts[f]}
          </button>
        ))}
        {inactive > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show {inactive} inactive
          </label>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a client"
          aria-label="Find a client"
          className={`${inputClass} ml-auto max-w-56 py-1.5`}
        />
      </div>

      <div className={`${cardClass} mt-3 overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Health</th>
              <th className="px-3 py-2 text-right font-medium" title="Calls in the last 24 hours, from the stored logs and callouts">Calls 24h</th>
              <th className="px-3 py-2 text-right font-medium" title="Calls due at the CRM in the last 24 hours that it accepted (2xx). Calls with nowhere to go aren't due">Reached CRM</th>
              <th className="px-3 py-2 font-medium" title="When a call last reached the CRM, and the last 7 days: a day is synced when 80% of its due calls reached it">CRM sync, 7 days</th>
              <th className="px-3 py-2 text-right font-medium" title="Recordings synced to the CRM / verified, last 24 hours. Open drops are kept for 30 days until fixed">Recordings</th>
              <th className="px-3 py-2 font-medium" title="Active seats logged in, and seats seen calling in 24 hours. Then phones needing action">Seats</th>
              <th className="px-3 py-2 font-medium">Open issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const calls = (stage: string, window = 1) => itemsHref(basePath, { kind: "calls", stage }, { client: r.clientId, window });
              return (
                <tr key={r.clientId} className="hover:bg-slate-50">
                  <td className={td}>
                    <Link href={`${basePath}/${r.clientId}`} className="font-medium text-indigo-700 hover:underline">
                      {r.companyName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {r.status}
                      {r.integrations.length ? ` · ${r.integrations.join(", ")}` : " · no integration"}
                    </p>
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${LEVELS[r.level].className}`}>
                      <span aria-hidden>{LEVELS[r.level].icon}</span>
                      {LEVELS[r.level].label}
                    </span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    <ItemLink href={calls("all")}>{int(r.calls24h)}</ItemLink>
                    <p className="text-xs text-slate-400">{r.lastActivityLabel}</p>
                  </td>
                  <td className={`${td} text-right tabular-nums ${rateClass(r.reachedShare)}`}>
                    {r.due ? <ItemLink href={calls("notReached")}>{pct(r.reachedShare)}</ItemLink> : <span className="text-slate-400" title="No call was due at a CRM">—</span>}
                    {r.due > 0 && <p className="text-xs font-normal text-slate-400">{int(r.reached)} of {int(r.due)}</p>}
                  </td>
                  <td className={td}>
                    <ol className="flex gap-0.5" aria-label="CRM sync by day, oldest first">
                      {r.days.map((d) => (
                        <li
                          key={d.day}
                          title={`${d.day}: ${DAY_STATES[d.state].label}${d.due ? `, ${d.delivered} of ${d.due} due reached the CRM` : ""}`}
                          className={`flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold ${DAY_STATES[d.state].className}`}
                        >
                          <span aria-hidden>{DAY_STATES[d.state].icon}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.week.active ? `${r.week.synced} of ${r.week.active} days` : "no due calls"} · last {r.lastSyncLabel}
                    </p>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    <ItemLink href={calls("synced")}>{int(r.recordingsSynced)}</ItemLink>
                    <span className="text-slate-400"> / </span>
                    <ItemLink href={calls("verified")}>{int(r.recordingsVerified)}</ItemLink>
                    {r.openDrops > 0 && (
                      <p className="text-xs font-medium text-amber-800">
                        <ItemLink href={calls("openDrop", 30)}>{int(r.openDrops)} open</ItemLink>
                      </p>
                    )}
                  </td>
                  <td className={`${td} text-xs`}>
                    {r.seats.active ? (
                      <>
                        {r.seats.loggedIn}/{r.seats.active} logged in · {r.seats.calling} calling
                        {r.seats.purchased !== null && r.seats.purchased !== r.seats.active && <span className="text-slate-400"> · {r.seats.purchased} bought</span>}
                        {(r.licenses.critical > 0 || r.licenses.warning > 0) && (
                          <p>
                            {r.licenses.critical > 0 && <span className="text-red-700">{r.licenses.critical} critical </span>}
                            {r.licenses.warning > 0 && <span className="text-amber-800">{r.licenses.warning} warning</span>}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="min-w-56 px-3 py-2 align-top text-xs">
                    {r.error && <p className="text-red-700">{r.error}</p>}
                    {r.openIssues > 0 ? (
                      <Link href={`${basePath}/${r.clientId}`} className="hover:underline">
                        <span className="font-medium text-slate-900">{r.openIssues}</span>
                        <span className="text-slate-600"> · {r.topIssue}</span>
                      </Link>
                    ) : (
                      !r.error && <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No clients match.</p>}
      </div>
    </div>
  );
}
