import Link from "next/link";
import { Suspense } from "react";
import { loadFleetLicenses, type FleetLicense } from "@/lib/callanchor/health";
import { durationText, type SeatState } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { LICENSE_STATUSES, STATUS_RANK, ago, clientHref, formatTime, int, licenseHref, pct, rateClass } from "../format";
import { Hero, Ring, StatCell, StatStrip } from "../ui";
import { DayStrip, rowLinkClass, ItemLink, LastComplete, LoadingNote, Section, StatusBadge, Table, issueLinks, td } from "../parts";

// Licenses and seats in one view (owner, 2026-11-13): a seat is a license, so an unused seat is an
// unused license. Every license across clients, or one client's (its Licenses tab,
// /health/clients/<client>/licenses), with its health and how it's used, from the store. Below the
// list: seat use per client (fleet only), and problems grouped by device model and app version, which
// shows when an issue follows a phone rather than a client.

const FILTERS = { status: "Health", use: "Use", app: "App version", model: "Device model" } as const;
type Filters = Partial<Record<keyof typeof FILTERS, string>>;
type Query = Record<string, string | string[] | undefined>;

const SEAT_STATES: Record<SeatState, { label: string; className: string }> = {
  calling: { label: "Calling", className: "text-emerald-700" },
  idle: { label: "Logged in, not calling", className: "font-medium text-amber-800" },
  loggedOut: { label: "Logged out", className: "font-medium text-amber-800" },
  unassigned: { label: "Not assigned", className: "font-medium text-amber-800" },
  inactive: { label: "Inactive", className: "text-slate-400" },
};
const UNUSED: SeatState[] = ["idle", "loggedOut", "unassigned"];
// The use filter: "unused" is any of the three, the rest one state each.
const USES = ["unused", "calling", "idle", "loggedOut", "unassigned", "inactive"] as const;
const labelOfUse = (use: string) => (use === "unused" ? "Unused" : (SEAT_STATES[use as SeatState]?.label ?? use));
const isUse = (h: FleetLicense, use: string) => (use === "unused" ? UNUSED.includes(h.seat.state) : h.seat.state === use);

const needsAction = (h: FleetLicense) => h.status === "critical" || h.status === "warning";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;

export async function LicensesView({ query, clientId }: { query: Query; clientId: string | null }) {
  const PATH = `${clientId ? clientHref(HEALTH_PATH, clientId) : HEALTH_PATH}/licenses`;
  const filters: Filters = {};
  for (const key of Object.keys(FILTERS) as (keyof typeof FILTERS)[]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 200) filters[key] = value;
  }
  const href = (changes: Filters & Record<string, string | null | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...changes })) if (value) next.set(key, value);
    return next.size ? `${PATH}?${next}` : PATH;
  };
  await requireCallAnchorSession(href({}));

  return (
    <div>
      {clientId && (
        <>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Licenses</h2>
          <p className="mt-1 text-sm text-slate-500">Every license (seat) of this client: its health and how it&apos;s used, worst first.</p>
        </>
      )}
      <Suspense key={href({})} fallback={<LoadingNote text="Reading every license…" />}>
        <Licenses filters={filters} href={href} clientId={clientId} />
      </Suspense>
    </div>
  );
}

async function Licenses({ filters, href, clientId }: { filters: Filters; href: (changes: Record<string, string | null | undefined>) => string; clientId: string | null }) {
  // A client asked for by id is shown even when it's internal.
  const { licenses: every, clients: everyClient, hiddenInternal, unusedAfterMs, loadedAt } = await loadFleetLicenses(Boolean(clientId) || (await showInternal()));
  const licenses = clientId ? every.filter((h) => h.license.clientId === clientId) : every;
  const clients = (clientId ? everyClient.filter((c) => c.clientId === clientId) : everyClient).filter((c) => c.status !== "inactive");
  const now = Date.parse(loadedAt);
  const model = (h: FleetLicense) => [h.license.deviceBrand, h.license.deviceModel].filter(Boolean).join(" ") || "Unknown device";
  // Without a filter the fleet view lists what needs a look: a health problem or an unused license.
  // One client's view lists every license.
  const unfiltered = !filters.status && !filters.use;
  const matches = (h: FleetLicense, skip?: keyof Filters) =>
    (skip === "status" || !filters.status || h.status === filters.status) &&
    (skip === "use" || !filters.use || isUse(h, filters.use)) &&
    (skip === "status" || skip === "use" || !unfiltered || clientId !== null || needsAction(h) || UNUSED.includes(h.seat.state)) &&
    (skip === "app" || !filters.app || (h.license.appVersion ?? "Unknown") === filters.app) &&
    (skip === "model" || !filters.model || model(h) === filters.model);
  const shown = licenses
    .filter((h) => matches(h))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(UNUSED.includes(b.seat.state)) - Number(UNUSED.includes(a.seat.state)) || b.issues.length - a.issues.length);

  // Seat totals over working clients.
  const sum = (key: "active" | "assigned" | "loggedIn" | "calling" | "idle" | "loggedOut" | "unassigned") => clients.reduce((t, c) => t + c.seats[key], 0);
  const purchased = clients.length && clients.every((c) => c.seats.purchased !== null) ? clients.reduce((t, c) => t + (c.seats.purchased ?? 0), 0) : null;
  const unused = sum("idle") + sum("loggedOut") + sum("unassigned");
  const notSetUp = purchased !== null ? Math.max(0, purchased - sum("active")) : null;
  const needs = licenses.filter(needsAction).length;

  // Problems grouped by what the phones share, against how many phones share it.
  const group = (key: (h: FleetLicense) => string) => {
    const groups = new Map<string, { total: number; problems: number }>();
    for (const h of licenses) {
      if (!h.license.isLoggedIn && !needsAction(h)) continue;
      const g = groups.get(key(h)) ?? { total: 0, problems: 0 };
      g.total++;
      if (needsAction(h)) g.problems++;
      groups.set(key(h), g);
    }
    return [...groups.entries()].filter(([, g]) => g.problems > 0).sort((a, b) => b[1].problems / b[1].total - a[1].problems / a[1].total || b[1].problems - a[1].problems);
  };
  const statusCounts = Object.keys(LICENSE_STATUSES).map((s) => ({ status: s, count: licenses.filter((h) => matches(h, "status") && h.status === s).length }));
  const useCounts = USES.map((u) => ({ use: u, count: licenses.filter((h) => matches(h, "use") && isUse(h, u)).length }));

  const strip = (
    <StatStrip attached={!clientId}>
      <StatCell
        icon="licenses"
        tone={needs ? "amber" : "green"}
        label="Licenses"
        value={int(sum("active"))}
        sub={`active${purchased !== null ? ` of ${int(purchased)} purchased` : ""}${notSetUp ? ` · ${int(notSetUp)} not set up` : ""}`}
        href={href({ status: null, use: null })}
      />
      <StatCell icon="alert" tone={needs ? "red" : "green"} label="Need action" value={int(needs)} sub="critical or warning health" href={href({ status: "critical", use: null })} />
      <StatCell
        icon="seats"
        tone="green"
        label="In use"
        value={`${int(sum("calling"))} / ${int(sum("active"))}`}
        sub={`calling · ${int(sum("loggedIn"))} logged in`}
        href={href({ use: "calling", status: null })}
      />
      <StatCell
        icon="activity"
        tone={unused ? "amber" : "green"}
        label="Unused"
        value={int(unused)}
        sub={`${int(sum("idle"))} not calling · ${int(sum("loggedOut"))} logged out · ${int(sum("unassigned"))} not assigned`}
        href={href({ use: "unused", status: null })}
      />
    </StatStrip>
  );

  return (
    <>
      {clientId ? (
        <div className="mt-4">{strip}</div>
      ) : (
        <Hero
          eyebrow={{ icon: "licenses", label: "Client health" }}
          title="Licenses"
          meta={
            <>
              Every license across clients: its health and how its seat is used. Without a filter, the list shows licenses needing action or
              unused. A seat is unused when it&apos;s not assigned, logged out, or logged in with no call for {durationText(unusedAfterMs)}.
              {hiddenInternal > 0 && ` ${hiddenInternal} internal clients hidden.`}
            </>
          }
          kpis={[{ label: "In use", value: pct(sum("active") ? Math.round((sum("calling") / sum("active")) * 100) : null), bar: sum("active") ? (sum("calling") / sum("active")) * 100 : null, note: "calling, of active" }]}
        >
          {strip}
        </Hero>
      )}

      <div className="mt-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wider text-slate-500">Health</span>
          {statusCounts.map(({ status, count }) => (
            <Link key={status} href={href({ status: filters.status === status ? null : status })} aria-pressed={filters.status === status} className={chip(filters.status === status)}>
              {LICENSE_STATUSES[status as keyof typeof LICENSE_STATUSES].label} {count}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wider text-slate-500">Use</span>
          {useCounts.map(({ use, count }) => (
            <Link key={use} href={href({ use: filters.use === use ? null : use })} aria-pressed={filters.use === use} className={chip(filters.use === use)}>
              {labelOfUse(use)} {count}
            </Link>
          ))}
          {(["app", "model"] as const).map((key) =>
            filters[key] ? (
              <Link key={key} href={href({ [key]: null })} title="Remove this filter" className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-800 hover:bg-indigo-100">
                <span className="font-medium">{FILTERS[key]}:</span> {filters[key]} <span aria-hidden>✕</span>
              </Link>
            ) : null,
          )}
        </div>
      </div>

      <Section title={`Licenses: ${shown.length}`} note={unfiltered && !clientId ? "Needing action or unused. Pick a filter above for the rest." : undefined}>
        <Table
          head={["Phone", ...(clientId ? [] : ["Client"]), "Health", "Seat", "Issues", "Calls 24h", "Reached CRM", "CRM sync, 7 days · last call through", "App", "Device"]}
          empty={shown.length ? undefined : "No licenses match."}
        >
          {shown.map((h) => {
            const seat = SEAT_STATES[h.seat.state];
            return (
              <tr key={h.license.licenseId} className="hover:bg-slate-50">
                <td className={td}>
                  <Link href={licenseHref(HEALTH_PATH, h.license.licenseId, h.license.clientId)} className={`${rowLinkClass} font-mono text-xs`}>…{h.license.last4}</Link>
                </td>
                {!clientId && (
                  <td className={td}>
                    <Link href={`${clientHref(HEALTH_PATH, h.license.clientId)}/licenses`} className={rowLinkClass}>{h.companyName}</Link>
                  </td>
                )}
                <td className={td}><StatusBadge status={h.status} /></td>
                <td className={`${td} text-xs`}>
                  <span className={seat.className}>{seat.label}</span>
                  {h.seat.since ? (
                    <p className="text-slate-500" title={`${formatTime(h.seat.since)} IST`}>since {ago(h.seat.since, now)}</p>
                  ) : (
                    h.seat.state !== "calling" && h.seat.state !== "inactive" && <p className="text-slate-400">{h.license.lastLoginLabel ? `last login ${h.license.lastLoginLabel}` : "since before tracking"}</p>
                  )}
                </td>
                <td className="min-w-56 px-3 py-2 align-top text-xs text-slate-700">
                  {h.issues.length ? (
                    h.issues.map((i) => (
                      <p key={i.id} className={i.level === "info" ? "text-slate-500" : ""}>
                        {i.level === "info" && <span aria-hidden className="text-sky-700">i </span>}
                        <ItemLink href={issueLinks(HEALTH_PATH, i).primary}>{i.title}</ItemLink>
                        {i.rolledUp ? " (shared by the client's phones)" : ""}
                      </p>
                    ))
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {int(h.calls24h)}
                  <p className="text-xs text-slate-400">last {ago(h.lastCallAt, now)}</p>
                </td>
                <td className={`${td} text-right tabular-nums ${rateClass(h.pulse.reached.share)}`}>{pct(h.pulse.reached.share)}</td>
                <td className={td}>
                  <DayStrip days={h.pulse.days.slice(-7)} size="sm" />
                  <LastComplete pulse={h.pulse} now={now} />
                </td>
                <td className={`${td} text-xs`}>
                  <Link href={href({ app: h.license.appVersion ?? "Unknown" })} className="hover:text-indigo-700 hover:underline">{h.license.appVersion ?? "—"}</Link>
                </td>
                <td className={`${td} text-xs`}>
                  <Link href={href({ model: model(h) })} className="hover:text-indigo-700 hover:underline">{model(h)}</Link>
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {!clientId && (
        <Section title="Seat use by client" note="Most unused first. Open a client for its licenses.">
          <Table head={[
              "Client",
              { label: "Purchased", info: "Purchased: total seats the client bought" },
              { label: "Active", info: "Ring = active ÷ purchased" },
              { label: "Assigned", info: "Ring = assigned ÷ active" },
              { label: "Logged in", info: "Ring = logged in ÷ active" },
              { label: "Calling", info: "Ring = calling ÷ active (a call within the unused threshold in Settings)" },
              { label: "Unused", info: "Unused = not assigned + logged out + logged in but not calling" },
            ]} empty={clients.length ? undefined : "No licenses stored yet."}>
            {[...clients]
              .sort((a, b) => b.seats.idle + b.seats.loggedOut + b.seats.unassigned - (a.seats.idle + a.seats.loggedOut + a.seats.unassigned) || b.seats.active - a.seats.active)
              .map((c) => {
                const idle = c.seats.idle + c.seats.loggedOut + c.seats.unassigned;
                const root = `${clientHref(HEALTH_PATH, c.clientId)}/licenses`;
                return (
                  <tr key={c.clientId} className="hover:bg-slate-50">
                    <td className={td}>
                      <Link href={root} className={rowLinkClass}>{c.companyName}</Link>
                      <p className="text-xs text-slate-500">{c.status}</p>
                    </td>
                    <td className={`${td} text-right font-medium tabular-nums text-slate-900`}>{int(c.seats.purchased)}</td>
                    <td className={td}><Ring value={c.seats.active} of={c.seats.purchased} /></td>
                    <td className={td}><Ring value={c.seats.assigned} of={c.seats.active} /></td>
                    <td className={td}><Ring value={c.seats.loggedIn} of={c.seats.active} /></td>
                    <td className={td}><Ring value={c.seats.calling} of={c.seats.active} /></td>
                    <td className={`${td} text-right tabular-nums ${idle ? "font-medium text-amber-800" : "text-slate-400"}`}>
                      {idle ? <ItemLink href={`${root}?use=unused`}>{int(idle)}</ItemLink> : int(idle)}
                    </td>
                  </tr>
                );
              })}
          </Table>
        </Section>
      )}

      <GroupPanel title="By device model" rows={group(model)} href={(value) => href({ model: value })} />
      <GroupPanel title="By app version" rows={group((h) => h.license.appVersion ?? "Unknown")} href={(value) => href({ app: value })} />
    </>
  );
}

function GroupPanel({ title, rows, href }: { title: string; rows: [string, { total: number; problems: number }][]; href: (value: string) => string }) {
  return (
    <Section title={title} note="Licenses needing action / logged-in licenses">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No problems.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
          {rows.slice(0, 12).map(([value, g]) => (
            <li key={value} className="flex justify-between gap-3 px-3 py-2">
              <Link href={href(value)} className={`truncate ${rowLinkClass}`}>{value}</Link>
              <span className="tabular-nums text-slate-600">{g.problems} / {g.total}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
