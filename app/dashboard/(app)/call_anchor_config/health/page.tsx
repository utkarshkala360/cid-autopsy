import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadFleetHealth } from "@/lib/callanchor/health";
import { PortalError } from "@/lib/callanchor/portal";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { FleetTable } from "./FleetTable";
import { ago, formatTime, int, itemsHref, pct, rateClass } from "./format";
import { Collapsed, CoverageNote, HealthTabs, IssueList, ItemLink, LoadingNote, Section, Table, Tile, issueLinks, td } from "./parts";

export const metadata: Metadata = { title: "Client health" };
// The first pull stores 5 days for every client, and the daily refresh runs after the response.
export const maxDuration = 300;

// How many issue cards show before "show all".
const BAND_SIZE = 9;

export default async function ClientHealthPage({ searchParams }: PageProps<"/dashboard/call_anchor_config/health">) {
  const { profile } = await requireCallAnchorSession(HEALTH_PATH);
  const all = (await searchParams).issues === "all";

  return (
    <div>
      <Breadcrumbs items={[{ href: CALLANCHOR_PATH, label: "CallAnchor Config" }]} />
      <h1 className="text-xl font-semibold text-slate-900">Client health</h1>
      <HealthTabs basePath={HEALTH_PATH} current="clients" />
      <p className="mt-1 text-sm text-slate-500">
        {profile
          ? "What's broken, how bad, and since when, across every client and phone. Each visit pulls only what's new from CallAnchor."
          : "CallAnchor can't be reached right now."}
      </p>
      {profile && (
        <Suspense fallback={<LoadingNote text="Pulling what's new from CallAnchor. The very first load also stores the last 5 days, which takes up to a minute." />}>
          <FleetHealth all={all} />
        </Suspense>
      )}
    </div>
  );
}

async function FleetHealth({ all }: { all: boolean }) {
  const { member } = await requireCallAnchorSession(HEALTH_PATH);
  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(HEALTH_PATH));

  let data;
  try {
    data = await loadFleetHealth(cookie, member.id);
  } catch (error) {
    if (error instanceof PortalError && error.rejected) redirect(verifyUrl(HEALTH_PATH));
    return (
      <p className="mt-6 text-sm text-red-700">
        Couldn&apos;t read the fleet from CallAnchor{error instanceof PortalError ? ` (HTTP ${error.status})` : ""}. Reload to try again.
      </p>
    );
  }

  const now = Date.parse(data.loadedAt);
  const { rows, totals, needsAction } = data;
  const critical = needsAction.filter((i) => i.level === "critical").length;
  const fresh = needsAction.filter((i) => i.newSinceVisit).length;
  const working = rows.filter((r) => r.status !== "inactive");
  const levels = (level: string) => working.filter((r) => r.level === level).length;
  const shown = all ? needsAction : needsAction.slice(0, BAND_SIZE);
  const { seats } = totals;

  return (
    <>
      <CoverageNote store={data.store} coverage={data.coverage} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />
      {rows.length === 0 && <p className="mt-6 text-sm text-slate-500">No clients stored yet. Reload to try the first pull again.</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          label="Clients"
          value={int(totals.clients)}
          detail={`${levels("critical")} critical · ${levels("warning")} warning · ${levels("healthy")} healthy · ${levels("idle")} idle${totals.inactive ? ` · ${totals.inactive} inactive not counted` : ""}`}
        />
        <Tile
          label="Calls, last 24 hours"
          value={int(totals.calls)}
          href={itemsHref(HEALTH_PATH, { kind: "calls", stage: "all" })}
          detail={`CallAnchor counts ${int(totals.callsToday)} since midnight IST`}
        />
        <Tile
          label="Reached the CRM"
          value={<span className={rateClass(totals.due ? Math.round((totals.reached / totals.due) * 1000) / 10 : null)}>{pct(totals.due ? Math.round((totals.reached / totals.due) * 1000) / 10 : null)}</span>}
          href={itemsHref(HEALTH_PATH, { kind: "calls", stage: "notReached" })}
          detail={`${int(totals.reached)} of ${int(totals.due)} calls due at the CRM, 24 hours. Opens the ones that didn't`}
        />
        <Tile
          label="Recordings, 24 hours"
          value={`${int(totals.synced)} / ${int(totals.verified)}`}
          href={itemsHref(HEALTH_PATH, { kind: "calls", stage: "notSynced" })}
          detail={
            <>
              synced / verified.{" "}
              {totals.openDrops > 0 ? <span className="font-medium text-amber-800">{int(totals.openDrops)} still open across 30 days</span> : "None open."}
            </>
          }
        />
        <Tile
          label="Seats"
          value={`${int(seats.loggedIn)} / ${int(seats.active)}`}
          detail={`logged in / active${seats.purchased !== null ? ` · ${int(seats.purchased)} purchased` : ""} · ${int(seats.calling)} calling · ${int(seats.idle + seats.loggedOut + seats.unassigned)} unused`}
          href={`${HEALTH_PATH}/seats`}
        />
      </div>

      <Section
        title={needsAction.length ? `Needs action: ${needsAction.length} issue${needsAction.length === 1 ? "" : "s"}, ${critical} critical` : "Needs action"}
        note={
          <>
            Critical and warning issues for clients and their phones, worst impact first. Open one for its items, with the evidence and what to
            check above them. Recordings and calls that never reached the CRM stay here until they do.
            {data.lastVisit && (
              <span className={fresh ? "font-medium text-indigo-800" : ""}>
                {" "}
                {fresh ? `${fresh} new` : "Nothing new"} since your last visit, {ago(data.lastVisit, now)}.
              </span>
            )}
          </>
        }
      >
        <IssueList issues={shown} basePath={HEALTH_PATH} now={now} names={data.names} licenseLabels={data.licenseNames} empty="Nothing needs action." />
        {needsAction.length > shown.length && (
          <p className="mt-3 text-sm">
            <Link href={`${HEALTH_PATH}?issues=all`} className="font-medium text-indigo-700 hover:underline">Show all {needsAction.length} issues</Link>
          </p>
        )}
      </Section>

      {data.platform.length > 0 && (
        <p className="mt-4 text-sm text-slate-600">
          <span aria-hidden className="text-sky-700">i </span>
          <span className="font-medium">CallAnchor platform:</span>{" "}
          {data.platform.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              <ItemLink href={issueLinks(HEALTH_PATH, p).primary}>{p.title}</ItemLink> ({p.impactText})
            </span>
          ))}
          . Shown once here, not as client health.
        </p>
      )}

      <Section title="Clients" note="Worst first. Inactive clients are hidden unless you show them. Every number opens its calls; open a client for its full breakdown.">
        <FleetTable
          basePath={HEALTH_PATH}
          rows={rows.map(({ issues, ...r }) => ({
            ...r,
            lastActivityLabel: ago(r.lastActivityAt, now),
            lastSyncLabel: r.lastSyncAt ? ago(r.lastSyncAt, now) : "never",
            topIssue: issues.find((i) => i.level !== "info")?.title ?? null,
          }))}
        />
      </Section>

      {data.trials.length > 0 && (
        <Collapsed title={`Trials: ${data.trials.length}`} note="Is each trial on track to convert: phones calling, recordings against the limit, and an integration in place.">
          <Table head={["Client", "Days left", "Phones", "Calls, 7 days", "Recorded", "Integration"]}>
            {data.trials.map((t) => (
              <tr key={t.clientId}>
                <td className={td}><Link href={`${HEALTH_PATH}/${t.clientId}`} className="font-medium text-indigo-700 hover:underline">{t.companyName}</Link></td>
                <td className={`${td} ${t.expired || (t.daysLeft !== null && t.daysLeft <= 3) ? "font-medium text-amber-800" : ""}`}>{t.expired ? "Expired" : int(t.daysLeft)}</td>
                <td className={`${td} text-xs`}>
                  {int(t.seats.loggedIn)} of {int(t.seats.active)} logged in · {int(t.seats.calling)} calling
                  {t.neverCalled > 0 && <p className="text-amber-800">{t.neverCalled} logged in, never called</p>}
                </td>
                <td className={`${td} text-right tabular-nums`}>{int(t.calls7d)}</td>
                <td className={`${td} text-xs`}>{int(t.recorded)}{t.recordingLimit !== null ? ` of ${int(t.recordingLimit)}` : ""}</td>
                <td className={`${td} text-xs ${t.integrations.length ? "" : "text-amber-800"}`}>{t.integrations.join(", ") || "None"}</td>
              </tr>
            ))}
          </Table>
        </Collapsed>
      )}

      <Collapsed
        title={`CRM errors across clients, last 24 hours${data.errors.length ? `: ${data.errors.length} kinds` : ""}`}
        note={
          <>
            Titled by what&apos;s trusted: the platform, the HTTP code, and whether the calls ever reached the CRM. The replies under each are samples of
            each client&apos;s own format, masked, and never decide severity. Counted by when the callout was sent, so totals can differ from the issues,
            which count by when the call came in. <ItemLink href={itemsHref(HEALTH_PATH, { kind: "syncs", status: "failed" })}>See all failed syncs</ItemLink>.
          </>
        }
      >
        <Table head={["What we know", "Calls", "What the CRM said (samples)", "Clients"]} empty={data.errors.length ? undefined : "No failed syncs in the last 24 hours."}>
          {data.errors.slice(0, 25).map((e) => {
            const drill = { kind: "syncs", status: "failed", platform: e.platform, http: e.http === null ? "none" : String(e.http) } as const;
            const persistence = e.persistent === e.calls ? "persistent" : e.persistent === 0 ? "transient" : `${int(e.persistent)} persistent`;
            return (
              <tr key={`${e.platform}|${e.http}`}>
                <td className={`${td} font-medium`}>
                  <ItemLink href={itemsHref(HEALTH_PATH, drill)}>{e.http === null ? "No response" : `HTTP ${e.http}`}</ItemLink>
                  <p className="text-xs font-normal text-slate-500">{e.platform} · {persistence}</p>
                </td>
                <td className={`${td} text-right tabular-nums`}>{int(e.calls)}</td>
                <td className="min-w-80 px-3 py-2 align-top text-xs text-slate-600">
                  {e.samples.map((s) => (
                    <p key={s.label}>
                      <ItemLink href={itemsHref(HEALTH_PATH, { ...drill, label: s.label })}>{s.label}</ItemLink> <span className="text-slate-400">×{int(s.count)}</span>
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-500">
                  {e.clients.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      <ItemLink href={itemsHref(HEALTH_PATH, drill, { client: c.id })}>{c.name}</ItemLink>
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </Table>
      </Collapsed>

      <Collapsed title="System log sources across clients, last 24 hours" note="Everything CallAnchor logged, by source and severity. Open a source for its log lines.">
        <Table head={["Source", "Severity", "Events", "Latest", "Example message"]}>
          {data.sources.map((s) => (
            <tr key={`${s.severity}|${s.source}`}>
              <td className={td}>
                <ItemLink href={itemsHref(HEALTH_PATH, { kind: "logs", source: s.source, severity: s.severity })}>{s.source}</ItemLink>
              </td>
              <td className={`${td} ${s.severity === "info" ? "" : "font-medium text-red-700"}`}>{s.severity}</td>
              <td className={`${td} text-right tabular-nums`}>{int(s.count)}</td>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(s.lastAt)}</td>
              <td className="px-3 py-2 align-top text-xs text-slate-500">{s.message}</td>
            </tr>
          ))}
        </Table>
      </Collapsed>
    </>
  );
}
