"use client";

import { useState } from "react";
import Link from "next/link";
import type { Drill, FleetRow, Level } from "@/lib/callanchor/health";
import { cardClass, inputClass } from "@/components/ui";
import { FLAG_TEXT, LEVELS, int, itemsHref, pct, rateClass } from "./format";
import { FlagText, ItemLink } from "./parts";

// Times are formatted on the server, so the client doesn't re-render them in another zone.
export type FleetTableRow = FleetRow & { lastCallLabel: string; lastDeliveredLabel: string };

const FILTERS: (Level | "all")[] = ["all", "critical", "warning", "healthy", "idle", "unknown"];
const td = "whitespace-nowrap px-3 py-2 align-top";

export function FleetTable({ rows, basePath }: { rows: FleetTableRow[]; basePath: string }) {
  const [filter, setFilter] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? rows.length : rows.filter((r) => r.level === f).length]));
  const shown = rows.filter(
    (r) => (filter === "all" || r.level === filter) && r.companyName.toLowerCase().includes(query.trim().toLowerCase()),
  );

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
              <th className="px-3 py-2 text-right font-medium" title="Calls today (CallAnchor's count) and lifetime">Calls today / total</th>
              <th className="px-3 py-2 text-right font-medium" title="From system logs, last 24 hours">Recordings uploaded 24h</th>
              <th className="px-3 py-2 text-right font-medium" title="recording.ready events delivered to the CRM, last 24 hours">Recordings synced 24h</th>
              <th className="px-3 py-2 text-right font-medium" title="All CRM callouts, last 24 hours">CRM syncs 24h</th>
              <th className="px-3 py-2 text-right font-medium">Success 24h</th>
              <th className="px-3 py-2 text-right font-medium">Success lifetime</th>
              <th className="px-3 py-2 text-right font-medium" title="CallAnchor's pending-recordings counter">Pending recordings</th>
              <th className="px-3 py-2 font-medium">Last call / last sync</th>
              <th className="px-3 py-2 font-medium">What needs attention</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const items = (drill: Drill) => itemsHref(basePath, drill, { client: r.clientId });
              return (
                <tr key={r.clientId} className="hover:bg-slate-50">
                  <td className={td}>
                    <Link href={`${basePath}/${r.clientId}`} className="font-medium text-indigo-700 hover:underline">
                      {r.companyName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {r.status} · {r.licenses} licenses logged in{r.integrations.length ? ` · ${r.integrations.join(", ")}` : ""}
                    </p>
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${LEVELS[r.level].className}`}>
                      <span aria-hidden>{LEVELS[r.level].icon}</span>
                      {LEVELS[r.level].label}
                    </span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {int(r.callsToday)} <span className="text-slate-400">/ {int(r.totalCalls)}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {int(r.uploadsVerified)}
                    {r.stuckRecordings > 0 && (
                      <p className="text-xs text-red-700"><ItemLink href={items({ kind: "recordings", stage: "stuck" })}>{r.stuckRecordings} stuck</ItemLink></p>
                    )}
                    {r.waitingRecordings > 0 && (
                      <p className="text-xs text-amber-800"><ItemLink href={items({ kind: "recordings", stage: "waiting" })}>{r.waitingRecordings} not uploaded</ItemLink></p>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {int(r.recordingsSynced)}
                    {r.unsyncedRecordings > 0 && (
                      <p className="text-xs text-amber-800"><ItemLink href={items({ kind: "recordings", stage: "unsynced" })}>{r.unsyncedRecordings} not synced</ItemLink></p>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {int(r.syncDelivered)}
                    {r.syncFailed > 0 && (
                      <span className="text-red-700"> + <ItemLink href={items({ kind: "syncs", status: "failed" })}>{int(r.syncFailed)} failed</ItemLink></span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums ${rateClass(r.successRate)}`}>{pct(r.successRate)}</td>
                  <td className={`${td} text-right tabular-nums ${rateClass(r.lifetimeSuccessRate)}`}>
                    {pct(r.lifetimeSuccessRate)}
                    <p className="text-xs font-normal text-slate-400">{int(r.lifetimeEvents)} events</p>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{int(r.pendingRecordings)}</td>
                  <td className={`${td} text-xs text-slate-500`}>
                    {r.lastCallLabel}
                    <br />
                    {r.lastDeliveredLabel}
                  </td>
                  <td className="min-w-72 px-3 py-2 align-top text-xs">
                    {r.error && <p className="text-red-700">{r.error}</p>}
                    {r.flags.filter((f) => f.level !== "info").slice(0, 3).map((f) => (
                      <p key={f.text} className={FLAG_TEXT[f.level]}><FlagText flag={f} href={items} /></p>
                    ))}
                    {r.topError && (
                      <p className="mt-0.5 text-slate-500" title={r.topError.label}>
                        Top error:{" "}
                        <ItemLink href={items({ kind: "syncs", status: "failed", label: r.topError.label })}>{r.topError.label.slice(0, 90)}</ItemLink>
                      </p>
                    )}
                    {!r.error && r.flags.every((f) => f.level === "info") && !r.topError && <p className="text-slate-400">—</p>}
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
