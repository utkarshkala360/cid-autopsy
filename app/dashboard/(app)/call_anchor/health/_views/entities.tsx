import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { RangeLink } from "../RangeLink";
import {
  WINDOW_DAYS,
  loadEntities,
  warmEntities,
  type ClientEntity,
  type DeviceEntity,
  type Drill,
  type IssueEntity,
  type LastThrough,
  type Level,
  type LicenseEntity,
  type Needs,
  type RangeStats,
  type StripCell,
  type WindowDays,
} from "@/lib/callanchor/health";
import { MODULES, RULES, issueModule, type CallStage, type IssueModule, type SeatState } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { DAY_STATES, ISSUE_LEVELS, LEVELS, TRENDS, ago, callHref, clientHref, formatTime, int, issueHref, itemsHref, licenseHref, severityTone, type Tone } from "../format";
import { MenuLayout, type MenuGroup } from "../FilterMenu";
import { Hero, MetricRing, PctRing, signalHue, type HeroKpi, type IconName } from "../ui";
import { JourneyDots, LoadingNote, Section, Table, issueLinks, rowLinkClass, td } from "../parts";

// One view, the entity changing (owner, 2026-11-13): Issues, Clients, Licenses and Devices each list
// one row per entity with the same core columns: Health as a chip on the name (its level on hover),
// the call journey and CRM syncs over the picked range, and what needs action now. A client's own
// tabs show the same tables scoped to it, so a license row looks the same everywhere.

export type Entity = "issues" | "clients" | "licenses" | "devices";
type Query = Record<string, string | string[] | undefined>;
type Href = (changes: Record<string, string | null>) => string;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const rangeOf = (query: Query): WindowDays => WINDOW_DAYS.find((d) => String(d) === one(query.range)) ?? 1;
export const rangeLabel = (days: number) => (days === 1 ? "24 hours" : `${days} days`);
const CELL_WORD: Record<WindowDays, [string, string]> = { 1: ["hour", "hours"], 3: ["6-hour block", "6-hour blocks"], 7: ["day", "days"], 15: ["day", "days"] };

// Links that change some of the page's query and keep the rest.
export function queryHref(path: string, query: Query): Href {
  return (changes) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (typeof value === "string" && value.length <= 300) next.set(key, value);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `${path}${next.size ? `?${next}` : ""}`;
  };
}

// ---- Filters: groups of options in the left menu, each counted against the other picks ----

type Option<T> = { value: string; label: string; tone?: Tone; test: (row: T) => boolean };
type FilterDef<T> = { key: string; title: string; options: Option<T>[]; fallback?: string };

// Every group is multi-select (owner, 2026-11-13): a row matches a group when it passes any of its
// picked options, and every group's picks must hold. `?key=a,b` holds the picks; without the key a
// group uses its fallback, and `?key=all` picks nothing (all rows).
function applyFilters<T>(rows: T[], defs: FilterDef<T>[], query: Query, href: Href) {
  const pickedOf = (d: FilterDef<T>) => {
    const raw = one(query[d.key]) ?? d.fallback ?? "";
    return new Set(raw.split(",").filter((v) => d.options.some((o) => o.value === v)));
  };
  const picks = new Map(defs.map((d) => [d.key, pickedOf(d)]));
  const matches = (row: T, skip?: string) =>
    defs.every((d) => {
      const set = picks.get(d.key)!;
      return d.key === skip || set.size === 0 || d.options.some((o) => set.has(o.value) && o.test(row));
    });
  // The query value for a set of picks: none when it equals the fallback, "all" when empty but the
  // group has a fallback.
  const value = (d: FilterDef<T>, set: Set<string>) => {
    const list = d.options.map((o) => o.value).filter((v) => set.has(v));
    if (d.fallback && list.length === 1 && list[0] === d.fallback) return null;
    if (list.length === 0) return d.fallback ? "all" : null;
    return list.join(",");
  };
  const groups: MenuGroup[] = defs.map((d) => {
    const set = picks.get(d.key)!;
    const pool = rows.filter((r) => matches(r, d.key));
    return {
      title: d.title,
      items: [
        { key: "all", label: "All", count: pool.length, active: set.size === 0, always: true, href: href({ [d.key]: value(d, new Set()), page: null }) },
        ...d.options.map((o) => {
          const next = new Set(set);
          if (next.has(o.value)) next.delete(o.value);
          else next.add(o.value);
          return { key: o.value, label: o.label, count: pool.filter(o.test).length, tone: o.tone, active: set.has(o.value), href: href({ [d.key]: value(d, next), page: null }) };
        }),
      ],
    };
  });
  return { shown: rows.filter((r) => matches(r)), groups };
}

const RANK: Record<Level, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3, idle: 4 };
// Severity first; within it, the calls surely lost lead, so a big clear loss tops a tiny sample at the
// same level (owner, 2026-11-13: tier then size).
export const worstFirst = <T extends { level: Level; needs: Needs; stats: RangeStats }>(a: T, b: T) =>
  RANK[a.level] - RANK[b.level] ||
  b.stats.sureLost - a.stats.sureLost ||
  b.stats.broke - a.stats.broke ||
  b.needs.critical - a.needs.critical ||
  b.needs.warning - a.needs.warning ||
  b.stats.calls - a.stats.calls;

const levelOptions = <T extends { level: Level }>(levels: Level[]): Option<T>[] =>
  levels.map((l) => ({ value: l, label: LEVELS[l].label, tone: severityTone(l), test: (r: T) => r.level === l }));

// ---- Shared cells ----

// Health as an icon chip merged with the name; its level and why on hover.
function HealthChip({ icon, className, note }: { icon: string; className: string; note: string }) {
  return (
    <span title={note} className={`mt-0.5 inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-[11px] font-bold ring-1 ${className}`}>
      <span aria-hidden>{icon}</span>
      <span className="sr-only">{note}</span>
    </span>
  );
}

function NameCell({ chip, href, label, sub, mono = false }: { chip: { icon: string; className: string; note: string }; href: string; label: React.ReactNode; sub?: React.ReactNode; mono?: boolean }) {
  return (
    <td className="px-3 py-2 align-top">
      <div className="flex items-start gap-2">
        <HealthChip {...chip} />
        <div className="min-w-0">
          <Link href={href} className={`${rowLinkClass} ${mono ? "font-mono text-xs" : ""}`}>{label}</Link>
          {sub && <div className="text-xs text-slate-500">{sub}</div>}
        </div>
      </div>
    </td>
  );
}

const levelChip = (level: Level, note: string) => ({ icon: LEVELS[level].icon, className: LEVELS[level].className, note });

// The range's sync as a strip: one cell per hour (24 hours), 6 hours (3 days) or day (7, 15 days).
function Strip({ cells }: { cells: StripCell[] }) {
  const narrow = cells.length > 15;
  return (
    <ol className="flex gap-px" aria-label="CRM sync over the range, oldest first">
      {cells.map((c) => {
        const state = DAY_STATES[c.state];
        const rate = c.due ? Math.round((c.delivered / c.due) * 100) : null;
        const title = `${formatTime(c.start)} – ${formatTime(c.end)} IST: ${c.calls === 0 ? "no calls" : state.label}${c.calls ? ` · ${int(c.calls)} calls, ${int(c.delivered)} of ${int(c.due)} due reached the CRM${rate !== null ? ` (${rate}%)` : ""}` : ""}`;
        return (
          <li key={c.start} title={title} className={`flex h-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold ${narrow ? "w-2" : "w-4"} ${state.className}`}>
            {!narrow && <span aria-hidden>{state.icon}</span>}
            <span className="sr-only">{title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CrmCell({ stats, lastThrough, days, now, ringHref }: { stats: RangeStats; lastThrough: LastThrough; days: WindowDays; now: number; ringHref?: string }) {
  const [word, words] = CELL_WORD[days];
  return (
    <td className="px-3 py-2 align-top">
      <div className="flex items-start gap-3">
        <div className="w-10 shrink-0 text-center">
          {stats.reached.due ? (
            <MetricRing value={stats.reached.delivered} of={stats.reached.due} hue={signalHue(stats.reached.delivered, stats.reached.due, "high", { ok: RULES.warningSuccessRate, bad: RULES.criticalSuccessRate })} ofLabel="due calls reached the CRM" href={ringHref} />
          ) : (
            <span className="text-slate-400" title="No call was due at a CRM in this range">—</span>
          )}
        </div>
        <div className="min-w-0">
          <Strip cells={stats.strip} />
          <p className="mt-1 whitespace-nowrap text-xs text-slate-500">{stats.active ? `${stats.synced} of ${stats.active} ${stats.active === 1 ? word : words} synced` : "no due calls"}</p>
          <p className="whitespace-nowrap text-xs text-slate-500">
            last through{" "}
            {lastThrough ? (
              <Link href={callHref(HEALTH_PATH, lastThrough.callId, undefined, lastThrough.clientId)} className={rowLinkClass} title={`${formatTime(lastThrough.at)} IST`}>
                {ago(lastThrough.at, now)}
              </Link>
            ) : (
              <span className="font-medium text-amber-800">never</span>
            )}
          </p>
        </div>
      </div>
    </td>
  );
}

function JourneyCell({ stats, href }: { stats: RangeStats; href: (stage: CallStage) => string }) {
  return (
    <td className="px-3 py-2 align-top">
      <JourneyDots journey={stats.journey} href={href} />
    </td>
  );
}

function NeedsCell({ needs, href }: { needs: Needs; href: string }) {
  if (!needs.critical && !needs.warning) return <td className={`${td} text-slate-400`}>—</td>;
  return (
    <td className="min-w-48 max-w-72 px-3 py-2 align-top text-xs">
      <Link href={href} className="inline-flex gap-1.5 rounded px-1 font-medium ring-1 ring-transparent hover:bg-indigo-50 hover:ring-indigo-200">
        {needs.critical > 0 && <span className="text-red-700">{needs.critical} critical</span>}
        {needs.warning > 0 && <span className="text-amber-800">{needs.warning} warning</span>}
      </Link>
      {needs.calls > 0 ? (
        <p className="mt-0.5 flex items-center gap-1 text-slate-800">
          <span className="font-medium">{int(needs.calls)} {needs.calls === 1 ? "call" : "calls"} not in the CRM</span>
          {needs.top && (
            <span
              title={`${int(needs.calls)} ${needs.calls === 1 ? "call" : "calls"} not in the CRM · ${needs.top}`}
              aria-label={`Worst issue: ${needs.top}`}
              className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700 ring-1 ring-red-200"
            >
              i
            </span>
          )}
        </p>
      ) : (
        needs.top && <p className="mt-0.5 truncate text-slate-600" title={needs.top}>{needs.top}</p>
      )}
    </td>
  );
}

// Fewer calls than this and a share is shown as "few calls": it can swing on one call.
const FEW_CALLS = 20;

// Impact (owner, 2026-11-13): the calls surely lost in the range, then how many broke of how many.
function ImpactCell({ stats, days }: { stats: RangeStats; days: WindowDays }) {
  if (stats.broke === 0) return <td className={`${td} text-right text-xs text-slate-400`}>none lost</td>;
  const pctBroke = Math.round((stats.broke / stats.calls) * 1000) / 10;
  const few = stats.calls < FEW_CALLS;
  const tip = `${int(stats.broke)} of ${int(stats.calls)} calls in the last ${rangeLabel(days)} stopped on their way (recording not uploaded, not sent, or not accepted by the CRM). With this many calls, at least ${int(stats.sureLost)} of them point to a real problem rather than chance${few ? `. Under ${FEW_CALLS} calls, one call swings the share a lot` : ""}.`;
  return (
    <td className={`${td} text-right`}>
      <span title={tip} className={`font-semibold tabular-nums ${stats.sureLost >= 5 ? "text-red-700" : stats.sureLost > 0 ? "text-amber-800" : "text-slate-600"}`}>
        ≈ {int(stats.sureLost)} lost
      </span>
      <p className="text-xs tabular-nums text-slate-500">
        {int(stats.broke)} of {int(stats.calls)} · {pctBroke}%
      </p>
      {few && <p className="text-xs text-slate-400">few calls</p>}
    </td>
  );
}

const IMPACT_HEAD = (days: WindowDays) => ({
  label: "Impact",
  info: `Calls lost in the last ${rangeLabel(days)}, allowing for chance: 1 broken call in 10 counts for almost nothing, 10 in 100 for about 5. Rows sort by health, then by this`,
});

// Calls in the range, under the row's name (owner, 2026-11-13): "39 calls in 24 hours · last 1 h ago".
function CallsLine({ stats, lastCallAt, now, href, days }: { stats: RangeStats; lastCallAt: string | null; now: number; href: string; days: WindowDays }) {
  return (
    <p className="whitespace-nowrap">
      {stats.calls ? (
        <Link href={href} className="rounded font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-800">{int(stats.calls)} call{stats.calls === 1 ? "" : "s"}</Link>
      ) : (
        "No calls"
      )}{" "}
      in {rangeLabel(days)}
      {lastCallAt && <span className="text-slate-400"> · last {ago(lastCallAt, now)}</span>}
    </p>
  );
}

// Seats out of purchased (owner, 2026-11-13): Active, Logged in, Calling and Unused, each a ring with
// its share inside. Without a purchased count (snapshots before 5 Nov) they're out of active.
function SeatsCell({ seats, root }: { seats: ClientEntity["seats"]; root: string }) {
  const base = seats.purchased ?? seats.active;
  const unused = seats.idle + seats.loggedOut + seats.unassigned;
  const loggedIn = seats.loggedIn;
  return (
    <td className="px-3 py-2 align-top">
      <div className="flex gap-1.5">
        <PctRing
          value={seats.active}
          of={base}
          hue={signalHue(seats.active, base, "high")}
          label="Active"
          href={`${root}/licenses`}
          title={
            seats.purchased === null
              ? `${seats.active} active; purchased isn't known for this client, so the rings are out of active`
              : `${seats.active} of ${seats.purchased} purchased are active${seats.purchased > seats.active ? `, ${seats.purchased - seats.active} not set up` : ""}`
          }
        />
        <PctRing value={loggedIn} of={base} hue={signalHue(loggedIn, base, "high")} label="Logged in" href={`${root}/licenses?use=calling,idle`} />
        <PctRing value={seats.calling} of={base} hue={signalHue(seats.calling, base, "high")} label="Calling" href={`${root}/licenses?use=calling`} />
        <PctRing value={unused} of={base} hue={signalHue(unused, base, "low")} label="Unused" href={`${root}/licenses?use=unused`} title={`${unused} unused of ${base}: ${seats.idle} logged in but not calling, ${seats.loggedOut} logged out, ${seats.unassigned} not assigned`} />
      </div>
    </td>
  );
}

const CORE_HEAD = (days: WindowDays) => [
  { label: "Call journey", info: `Phone → app → recording uploaded → sent to the CRM → accepted, for calls in the last ${rangeLabel(days)}. A red dot is a step where calls stopped, with how many` },
  { label: "CRM syncs", info: `The ring: due calls in the last ${rangeLabel(days)} that the CRM accepted (2xx), of all due. The strip: each ${CELL_WORD[days][0]}, synced when ${"≥"} the synced-day rate in Settings reached it. Then when a call last went all the way through` },
  { label: "Needs action", info: "Open issues right now, critical and warning. Counts issues, not calls: one issue covers every call it affects. Under it, the calls not in the CRM across those issues, each counted once, back 15 days, and the worst issue. Opens them in the Issues tab" },
];

// ---- The range picker and search, above every table ----

export function RangePicker({ days, href }: { days: WindowDays; href: Href }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Range</span>
      {WINDOW_DAYS.map((d) => (
        <RangeLink key={d} href={href({ range: d === 1 ? null : String(d), page: null })} active={d === days}>
          {rangeLabel(d)}
        </RangeLink>
      ))}
    </div>
  );
}

// The other ranges are computed once the page is sent, so switching range is usually instant: each
// is kept in server memory and refreshed in the background (`cached` in lib/callanchor/health.ts).
export function warmRanges(show: boolean) {
  after(() => warmEntities(show));
}

function SearchBox({ path, query, placeholder }: { path: string; query: Query; placeholder: string }) {
  return (
    <form action={path} className="ml-auto w-80 max-w-full" role="search">
      {Object.entries(query).map(([key, value]) => (key === "q" || typeof value !== "string" ? null : <input key={key} type="hidden" name={key} value={value} />))}
      <input type="search" name="q" defaultValue={one(query.q) ?? ""} placeholder={placeholder} aria-label={placeholder} className={`${inputClass} w-80 max-w-full py-1.5`} />
    </form>
  );
}

// ---- Rows per entity ----

type Ctx = { now: number; days: WindowDays; scoped: boolean };
const callsDrill = (stage: CallStage, extra: Record<string, string> = {}): Drill => ({ kind: "calls", stage, ...extra });

export function IssueRows({ rows, ctx }: { rows: IssueEntity[]; ctx: Ctx }) {
  const { now, days, scoped } = ctx;
  return (
    <Table head={["Issue", ...(scoped ? [] : ["Client"]), "Phone · agent", "Status", { label: "Impact", info: "Calls this issue affects. Issues sort by severity, then by this" }, ...CORE_HEAD(days)]} empty={rows.length ? undefined : "No issues match."}>
      {rows.map((r) => {
        const { issue } = r;
        const level = ISSUE_LEVELS[issue.level];
        const links = issueLinks(HEALTH_PATH, issue);
        const scope: Record<string, string> = issue.licenseId ? { license: issue.licenseId } : {};
        const items = (stage: CallStage) => itemsHref(HEALTH_PATH, callsDrill(stage, scope), { client: issue.clientId ?? undefined, window: days });
        return (
          <tr key={issue.id} className="hover:bg-slate-50">
            <NameCell
              chip={{ icon: level.icon, className: level.className, note: `${level.label}${r.rolledUp ? ", raised once at client level" : ""}` }}
              href={issueHref(HEALTH_PATH, issue.id, issue.clientId)}
              label={issue.title}
              sub={
                <>
                  {MODULES[issueModule(issue.kind)].label}
                  {issue.scope === "fleet" ? " · fleet-wide" : ""}
                  {r.rolledUp ? " · shared by the client's phones" : ""}
                  {issue.newSinceVisit && <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800">New</span>}
                </>
              }
            />
            {!scoped && (
              <td className={td}>
                {issue.clientId ? <Link href={`${clientHref(HEALTH_PATH, issue.clientId)}/issues`} className={rowLinkClass}>{r.clientName ?? "Client"}</Link> : <span className="text-slate-400">All clients</span>}
              </td>
            )}
            <td className={`${td} text-xs`}>
              {issue.licenseId ? (
                <>
                  <Link href={licenseHref(HEALTH_PATH, issue.licenseId, issue.clientId)} className={`${rowLinkClass} font-mono`}>{r.phone}</Link>
                  {r.agentName && <p className="text-slate-500">{r.agentName}</p>}
                  <p className="text-slate-400">{r.device}</p>
                </>
              ) : (
                <span className="text-slate-400">{issue.scope === "client" ? "client-wide" : "—"}</span>
              )}
            </td>
            <td className={`${td} text-xs text-slate-600`}>
              {TRENDS[issue.trend]}
              {issue.firstAt && <p className="text-slate-500" title={`${formatTime(issue.firstAt)} IST`}>since {ago(issue.firstAt, now)}</p>}
            </td>
            <td className="min-w-40 max-w-56 px-3 py-2 align-top text-right">
              {issue.impact > 0 ? <span className="font-semibold tabular-nums text-slate-900">{int(issue.impact)} calls</span> : <span className="text-slate-400">—</span>}
              {issue.impactText && <p className="text-xs text-slate-500">{issue.impactText}</p>}
            </td>
            <JourneyCell stats={r.stats} href={items} />
            <CrmCell stats={r.stats} lastThrough={r.lastThrough} days={days} now={now} ringHref={items("notReached")} />
            <td className={td}>
              <Link href={links.primary} className={secondaryButtonClass}>{links.rows ? "Open items" : "Details"}</Link>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

export function ClientRows({ rows, ctx }: { rows: ClientEntity[]; ctx: Ctx }) {
  const { now, days } = ctx;
  return (
    <Table head={["Client", { label: "Licenses", info: "Out of the licenses purchased: how many are active, logged in, calling (a call within the unused threshold in Settings) and unused (not assigned, logged out, or logged in without calling). Each opens those licenses" }, IMPACT_HEAD(days), ...CORE_HEAD(days)]} empty={rows.length ? undefined : "No clients match."}>
      {rows.map((r) => {
        const root = clientHref(HEALTH_PATH, r.clientId);
        const items = (stage: CallStage) => itemsHref(HEALTH_PATH, callsDrill(stage), { client: r.clientId, window: days });
        return (
          <tr key={r.clientId} className="hover:bg-slate-50">
            <NameCell
              chip={levelChip(r.level, r.levelNote)}
              href={root}
              label={r.name}
              sub={
                <>
                  {r.internal && <span className="font-medium text-slate-700">internal · </span>}
                  {r.status}
                  {r.integrations.length ? ` · ${r.integrations.join(", ")}` : " · no integration"}
                  <CallsLine stats={r.stats} lastCallAt={r.stats.lastCallAt} now={now} href={items("all")} days={days} />
                  {r.error && <p className="text-red-700">{r.error}</p>}
                </>
              }
            />
            <SeatsCell seats={r.seats} root={root} />
            <ImpactCell stats={r.stats} days={days} />
            <JourneyCell stats={r.stats} href={items} />
            <CrmCell stats={r.stats} lastThrough={r.lastThrough} days={days} now={now} ringHref={items("notReached")} />
            <NeedsCell needs={r.needs} href={`${root}/issues`} />
          </tr>
        );
      })}
    </Table>
  );
}

const SEAT_STATES: Record<SeatState, { label: string; tone: Tone }> = {
  calling: { label: "Calling", tone: "green" },
  idle: { label: "Logged in, not calling", tone: "amber" },
  loggedOut: { label: "Logged out", tone: "amber" },
  unassigned: { label: "Not assigned", tone: "amber" },
  inactive: { label: "Inactive", tone: "slate" },
};
const SEAT_TEXT: Record<Tone, string> = { green: "text-emerald-700", amber: "font-medium text-amber-800", slate: "text-slate-400", red: "text-red-700", sky: "text-sky-800" };

export function LicenseRows({ rows, ctx }: { rows: LicenseEntity[]; ctx: Ctx }) {
  const { now, days, scoped } = ctx;
  return (
    <Table head={["Phone · agent", ...(scoped ? [] : ["Client"]), "Seat", "Device", IMPACT_HEAD(days), ...CORE_HEAD(days)]} empty={rows.length ? undefined : "No licenses match."}>
      {rows.map((r) => {
        const seat = SEAT_STATES[r.seat.state];
        const items = (stage: CallStage) => itemsHref(HEALTH_PATH, callsDrill(stage, { license: r.licenseId }), { client: r.clientId, window: days });
        return (
          <tr key={r.licenseId} className="hover:bg-slate-50">
            <NameCell
              chip={levelChip(r.level, r.levelNote)}
              href={licenseHref(HEALTH_PATH, r.licenseId, r.clientId)}
              label={<span className="whitespace-nowrap font-mono text-xs">{r.phone}</span>}
              sub={
                <>
                  <p className="whitespace-nowrap">{r.agentName ?? (r.seat.state === "unassigned" ? "Unassigned" : null)}</p>
                  <CallsLine stats={r.stats} lastCallAt={r.lastCallAt} now={now} href={items("all")} days={days} />
                  {r.learning && <NewPhone learning={r.learning} />}
                </>
              }
            />
            {!scoped && (
              <td className={td}>
                <Link href={`${clientHref(HEALTH_PATH, r.clientId)}/licenses`} className={rowLinkClass}>{r.clientName}</Link>
              </td>
            )}
            <td className={`${td} text-xs`}>
              <span className={SEAT_TEXT[seat.tone]}>{seat.label}</span>
              {r.seat.since && <p className="text-slate-500" title={`${formatTime(r.seat.since)} IST`}>since {ago(r.seat.since, now)}</p>}
            </td>
            <td className={`${td} text-xs text-slate-600`}>
              {r.device}
              <p className="text-slate-400">
                {r.appVersion ? `app ${r.appVersion}` : "app —"}
                {r.recordingEnabled === false && <span className="font-medium text-red-700"> · recording off</span>}
              </p>
            </td>
            <ImpactCell stats={r.stats} days={days} />
            <JourneyCell stats={r.stats} href={items} />
            <CrmCell stats={r.stats} lastThrough={r.lastThrough} days={days} now={now} ringHref={items("notReached")} />
            <NeedsCell needs={r.needs} href={`${scoped ? `${clientHref(HEALTH_PATH, r.clientId)}/issues` : `${HEALTH_PATH}/issues`}?license=${encodeURIComponent(r.licenseId)}`} />
          </tr>
        );
      })}
    </Table>
  );
}

// A phone too new to compare with its own usual day, in plain words: when that check starts and why
// it waits (owner, 2026-11-13: "learning its usual calls" was unclear; no week-long wait).
function NewPhone({ learning }: { learning: NonNullable<LicenseEntity["learning"]> }) {
  const why = learning.newAgent ? "New agent" : "New phone";
  const when = learning.since ? ` on ${formatTime(learning.since)} IST` : "";
  const ready = learning.readyAt ? ` from ${formatTime(learning.readyAt)} IST` : " after its first full day";
  const tip = learning.newAgent
    ? `This phone got a new agent${when}. Once they have a full day of calls we can warn you if they stop making calls${ready}. Everything else is checked as normal.`
    : `We started tracking this phone${when}. Once it has a full day of calls we can warn you if it stops making calls${ready}. Everything else is checked as normal.`;
  return (
    <span title={tip} className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
      {why} · first day
    </span>
  );
}

const topText = (values: [string, number][]) => values.slice(0, 2).map(([v, n]) => `${v} (${n})`).join(", ") + (values.length > 2 ? ` +${values.length - 2}` : "");

export function DeviceRows({ rows, ctx, clientId }: { rows: DeviceEntity[]; ctx: Ctx; clientId: string | null }) {
  const { now, days } = ctx;
  const base = clientId ? clientHref(HEALTH_PATH, clientId) : HEALTH_PATH;
  return (
    <Table head={["Device", "Licenses", "App version", "Firmware", IMPACT_HEAD(days), ...CORE_HEAD(days)]} empty={rows.length ? undefined : "No devices match."}>
      {rows.map((r) => {
        const device = encodeURIComponent(r.device);
        // The items page takes up to 2,000 characters of license ids; past that it opens the licenses.
        const ids = r.licenseIds.join(",");
        const items = (stage: CallStage) =>
          ids.length <= 2000 ? itemsHref(HEALTH_PATH, callsDrill(stage, { licenses: ids }), { client: clientId ?? undefined, window: days }) : `${base}/licenses?device=${device}`;
        const bad = r.statuses.critical + r.statuses.warning;
        return (
          <tr key={r.device} className="hover:bg-slate-50">
            <NameCell
              chip={levelChip(r.level, r.levelNote)}
              href={`${base}/licenses?device=${device}`}
              label={r.device}
              sub={
                <>
                  {!clientId && <p>{`${r.clientIds.length} client${r.clientIds.length === 1 ? "" : "s"}`}</p>}
                  <CallsLine stats={r.stats} lastCallAt={r.stats.lastCallAt} now={now} href={items("all")} days={days} />
                </>
              }
            />
            <td className={`${td} tabular-nums`}>
              <Link href={`${base}/licenses?device=${device}`} className="rounded px-1 font-medium text-slate-900 hover:bg-indigo-50">{int(r.licenseIds.length)}</Link>
              <p className="text-xs">
                {bad ? (
                  <>
                    {r.statuses.critical > 0 && <span className="text-red-700">{r.statuses.critical} critical </span>}
                    {r.statuses.warning > 0 && <span className="text-amber-800">{r.statuses.warning} warning</span>}
                  </>
                ) : (
                  <span className="text-slate-400">none need action</span>
                )}
              </p>
              {r.recordingOff > 0 && <p className="text-xs font-medium text-red-700">{r.recordingOff} recording off</p>}
            </td>
            <td className="max-w-48 px-3 py-2 align-top text-xs text-slate-600">{topText(r.appVersions)}</td>
            <td className="max-w-48 px-3 py-2 align-top text-xs text-slate-600">{topText(r.firmware)}</td>
            <ImpactCell stats={r.stats} days={days} />
            <JourneyCell stats={r.stats} href={items} />
            <CrmCell stats={r.stats} lastThrough={r.lastThrough} days={days} now={now} ringHref={items("notReached")} />
            <NeedsCell needs={r.needs} href={`${base}/issues?device=${device}`} />
          </tr>
        );
      })}
    </Table>
  );
}

// ---- A tab: the hero (fleet only), the left menu of filters, the range and search, the table ----

const TITLES: Record<Entity, { title: string; icon: IconName; meta: string; search: string }> = {
  issues: { title: "Issues", icon: "alert", meta: "One row per issue or error, worst first.", search: "Find an issue or client" },
  clients: { title: "Clients", icon: "building", meta: "One row per client.", search: "Find a client" },
  licenses: { title: "Licenses", icon: "licenses", meta: "One row per license (seat), across clients.", search: "Find a phone, agent, client or device" },
  devices: { title: "Devices", icon: "device", meta: "One row per device model (brand + model), across clients. CallAnchor gives no device id, so licenses that haven't reported a model share Unknown.", search: "Find a device" },
};
const MODULE_IDS = Object.keys(MODULES) as IssueModule[];
const USES = ["unused", "calling", "idle", "loggedOut", "unassigned", "inactive"] as const;
const UNUSED: SeatState[] = ["idle", "loggedOut", "unassigned"];
const PAGE = 100;

export function EntityTab({ entity, query, clientId }: { entity: Entity; query: Query; clientId: string | null }) {
  const days = rangeOf(query);
  return (
    <Suspense key={entity} fallback={<LoadingNote text="Reading the stored data for this range…" expectMs={15000} />}>
      <EntityBody entity={entity} query={query} clientId={clientId} days={days} />
    </Suspense>
  );
}

async function EntityBody({ entity, query, clientId, days }: { entity: Entity; query: Query; clientId: string | null; days: WindowDays }) {
  const path = clientId ? `${clientHref(HEALTH_PATH, clientId)}/${entity}` : `${HEALTH_PATH}/${entity}`;
  await requireCallAnchorSession(path);
  // A client opened by id shows even when it's internal.
  const show = clientId ? true : await showInternal();
  const data = await loadEntities(show, days);
  warmRanges(show);
  const now = Date.parse(data.loadedAt);
  const href = queryHref(path, query);
  const ctx: Ctx = { now, days, scoped: clientId !== null };
  const q = (one(query.q) ?? "").trim().toLowerCase();
  const found = (...texts: (string | null | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));
  const page = Math.max(1, Number(one(query.page)) || 1);
  const own = <T extends { clientId?: string | null }>(rows: T[]) => (clientId ? rows.filter((r) => r.clientId === clientId) : rows);

  let groups: MenuGroup[] = [];
  let table: React.ReactNode = null;
  let total = 0;
  let kpis: HeroKpi[] = [];
  let picked: { label: string; clear: string } | null = null;
  const paged = <T,>(rows: T[]) => rows.slice((page - 1) * PAGE, page * PAGE);

  if (entity === "issues") {
    const license = one(query.license);
    const device = one(query.device);
    let rows = clientId ? data.issues.filter((r) => r.issue.clientId === clientId) : data.issues;
    if (license) {
      rows = rows.filter((r) => r.issue.licenseId === license);
      const l = data.licenses.find((x) => x.licenseId === license);
      picked = { label: `Phone ${l?.phone ?? license}`, clear: href({ license: null, page: null }) };
    } else if (device) {
      rows = rows.filter((r) => r.device === device);
      picked = { label: device, clear: href({ device: null, page: null }) };
    } else rows = rows.filter((r) => !r.rolledUp);
    const filters = applyFilters(
      rows.filter((r) => found(r.issue.title, r.clientName, r.phone, r.agentName, r.device)),
      [
        {
          key: "health",
          title: "Health",
          fallback: "open",
          options: [
            { value: "open", label: "Needs action", tone: "amber", test: (r) => r.issue.level !== "info" },
            { value: "critical", label: "Critical", tone: "red", test: (r) => r.issue.level === "critical" },
            { value: "warning", label: "Warning", tone: "amber", test: (r) => r.issue.level === "warning" },
            { value: "info", label: "Info", tone: "sky", test: (r) => r.issue.level === "info" },
          ],
        },
        { key: "module", title: "Module", options: MODULE_IDS.map((m) => ({ value: m, label: MODULES[m].label, test: (r: IssueEntity) => issueModule(r.issue.kind) === m })) },
        {
          key: "scope",
          title: "Raised for",
          options: [
            { value: "fleet", label: "All clients", test: (r) => r.issue.scope === "fleet" },
            { value: "client", label: "A client", test: (r) => r.issue.scope === "client" },
            { value: "license", label: "A license", test: (r) => r.issue.scope === "license" },
          ],
        },
      ],
      query,
      href,
    );
    groups = filters.groups;
    total = filters.shown.length;
    table = <IssueRows rows={paged(filters.shown)} ctx={ctx} />;
    const open = rows.filter((r) => r.issue.level !== "info");
    kpis = [
      { label: "Need action", value: int(open.length), note: `${open.filter((r) => r.issue.level === "critical").length} critical` },
      { label: "New since your visit", value: int(open.filter((r) => r.issue.newSinceVisit).length) },
    ];
  } else if (entity === "clients") {
    const rows = own(data.clients).filter((r) => found(r.name, r.integrations.join(" ")));
    const filters = applyFilters(
      rows,
      [
        { key: "health", title: "Health", options: levelOptions<ClientEntity>(["critical", "warning", "healthy", "idle", "unknown"]) },
        {
          key: "status",
          title: "Status",
          fallback: "active",
          options: [
            { value: "active", label: "Working", tone: "green", test: (r) => r.status !== "inactive" },
            { value: "inactive", label: "Inactive", tone: "slate", test: (r) => r.status === "inactive" },
          ],
        },
        {
          key: "crm",
          title: "CRM integration",
          options: [
            { value: "on", label: "Has one", tone: "green", test: (r) => r.integrations.length > 0 },
            { value: "none", label: "None", tone: "slate", test: (r) => r.integrations.length === 0 },
          ],
        },
      ],
      query,
      href,
    );
    groups = filters.groups;
    const shown = filters.shown.sort(worstFirst);
    total = shown.length;
    table = <ClientRows rows={paged(shown)} ctx={ctx} />;
    const working = data.clients.filter((c) => c.status !== "inactive");
    const due = working.reduce((t, c) => t + c.stats.reached.due, 0);
    const reached = working.reduce((t, c) => t + c.stats.reached.delivered, 0);
    kpis = [
      { label: "Clients", value: int(working.length), note: `${data.clients.length - working.length} inactive${data.hiddenInternal ? ` · ${data.hiddenInternal} internal hidden` : ""}` },
      { label: `Reached CRM, ${rangeLabel(days)}`, value: due ? `${Math.round((reached / due) * 1000) / 10}%` : "—", bar: due ? (reached / due) * 100 : null, note: `${int(reached)} of ${int(due)} due` },
    ];
  } else if (entity === "licenses") {
    const all = own(data.licenses);
    const rows = all.filter((r) => found(r.phone, r.agentName, r.clientName, r.device, r.appVersion));
    const devices = [...new Set(all.map((r) => r.device))].sort((a, b) => all.filter((r) => r.device === b).length - all.filter((r) => r.device === a).length);
    const filters = applyFilters(
      rows,
      [
        { key: "health", title: "Health", options: levelOptions<LicenseEntity>(["critical", "warning", "healthy", "idle"]) },
        {
          key: "use",
          title: "Seat",
          options: USES.map((u) => ({
            value: u,
            label: u === "unused" ? "Unused" : SEAT_STATES[u].label,
            tone: u === "unused" ? "amber" : SEAT_STATES[u].tone,
            test: (r: LicenseEntity) => (u === "unused" ? UNUSED.includes(r.seat.state) : r.seat.state === u),
          })),
        },
        {
          key: "calls",
          title: `Calls, ${rangeLabel(days)}`,
          options: [
            { value: "yes", label: "Made calls", tone: "green", test: (r) => r.stats.calls > 0 },
            { value: "none", label: "No calls", tone: "slate", test: (r) => r.stats.calls === 0 },
          ],
        },
        { key: "device", title: "Device", options: devices.map((d) => ({ value: d, label: d, test: (r: LicenseEntity) => r.device === d })) },
      ],
      query,
      href,
    );
    groups = filters.groups;
    const shown = filters.shown.sort(worstFirst);
    total = shown.length;
    table = <LicenseRows rows={paged(shown)} ctx={ctx} />;
    const calling = all.filter((r) => r.seat.state === "calling").length;
    kpis = [
      { label: "Licenses", value: int(all.length), note: `${all.filter((r) => r.level === "critical" || r.level === "warning").length} need action` },
      { label: "Calling", value: int(calling), note: `${all.filter((r) => UNUSED.includes(r.seat.state)).length} unused` },
    ];
  } else {
    // Devices: in a client, its own licenses grouped by model.
    const rows = (clientId ? (data.clientDevices[clientId] ?? []) : data.devices).filter((r) => found(r.device, ...r.appVersions.map(([v]) => v)));
    const filters = applyFilters(
      rows,
      [
        { key: "health", title: "Health", options: levelOptions<DeviceEntity>(["critical", "warning", "healthy", "idle"]) },
        {
          key: "rec",
          title: "Recording",
          options: [
            { value: "off", label: "Off on some", tone: "red", test: (r) => r.recordingOff > 0 },
            { value: "on", label: "On everywhere", tone: "green", test: (r) => r.recordingOff === 0 },
          ],
        },
      ],
      query,
      href,
    );
    groups = filters.groups;
    const shown = filters.shown.sort(worstFirst);
    total = shown.length;
    table = <DeviceRows rows={paged(shown)} ctx={ctx} clientId={clientId} />;
    const known = data.devices.filter((d) => d.device !== "Unknown");
    kpis = [
      { label: "Device models", value: int(known.length), note: `${data.devices.filter((d) => d.level === "critical" || d.level === "warning").length} with licenses needing action` },
      { label: "Licenses without a model", value: int(data.devices.find((d) => d.device === "Unknown")?.licenseIds.length ?? 0), note: `of ${int(data.licenses.length)}` },
    ];
  }

  const t = TITLES[entity];
  const pages = Math.ceil(total / PAGE);
  return (
    <>
      {!clientId && <Hero eyebrow={{ icon: t.icon, label: "Client health" }} title={t.title} meta={`${t.meta} Health and Needs action are right now; Call journey and CRM syncs cover the picked range.`} kpis={kpis} />}
      <div className={clientId ? "" : "mt-6"}>
        <MenuLayout groups={groups}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {t.title}
              <span className="ml-2 text-sm font-normal text-slate-500">{int(total)} shown</span>
            </h2>
            {picked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200">
                {picked.label}
                <Link href={picked.clear} aria-label={`Clear ${picked.label}`} className="ml-0.5 text-indigo-500 hover:text-indigo-900">✕</Link>
              </span>
            )}
            <RangePicker days={days} href={href} />
            <SearchBox path={path} query={query} placeholder={t.search} />
          </div>
          <div className="mt-3">{table}</div>
          {pages > 1 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              {page > 1 && <Link href={href({ page: String(page - 1) })} className={secondaryButtonClass}>Previous</Link>}
              Page {page} of {pages}
              {page < pages && <Link href={href({ page: String(page + 1) })} className={secondaryButtonClass}>Next</Link>}
            </p>
          )}
        </MenuLayout>
      </div>
    </>
  );
}

// The Overview's worst few of each entity, over the range, each opening its tab (owner, 2026-11-13).
export async function WorstEntities({ days, show, limit = 5 }: { days: WindowDays; show: boolean; limit?: number }) {
  const data = await loadEntities(show, days);
  const ctx: Ctx = { now: Date.parse(data.loadedAt), days, scoped: false };
  const range = days === 1 ? "" : `?range=${days}`;
  const needing = <T extends { level: Level; needs: Needs; stats: RangeStats }>(rows: T[]) => rows.filter((r) => r.level === "critical" || r.level === "warning").sort(worstFirst);
  const clients = needing(data.clients.filter((c) => c.status !== "inactive"));
  const licenses = needing(data.licenses);
  const devices = needing(data.devices);
  const more = (count: number, what: string, path: string) => (
    <p className="mt-3 text-sm">
      <Link href={`${HEALTH_PATH}/${path}${range}`} className={secondaryButtonClass}>{count > limit ? `All ${count} ${what} needing action` : `Open ${what}`}</Link>
    </p>
  );
  return (
    <>
      <Section title="Clients needing action" note={`Worst first: ${clients.length} of ${data.clients.length} clients are critical or warning.`}>
        <ClientRows rows={clients.slice(0, limit)} ctx={ctx} />
        {more(clients.length, "clients", "clients")}
      </Section>
      <Section title="Licenses needing action" note={`Worst first: ${licenses.length} of ${data.licenses.length} licenses are critical or warning.`}>
        <LicenseRows rows={licenses.slice(0, limit)} ctx={ctx} />
        {more(licenses.length, "licenses", "licenses")}
      </Section>
      <Section title="Devices needing action" note={`Worst first: device models with a license that's critical or warning, ${devices.length} of ${data.devices.length}.`}>
        <DeviceRows rows={devices.slice(0, limit)} ctx={ctx} clientId={null} />
        {more(devices.length, "devices", "devices")}
      </Section>
    </>
  );
}
