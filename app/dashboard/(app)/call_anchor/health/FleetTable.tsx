"use client";

import { useState } from "react";
import Link from "next/link";
import type { FleetRow, Level } from "@/lib/callanchor/health";
import { MODULES, type IssueModule } from "@/lib/callanchor/modules";
import { cardClass, inputClass } from "@/components/ui";
import { CLIENT_VIEWS, LEVELS, callHref, clientHref, int, itemsHref, severityTone } from "./format";
import type { ClientView } from "./format";
import { ItemLink, JourneyDots, SyncCell, rowLinkClass } from "./parts";
import { MetricRing } from "./ui";
import { MenuLayout } from "./FilterMenu";

// Times are formatted on the server, so the client doesn't re-render them in another zone. Issues
// stay on the server: a row carries only its worst one's title.
export type FleetTableRow = Omit<FleetRow, "issues"> & { lastActivityLabel: string; lastSyncLabel: string; lastCompleteLabel: string | null; topIssue: string | null; internal: boolean; issueModules: Record<IssueModule, number>; levels: Record<ClientView, Level> };

const FILTERS: (Level | "all")[] = ["all", "critical", "warning", "healthy", "idle", "unknown"];
// Client stats by module (owner, 2026-11-13): the client and its health always show, then one
// module's columns.
const RANK: Record<Level, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3, idle: 4 };
const MODULE_IDS = Object.keys(MODULES) as IssueModule[];
const info = (label: string, tip: string) => (
  <span className="inline-flex items-center gap-1" title={tip}>
    {label}
    <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold normal-case text-slate-600">i</span>
  </span>
);
const td = "whitespace-nowrap px-3 py-2 align-top";

export function FleetTable({
  rows,
  basePath,
  path,
  initialView,
  initialHealth,
}: {
  rows: FleetTableRow[];
  basePath: string;
  path: string;
  initialView: ClientView;
  initialHealth: string;
}) {
  const [view, setViewState] = useState<ClientView>(initialView);
  const [filter, setFilterState] = useState<Level | "all">(FILTERS.includes(initialHealth as Level) ? (initialHealth as Level) : "all");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  // The picks live in the URL too, so a reload or a shared link keeps them.
  const remember = (next: { view: ClientView; health: Level | "all" }) => {
    const params = new URLSearchParams(window.location.search);
    if (next.view === "journey") params.delete("view");
    else params.set("view", next.view);
    if (next.health === "all") params.delete("health");
    else params.set("health", next.health);
    window.history.replaceState(null, "", `${path}${params.size ? `?${params}` : ""}`);
  };
  const setView = (v: ClientView) => {
    setViewState(v);
    remember({ view: v, health: filter });
  };
  const setFilter = (f: Level | "all") => {
    setFilterState(f);
    remember({ view, health: f });
  };
  const visible = rows.filter((r) => showInactive || r.status !== "inactive");
  const inactive = rows.length - rows.filter((r) => r.status !== "inactive").length;
  const level = (r: FleetTableRow) => r.levels[view];
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? visible.length : visible.filter((r) => level(r) === f).length])) as Record<Level | "all", number>;
  const shown = visible
    .filter((r) => (filter === "all" || level(r) === filter) && r.companyName.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => RANK[level(a)] - RANK[level(b)]);
  const viewLabel = CLIENT_VIEWS.find((v) => v.id === view)!.label;

  return (
    <MenuLayout
      groups={[
        {
          title: "Module",
          items: CLIENT_VIEWS.map((v) => ({ key: v.id, label: v.label, title: v.note, active: v.id === view, always: true, onClick: () => setView(v.id) })),
        },
        {
          title: `Health · ${viewLabel}`,
          items: FILTERS.map((f) => ({
            key: f,
            label: f === "all" ? "All" : LEVELS[f].label,
            count: counts[f],
            tone: f === "all" ? undefined : severityTone(f),
            active: filter === f,
            always: f === "all",
            onClick: () => setFilter(f),
          })),
        },
      ]}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Clients: {viewLabel}
          <span className="ml-2 text-sm font-normal text-slate-500">{shown.length} shown</span>
        </h2>
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
      <p className="mt-1 text-sm text-slate-500">
        Health here is judged on {view === "journey" ? "the call journey: issues that break it, else healthy with calls and idle without" : view === "licenses" ? "the client's licenses: the worst one, else healthy with a phone calling and idle without" : "all the client's open issues"}.
      </p>

      <div className={`${cardClass} mt-3 overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Health</th>
              {view === "journey" && (
                <>
                  <th className="px-3 py-2 font-medium" title="Phone → app → recording uploaded → sent to the CRM → accepted. A red dot is a step where calls stopped in the last 24 hours, with how many">Journey 24h</th>
                  <th className="px-3 py-2 text-right font-medium" title="Calls in the last 24 hours, from the stored logs and callouts">Calls 24h</th>
                  <th className="px-3 py-2 text-center font-medium" title="Calls due at the CRM in the last 24 hours that it accepted (2xx), of all due; hover a ring for the share. Calls with nowhere to go aren't due">Reached CRM</th>
                  <th className="px-3 py-2 font-medium" title="The last 7 days (a day is synced when 80% of its due calls reached the CRM), and when a call last went all the way from the phone to the CRM">CRM sync, 7 days</th>
                  <th className="px-3 py-2 text-center font-medium" title="Recordings synced to the CRM, of those verified, last 24 hours; hover for the share. Open drops are kept for 15 days until fixed">Recordings synced</th>
                </>
              )}
              {view === "licenses" && (
                <>
                  <th className="whitespace-nowrap px-3 py-2 font-medium" title="Licenses with critical or warning health, of all the client's licenses">Licenses needing action</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium">{info("Active", "Active licenses, of those purchased. Hover a ring for the share")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium">{info("Logged in", "Logged in, of the active licenses")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium">{info("Calling", "Calling, of the active licenses (a call within the unused threshold in Settings)")}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium">{info("Unused", "Not assigned + logged out + logged in but not calling, of the active licenses")}</th>
                  <th className="px-3 py-2 font-medium" title="The last 7 days (a day is synced when 80% of its due calls reached the CRM), and when a call last went all the way from the phone to the CRM">CRM sync, 7 days</th>
                </>
              )}
              {view === "issues" && (
                <>
                  <th className="px-3 py-2 text-right font-medium">Open issues</th>
                  {MODULE_IDS.map((m) => (
                    <th key={m} className="px-3 py-2 text-right font-medium" title={MODULES[m].note}>{MODULES[m].label}</th>
                  ))}
                  <th className="px-3 py-2 font-medium">Worst issue</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const calls = (stage: string, window = 1) => itemsHref(basePath, { kind: "calls", stage }, { client: r.clientId, window });
              return (
                <tr key={r.clientId} className="hover:bg-slate-50">
                  <td className={td}>
                    <Link href={clientHref(basePath, r.clientId)} className={rowLinkClass}>
                      {r.companyName}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {r.internal && <span className="font-medium text-slate-700">internal · </span>}
                      {r.status}
                      {r.integrations.length ? ` · ${r.integrations.join(", ")}` : " · no integration"}
                    </p>
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${LEVELS[level(r)].className}`}>
                      <span aria-hidden>{LEVELS[level(r)].icon}</span>
                      {LEVELS[level(r)].label}
                    </span>
                  </td>
                  {view === "journey" && (
                    <>
                      <td className={td}>
                        <JourneyDots journey={r.journey} href={(stage) => calls(stage)} />
                      </td>
                      <td className={`${td} text-right tabular-nums`}>
                        <ItemLink href={calls("all")}>{int(r.calls24h)}</ItemLink>
                        <p className="text-xs text-slate-400">{r.lastActivityLabel}</p>
                      </td>
                      <td className={`${td} text-center`}>
                        {r.due ? (
                          <MetricRing value={r.reached} of={r.due} hue="teal" ofLabel="due calls reached the CRM" href={calls("notReached")} />
                        ) : (
                          <span className="text-slate-400" title="No call was due at a CRM">—</span>
                        )}
                      </td>
                      <td className={td}>
                        <SyncCell
                          days={r.days}
                          week={r.week}
                          last={r.lastComplete ? { href: callHref(basePath, r.lastComplete.callId, undefined, r.clientId), label: r.lastCompleteLabel ?? "" } : null}
                        />
                      </td>
                      <td className={`${td} text-center`}>
                        <MetricRing value={r.recordingsSynced} of={r.recordingsVerified} hue="blue" ofLabel="verified recordings synced" href={calls("synced")} />
                        {r.openDrops > 0 && (
                          <p className="text-xs font-medium text-amber-800">
                            <ItemLink href={calls("openDrop", 15)}>{int(r.openDrops)} open</ItemLink>
                          </p>
                        )}
                      </td>
                    </>
                  )}
                  {view === "licenses" && (
                    <>
                      <td className={`${td} tabular-nums`}>
                        <Link href={`${clientHref(basePath, r.clientId)}/licenses`} className="hover:underline" title="Open this client's licenses">
                          {r.licenses.critical + r.licenses.warning > 0 ? (
                            <>
                              {r.licenses.critical > 0 && <span className="text-red-700">{r.licenses.critical} critical </span>}
                              {r.licenses.warning > 0 && <span className="text-amber-800">{r.licenses.warning} warning </span>}
                            </>
                          ) : (
                            <span className="text-slate-500">none </span>
                          )}
                          <span className="text-slate-400">of {r.licenses.total}</span>
                        </Link>
                      </td>
                      <td className={`${td} text-center`}><MetricRing value={r.seats.active} of={r.seats.purchased} hue="blue" ofLabel="purchased are active" /></td>
                      <td className={`${td} text-center`}><MetricRing value={r.seats.loggedIn} of={r.seats.active} hue="lime" ofLabel="active are logged in" /></td>
                      <td className={`${td} text-center`}><MetricRing value={r.seats.calling} of={r.seats.active} hue="violet" ofLabel="active are calling" /></td>
                      <td className={`${td} text-center`}>
                        <MetricRing
                          value={r.seats.idle + r.seats.loggedOut + r.seats.unassigned}
                          of={r.seats.active}
                          hue="amber"
                          ofLabel="active are unused"
                          href={r.seats.idle + r.seats.loggedOut + r.seats.unassigned > 0 ? `${clientHref(basePath, r.clientId)}/licenses?use=unused` : undefined}
                        />
                      </td>
                      <td className={td}>
                        <SyncCell
                          days={r.days}
                          week={r.week}
                          last={r.lastComplete ? { href: callHref(basePath, r.lastComplete.callId, undefined, r.clientId), label: r.lastCompleteLabel ?? "" } : null}
                        />
                      </td>
                    </>
                  )}
                  {view === "issues" && (
                    <>
                      <td className={`${td} text-right tabular-nums`}>
                        {r.openIssues > 0 ? (
                          <Link href={clientHref(basePath, r.clientId)} className="font-medium text-slate-900 hover:underline">{r.openIssues}</Link>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      {MODULE_IDS.map((m) => (
                        <td key={m} className={`${td} text-right tabular-nums ${r.issueModules[m] ? "font-medium text-amber-800" : "text-slate-400"}`}>{r.issueModules[m]}</td>
                      ))}
                      <td className="min-w-56 px-3 py-2 align-top text-xs">
                        {r.error && <p className="text-red-700">{r.error}</p>}
                        {r.topIssue ? (
                          <Link href={clientHref(basePath, r.clientId)} className="text-slate-700 hover:underline">{r.topIssue}</Link>
                        ) : (
                          !r.error && <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No clients match.</p>}
      </div>
    </MenuLayout>
  );
}
