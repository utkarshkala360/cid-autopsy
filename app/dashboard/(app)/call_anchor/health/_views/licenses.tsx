import Link from "next/link";
import { Suspense } from "react";
import { loadFleetLicenses, type FleetLicense, type Seats } from "@/lib/callanchor/health";
import { RULES, durationText, type SeatState } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { LICENSE_STATUSES, STATUS_RANK, ago, callHref, clientHref, formatTime, int, licenseHref, severityTone, type Tone } from "../format";
import { MetricRing, StatCell, StatStrip } from "../ui";
import { MenuLayout } from "../FilterMenu";
import { SyncCell, rowLinkClass, ItemLink, LoadingNote, StatusBadge, Table, issueLinks, td } from "../parts";

// Licenses and seats in one view (owner, 2026-11-13): a seat is a license, so an unused seat is an
// unused license. Every license across clients, or one client's (its Licenses tab,
// /health/clients/<client>/licenses), with its health and how it's used, from the store. Below the
// list: seat use per client (fleet only), and problems grouped by device model and app version, which
// shows when an issue follows a phone rather than a client.

// Each module has its own filters (owner, 2026-11-13): Health & use filters by health and seat use,
// Calls & CRM by calls, CRM reach and sync days, Device by model, app, recording and dialer. Only the
// picked module's filters apply, and changing module clears them.
const FILTERS = {
  lm: "Module",
  status: "Health",
  use: "Use",
  calls: "Calls, 24h",
  reach: "Reached CRM, 24h",
  sync: "CRM sync, 7 days",
  model: "Device model",
  app: "App version",
  rec: "Recording on",
  dialer: "Google dialer",
} as const;
const FILTER_KEYS = (Object.keys(FILTERS) as (keyof typeof FILTERS)[]).filter((k) => k !== "lm");
// License stats by module (owner, 2026-11-13): the phone and its client always show, then one
// module's columns.
const VIEWS = [
  { id: "health", label: "Health & use" },
  { id: "crm", label: "Calls & CRM" },
  { id: "device", label: "Device" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const yesNo = (v: boolean | null) => (v === null ? "—" : v ? "Yes" : "No");
type Filters = Partial<Record<keyof typeof FILTERS, string>>;
type Option = { value: string; label: string; tone?: Tone; test: (h: FleetLicense) => boolean };
type FilterDef = { key: Exclude<keyof Filters, "lm">; options: Option[] };
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

// Use chips in status colours: calling went well, unused worth a look, inactive a plain count.
const USE_TONE: Record<(typeof USES)[number], Tone> = { unused: "amber", calling: "green", idle: "amber", loggedOut: "amber", unassigned: "amber", inactive: "slate" };

const needsAction = (h: FleetLicense) => h.status === "critical" || h.status === "warning";
export type LicenseFilters = Filters;
type Href = (changes: Record<string, string | null | undefined>) => string;

// The license filters a URL carries, and links that change them. `keep` holds other query values
// the page needs to keep (the merged page's `issues=all`); `hash` lands on the list.
export function licenseFilters(query: Query, path: string, keep: Record<string, string> = {}, hash = "") {
  const filters: Filters = {};
  for (const key of Object.keys(FILTERS) as (keyof typeof FILTERS)[]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 200) filters[key] = value;
  }
  const href: Href = (changes) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keep, ...filters, ...changes })) if (value) next.set(key, value);
    return `${path}${next.size ? `?${next}` : ""}${hash}`;
  };
  return { filters, href };
}

// One client's Licenses tab (/health/clients/<client>/licenses).
export async function LicensesView({ query, clientId }: { query: Query; clientId: string }) {
  const PATH = `${clientHref(HEALTH_PATH, clientId)}/licenses`;
  const { filters, href } = licenseFilters(query, PATH);
  await requireCallAnchorSession(href({}));

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">Licenses</h2>
      <p className="mt-1 text-sm text-slate-500">Every license (seat) of this client: its health and how it&apos;s used, worst first.</p>
      <Suspense key={href({})} fallback={<LoadingNote text="Reading every license…" />}>
        <Licenses filters={filters} href={href} clientId={clientId} />
      </Suspense>
    </div>
  );
}

async function Licenses({ filters, href, clientId }: { filters: Filters; href: Href; clientId: string }) {
  // A client asked for by id is shown even when it's internal.
  const { licenses: every, clients: everyClient, hiddenInternal, unusedAfterMs, loadedAt } = await loadFleetLicenses(true);
  return (
    <LicensesPanel
      licenses={every.filter((h) => h.license.clientId === clientId)}
      clients={everyClient.filter((c) => c.clientId === clientId)}
      filters={filters}
      href={href}
      clientId={clientId}
      now={Date.parse(loadedAt)}
      unusedAfterMs={unusedAfterMs}
      hiddenInternal={hiddenInternal}
    />
  );
}

type SeatClient = { clientId: string; companyName: string; status: string; seats: Seats };

// The license list from data already read: the seat strip, then the list by module (Health & use,
// Calls & CRM, Device) with Module, Health and Use as the left menu (owner, 2026-11-13). The Licenses
// tab passes every license (clientId null); a client's Licenses tab passes its own.
export function LicensesPanel({
  licenses,
  clients: allClients,
  filters,
  href,
  clientId,
  now,
  unusedAfterMs,
  hiddenInternal,
}: {
  licenses: FleetLicense[];
  clients: SeatClient[];
  filters: Filters;
  href: Href;
  clientId: string | null;
  now: number;
  unusedAfterMs: number;
  hiddenInternal: number;
}) {
  const clients = allClients.filter((c) => c.status !== "inactive");
  const model = (h: FleetLicense) => [h.license.deviceBrand, h.license.deviceModel].filter(Boolean).join(" ") || "Unknown device";
  const view: View = VIEWS.find((v) => v.id === filters.lm)?.id ?? "health";
  const rate = RULES.syncedDayRate;
  const bool = (value: (h: FleetLicense) => boolean | null, yes: string, no: string, noTone: Tone): Option[] => [
    { value: "yes", label: yes, tone: "green", test: (h) => value(h) === true },
    { value: "no", label: no, tone: noTone, test: (h) => value(h) === false },
    { value: "unknown", label: "Not reported", tone: "slate", test: (h) => value(h) === null },
  ];
  const listOf = (value: (h: FleetLicense) => string): Option[] =>
    [...new Set(licenses.map(value))]
      .sort((x, y) => licenses.filter((h) => value(h) === y).length - licenses.filter((h) => value(h) === x).length)
      .map((v) => ({ value: v, label: v, test: (h: FleetLicense) => value(h) === v }));
  const DEFS: Record<View, FilterDef[]> = {
    health: [
      { key: "status", options: Object.keys(LICENSE_STATUSES).map((st) => ({ value: st, label: LICENSE_STATUSES[st as keyof typeof LICENSE_STATUSES].label, tone: severityTone(st), test: (h: FleetLicense) => h.status === st })) },
      { key: "use", options: USES.map((u) => ({ value: u, label: labelOfUse(u), tone: USE_TONE[u], test: (h: FleetLicense) => isUse(h, u) })) },
    ],
    crm: [
      {
        key: "calls",
        options: [
          { value: "yes", label: "Made calls", tone: "green", test: (h) => h.calls24h > 0 },
          { value: "none", label: "No calls", tone: "slate", test: (h) => h.calls24h === 0 },
        ],
      },
      {
        key: "reach",
        options: [
          { value: "good", label: `${rate}% or more`, tone: "green", test: (h) => h.pulse.reached.due > 0 && (h.pulse.reached.share ?? 0) >= rate },
          { value: "low", label: `Below ${rate}%`, tone: "amber", test: (h) => h.pulse.reached.due > 0 && (h.pulse.reached.share ?? 0) > 0 && (h.pulse.reached.share ?? 0) < rate },
          { value: "none", label: "None reached", tone: "red", test: (h) => h.pulse.reached.due > 0 && h.pulse.reached.delivered === 0 },
          { value: "nodue", label: "Nothing due", tone: "slate", test: (h) => h.pulse.reached.due === 0 },
        ],
      },
      {
        key: "sync",
        options: [
          { value: "every", label: "Synced every day", tone: "green", test: (h) => h.pulse.week.active > 0 && h.pulse.week.synced === h.pulse.week.active },
          { value: "missed", label: "Missed some days", tone: "amber", test: (h) => h.pulse.week.synced > 0 && h.pulse.week.synced < h.pulse.week.active },
          { value: "none", label: "No day synced", tone: "red", test: (h) => h.pulse.week.active > 0 && h.pulse.week.synced === 0 },
          { value: "nodue", label: "Nothing due", tone: "slate", test: (h) => h.pulse.week.active === 0 },
        ],
      },
    ],
    device: [
      { key: "model", options: listOf(model) },
      { key: "app", options: listOf((h) => h.license.appVersion ?? "Unknown") },
      { key: "rec", options: bool((h) => h.license.recordingEnabled, "On", "Off", "red") },
      { key: "dialer", options: bool((h) => h.license.googleDialer, "Yes", "No", "slate") },
    ],
  };
  const defs = DEFS[view];
  // A license matches the picked module's filters; `skip` leaves one out, to count its options.
  const matches = (h: FleetLicense, skip?: keyof Filters) =>
    defs.every((d) => d.key === skip || !filters[d.key] || (d.options.find((o) => o.value === filters[d.key])?.test(h) ?? false));
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
  const clearAll = Object.fromEntries(FILTER_KEYS.map((k) => [k, null]));

  const strip = (
    <StatStrip>
      <StatCell
        icon="licenses"
        tone={needs ? "amber" : "green"}
        label="Licenses"
        value={int(sum("active"))}
        sub={`active${purchased !== null ? ` of ${int(purchased)} purchased` : ""}${notSetUp ? ` · ${int(notSetUp)} not set up` : ""}`}
        href={href({ ...clearAll, lm: null, status: null, use: null })}
      />
      <StatCell icon="alert" tone={needs ? "red" : "green"} label="Need action" value={int(needs)} sub="critical or warning health" href={href({ ...clearAll, lm: null, status: "critical", use: null })} />
      <StatCell
        icon="seats"
        tone="green"
        label="In use"
        value={`${int(sum("calling"))} / ${int(sum("active"))}`}
        sub={`calling · ${int(sum("loggedIn"))} logged in`}
        href={href({ ...clearAll, lm: null, use: "calling", status: null })}
      />
      <StatCell
        icon="activity"
        tone={unused ? "amber" : "green"}
        label="Unused"
        value={int(unused)}
        sub={`${int(sum("idle"))} not calling · ${int(sum("loggedOut"))} logged out · ${int(sum("unassigned"))} not assigned`}
        href={href({ ...clearAll, lm: null, use: "unused", status: null })}
      />
    </StatStrip>
  );

  return (
    <>
      <div className="mt-4">{strip}</div>

      <div className="mt-6">
      <MenuLayout
        groups={[
          {
            title: "Module",
            items: VIEWS.map((v) => ({ key: v.id, label: v.label, active: v.id === view, always: true, href: href({ ...clearAll, lm: v.id === "health" ? null : v.id }) })),
          },
          ...defs.map((d) => {
            const pool = licenses.filter((h) => matches(h, d.key));
            return {
              title: FILTERS[d.key],
              items: [
                { key: "all", label: "All", count: pool.length, active: !filters[d.key], always: true, href: href({ [d.key]: null }) },
                ...d.options.map((o) => ({
                  key: o.value,
                  label: o.label,
                  count: pool.filter(o.test).length,
                  tone: o.tone,
                  active: filters[d.key] === o.value,
                  href: href({ [d.key]: filters[d.key] === o.value ? null : o.value }),
                })),
              ],
            };
          }),
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Licenses: {VIEWS.find((v) => v.id === view)!.label}
            <span className="ml-2 text-sm font-normal text-slate-500">{shown.length} shown</span>
          </h2>
        </div>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          Worst first. A seat is unused when it&apos;s not assigned, logged out, or logged in with no call for {durationText(unusedAfterMs)}.
          {hiddenInternal > 0 && !clientId ? ` ${hiddenInternal} internal clients hidden.` : ""}
        </p>
        <Table
          head={[
            "Phone",
            ...(clientId ? [] : ["Client"]),
            ...(view === "health" ? ["Health", "Seat", "Issues"] : []),
            ...(view === "crm" ? ["Calls 24h", "Reached CRM, 24h", "CRM sync, 7 days"] : []),
            ...(view === "device" ? ["Device", "Firmware", "App version", "Google dialer", "Recording on", "Call policy"] : []),
          ]}
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
                {view === "health" && (
                  <>
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
                  </>
                )}
                {view === "crm" && (
                  <>
                    <td className={`${td} text-right tabular-nums`}>
                      {int(h.calls24h)}
                      <p className="text-xs text-slate-400">last {ago(h.lastCallAt, now)}</p>
                    </td>
                    <td className={`${td} text-center`}>
                      {h.pulse.reached.due ? <MetricRing value={h.pulse.reached.delivered} of={h.pulse.reached.due} hue="teal" ofLabel="due calls reached the CRM" /> : <span className="text-slate-400" title="No call was due at a CRM">—</span>}
                    </td>
                    <td className={td}>
                      <SyncCell
                        days={h.pulse.days}
                        week={h.pulse.week}
                        last={h.pulse.lastComplete ? { href: callHref(HEALTH_PATH, h.pulse.lastComplete.callId, undefined, h.license.clientId), label: ago(h.pulse.lastComplete.at, now), title: `${formatTime(h.pulse.lastComplete.at)} IST` } : null}
                      />
                    </td>
                  </>
                )}
                {view === "device" && (
                  <>
                    <td className={`${td} text-xs`}>
                      <Link href={href({ model: model(h) })} className="hover:text-indigo-700 hover:underline">{model(h)}</Link>
                    </td>
                    <td className={`${td} text-xs text-slate-600`}>{h.license.firmware ?? "—"}</td>
                    <td className={`${td} text-xs`}>
                      <Link href={href({ app: h.license.appVersion ?? "Unknown" })} className="hover:text-indigo-700 hover:underline">{h.license.appVersion ?? "—"}</Link>
                    </td>
                    <td className={`${td} text-xs`}>{yesNo(h.license.googleDialer)}</td>
                    <td className={`${td} text-xs ${h.license.recordingEnabled === false ? "font-medium text-red-700" : ""}`}>{yesNo(h.license.recordingEnabled)}</td>
                    <td className={`${td} text-xs text-slate-600`}>{h.license.callPolicy ?? "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>
        {view === "device" && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <GroupPanel title="By device model" rows={group(model)} href={(value) => href({ model: value })} />
            <GroupPanel title="By app version" rows={group((h) => h.license.appVersion ?? "Unknown")} href={(value) => href({ app: value })} />
          </div>
        )}
      </MenuLayout>
      </div>
    </>
  );
}

function GroupPanel({ title, rows, href }: { title: string; rows: [string, { total: number; problems: number }][]; href: (value: string) => string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mb-2 text-sm text-slate-500">Licenses needing action / logged-in licenses</p>
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
    </div>
  );
}
