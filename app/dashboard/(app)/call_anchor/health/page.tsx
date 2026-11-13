import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WINDOW_DAYS, loadFleetActivity, loadFleetHealth } from "@/lib/callanchor/health";
import { MODULES, issueModule, type IssueModule } from "@/lib/callanchor/issues";
import { PortalError } from "@/lib/callanchor/portal";
import { secondaryButtonClass } from "@/components/ui";
import { HEALTH_PATH, requireCallAnchorSession, showInternal, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { MenuLayout } from "./FilterMenu";
import { Hero, StatCell, StatStrip } from "./ui";
import { ago, formatTime, httpTone, int, itemsHref, pct, severityTone, toneBadge, type Tone } from "./format";
import { CoverageNote, IssueList, ItemLink, LoadingNote, Table, issueLinks, td } from "./parts";

export const metadata: Metadata = { title: "Client health" };
// The first pull stores 5 days for every client, and the daily refresh runs after the response.
export const maxDuration = 300;

// How many issue cards show before "show all".
const BAND_SIZE = 9;

// The Overview tab (owner, 2026-11-13): the hero with the fleet's numbers, then what needs action,
// with the modules (CRM, Device, Portal, Usage) as the left menu. Clients and Licenses are their own
// tabs.
export default async function ClientHealthPage({ searchParams }: PageProps<"/dashboard/call_anchor/health">) {
  const { profile } = await requireCallAnchorSession(HEALTH_PATH);
  const query = await searchParams;
  const all = query.issues === "all";

  return (
    <div>
      {!profile && <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>}
      {profile && (
        <Suspense fallback={<LoadingNote text="Reading the stored data. Only the first read after the server starts waits; later visits show the last data at once and update in place." expectMs={20000} />}>
          <FleetHealth all={all} query={query} />
        </Suspense>
      )}
    </div>
  );
}

async function FleetHealth({ all, query }: { all: boolean; query: Record<string, string | string[] | undefined> }) {
  const { member } = await requireCallAnchorSession(HEALTH_PATH);
  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(HEALTH_PATH));

  let data;
  try {
    data = await loadFleetHealth(cookie, member.id, await showInternal());
  } catch (error) {
    if (error instanceof PortalError && error.rejected) redirect(verifyUrl(HEALTH_PATH));
    // Only a PortalError came from CallAnchor; anything else is ours (the store, the code), so say so
    // and log it rather than blame CallAnchor.
    console.error("[health] fleet failed to load", error);
    return (
      <p className="mt-6 text-sm text-red-700">
        {error instanceof PortalError
          ? `Couldn't read the fleet from CallAnchor (HTTP ${error.status}). Reload to try again.`
          : "Couldn't load the stored health data: the dashboard itself hit an error, not CallAnchor. Reload to try again; the server log has the cause."}
      </p>
    );
  }

  const now = Date.parse(data.loadedAt);
  const { rows, totals, needsAction } = data;
  const critical = needsAction.filter((i) => i.level === "critical").length;
  const fresh = needsAction.filter((i) => i.newSinceVisit).length;
  const working = rows.filter((r) => r.status !== "inactive");
  const levels = (level: string) => working.filter((r) => r.level === level).length;
  const { seats } = totals;
  const reach = totals.due ? Math.round((totals.reached / totals.due) * 1000) / 10 : null;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mod: IssueModule | "all" = MODULE_IDS.find((m) => m === one(query.na)) ?? "all";
  const range = WINDOW_DAYS.find((d) => String(d) === one(query.range)) ?? 1;
  const byModule = Object.fromEntries(MODULE_IDS.map((m) => [m, needsAction.filter((i) => issueModule(i.kind) === m)])) as Record<IssueModule, typeof needsAction>;
  const modIssues = mod === "all" ? needsAction : byModule[mod];
  const shown = all ? modIssues : modIssues.slice(0, BAND_SIZE);
  // Changing the Needs action module or range keeps the page's other filters (licenses).
  const naHref = (change: Record<string, string | null>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (typeof value === "string") params.set(key, value);
    for (const [key, value] of Object.entries(change)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const text = params.toString();
    return `${HEALTH_PATH}${text ? `?${text}` : ""}`;
  };
  const needLicenses = data.licenses.filter((h) => h.status === "critical" || h.status === "warning").length;

  return (
    <>
      <Hero
        eyebrow={{ icon: "activity", label: "Client health" }}
        title="Overview"
        meta="What needs action across every client, by module: what's broken, how bad and since when. Clients and Licenses have their own tabs. Stored data, brought up to date by the pull above."
        kpis={[
          { label: "Reached CRM, 24h", value: pct(reach), bar: reach, note: `${int(totals.reached)} of ${int(totals.due)} due` },
          { label: "Calls, 24h", value: int(totals.calls), note: `${int(totals.callsToday)} since midnight IST` },
        ]}
      >
        <StatStrip attached>
          <StatCell
            icon="building"
            tone={levels("critical") ? "red" : levels("warning") ? "amber" : "green"}
            label="Clients"
            value={int(totals.clients)}
            sub={`${levels("critical")} critical · ${levels("warning")} warning · ${levels("healthy")} healthy · ${levels("idle")} idle${data.hiddenInternal ? ` · ${data.hiddenInternal} internal hidden` : ""}`}
            href={`${HEALTH_PATH}/clients`}
          />
          <StatCell
            icon="alert"
            tone={critical ? "red" : needsAction.length ? "amber" : "green"}
            label="Needs action"
            value={int(needsAction.length)}
            sub={`${critical} critical${fresh ? ` · ${fresh} new since your last visit` : ""}`}
            href={HEALTH_PATH}
          />
          <StatCell
            icon="check"
            tone={totals.openDrops ? "amber" : "green"}
            label="Recordings synced, 24h"
            value={`${int(totals.synced)} / ${int(totals.verified)}`}
            sub={totals.openDrops ? `${int(totals.openDrops)} still open across 30 days` : "none open"}
            href={itemsHref(HEALTH_PATH, { kind: "calls", stage: "notSynced" })}
          />
          <StatCell
            icon="seats"
            tone="blue"
            label="Licenses calling"
            value={`${int(seats.calling)} / ${int(seats.active)}`}
            sub={`${needLicenses ? `${int(needLicenses)} need action · ` : ""}${int(seats.idle + seats.loggedOut + seats.unassigned)} unused${seats.purchased !== null ? ` · ${int(seats.purchased)} purchased` : ""}`}
            href={`${HEALTH_PATH}/licenses?use=unused`}
          />
        </StatStrip>
      </Hero>
      <CoverageNote store={data.store} coverage={data.coverage} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />
      {rows.length === 0 && <p className="mt-6 text-sm text-slate-500">No clients stored yet. Reload to try the first pull again.</p>}

      <MenuLayout
        groups={[
          {
            title: "Module",
            items: [
              { key: "all", label: "All", count: needsAction.length, active: mod === "all", always: true, href: naHref({ na: null, issues: null, range: null }) },
              ...MODULE_IDS.map((m) => ({
                key: m,
                label: MODULES[m].label,
                title: MODULES[m].note,
                count: byModule[m].length,
                tone: (byModule[m].some((i) => i.level === "critical") ? "red" : byModule[m].length ? "amber" : "slate") as Tone,
                active: mod === m,
                always: true,
                href: naHref({ na: m, issues: null, range: null }),
              })),
            ],
          },
        ]}
      >
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Needs action{mod === "all" ? "" : `: ${MODULES[mod].label}`}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {modIssues.length} issue{modIssues.length === 1 ? "" : "s"}, {modIssues.filter((i) => i.level === "critical").length} critical
          </span>
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-slate-500">
          {mod === "all" ? "Issues and errors across every module" : MODULES[mod].note}, worst impact first. Open an issue for its items, with the
          evidence and what to check above them. Recordings and calls that never reached the CRM stay here until they do.
          {data.lastVisit && (
            <span className={fresh ? "font-medium text-indigo-800" : ""}>
              {" "}
              {fresh ? `${fresh} new` : "Nothing new"} since your last visit, {ago(data.lastVisit, now)}.
            </span>
          )}
        </p>
        <div className="mt-3">
          <IssueList issues={shown} basePath={HEALTH_PATH} now={now} names={data.names} licenseLabels={data.licenseNames} empty={mod === "all" ? "Nothing needs action." : `No ${MODULES[mod].label} issues.`} />
        </div>
        {modIssues.length > shown.length && (
          <p className="mt-3 text-sm">
            <Link href={naHref({ issues: "all" })} className={secondaryButtonClass}>Show all {modIssues.length} issues</Link>
          </p>
        )}
        {(mod === "crm" || mod === "portal") && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-2 text-base font-semibold text-slate-900">{mod === "crm" ? "CRM errors" : "System logs"}</h3>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time range</span>
              {WINDOW_DAYS.map((d) => (
                <Link key={d} href={naHref({ range: d === 1 ? null : String(d) })} aria-current={d === range ? "page" : undefined} className={chip(d === range)}>
                  {windowLabel(d)}
                </Link>
              ))}
            </div>
            <p className="mb-3 mt-1 text-sm text-slate-500">
              {mod === "crm"
                ? "Failed CRM syncs across clients, titled by what's trusted: the platform, the HTTP code, and whether the calls ever reached the CRM. The replies under each are samples of each client's own format, masked, and never decide severity. Counted by when the callout was sent."
                : "Everything CallAnchor logged, by source and severity, with CallAnchor's own faults on top. Open a source for its log lines."}
            </p>
            <Suspense key={`${mod}:${range}`} fallback={<LoadingNote text="Reading the stored syncs and logs for this time range." expectMs={4000} />}>
              <Activity view={mod === "crm" ? "crm" : "logs"} days={range} />
            </Suspense>
          </div>
        )}
      </MenuLayout>
    </>
  );
}

// Needs action groups issues and errors by module (owner, 2026-11-13). CRM shows the failed syncs
// under its issues and Portal the system logs, over a time range of 24 hours unless picked.
const MODULE_IDS = Object.keys(MODULES) as IssueModule[];

const windowLabel = (days: number) => (days === 1 ? "24 hours" : `${days} days`);
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;

async function Activity({ view, days }: { view: "crm" | "logs"; days: number }) {
  const { errors, sources, platform } = await loadFleetActivity(await showInternal(), days);
  const inRange = { window: days };

  if (view === "crm") {
    return (
      <>
        <Table head={["What we know", "Calls", "What the CRM said (samples)", "Clients"]} empty={errors.length ? undefined : `No failed syncs in the last ${windowLabel(days)}.`}>
          {errors.slice(0, 25).map((e) => {
            const drill = { kind: "syncs", status: "failed", platform: e.platform, http: e.http === null ? "none" : String(e.http) } as const;
            const persistence = e.persistent === e.calls ? "persistent" : e.persistent === 0 ? "transient" : `${int(e.persistent)} persistent`;
            return (
              <tr key={`${e.platform}|${e.http}`}>
                <td className={`${td} font-medium`}>
                  <ItemLink href={itemsHref(HEALTH_PATH, drill, inRange)}><span className={toneBadge(httpTone(e.http))}>{e.http === null ? "No response" : `HTTP ${e.http}`}</span></ItemLink>
                  <p className="text-xs font-normal text-slate-500">{e.platform} · {persistence}</p>
                </td>
                <td className={`${td} text-right tabular-nums`}>{int(e.calls)}</td>
                <td className="min-w-80 px-3 py-2 align-top text-xs text-slate-600">
                  {e.samples.map((s) => (
                    <p key={s.label}>
                      <ItemLink href={itemsHref(HEALTH_PATH, { ...drill, label: s.label }, inRange)}>{s.label}</ItemLink> <span className="text-slate-400">×{int(s.count)}</span>
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-500">
                  {e.clients.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      <ItemLink href={itemsHref(HEALTH_PATH, drill, { ...inRange, client: c.id })}>{c.name}</ItemLink>
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 text-sm">
          <Link href={itemsHref(HEALTH_PATH, { kind: "syncs", status: "failed" }, inRange)} className={secondaryButtonClass}>See all failed syncs</Link>
        </p>
      </>
    );
  }

  return (
    <>
      {platform.length > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-medium">CallAnchor platform:</span>{" "}
          {platform.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              <ItemLink href={issueLinks(HEALTH_PATH, p).primary}>{p.title}</ItemLink> ({p.impactText})
            </span>
          ))}
        </p>
      )}
      <Table head={["Source", "Severity", "Events", "Latest", "Example message"]} empty={sources.length ? undefined : `No system logs in the last ${windowLabel(days)}.`}>
        {sources.map((s) => (
          <tr key={`${s.severity}|${s.source}`}>
            <td className={td}>
              <ItemLink href={itemsHref(HEALTH_PATH, { kind: "logs", source: s.source, severity: s.severity }, inRange)}>{s.source}</ItemLink>
            </td>
            <td className={td}><span className={toneBadge(severityTone(s.severity))}>{s.severity}</span></td>
            <td className={`${td} text-right tabular-nums`}>{int(s.count)}</td>
            <td className={`${td} text-xs text-slate-500`}>{formatTime(s.lastAt)}</td>
            <td className="px-3 py-2 align-top text-xs text-slate-500">{s.message}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
