import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadFleetHealth, PURGE_FAILURES } from "@/lib/callanchor/health";
import { PortalError } from "@/lib/callanchor/portal";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { FleetTable } from "./FleetTable";
import { ago, formatTime, int, itemsHref, pct } from "./format";
import { ItemLink, LoadingNote, Section, StoreNote, Table, Tile, td } from "./parts";

export const metadata: Metadata = { title: "Client health" };
// The first pull stores 5 days for every client, and the daily refresh runs after the response.
export const maxDuration = 300;

export default async function ClientHealthPage() {
  const { profile } = await requireCallAnchorSession(HEALTH_PATH);

  return (
    <div>
      <Breadcrumbs items={[{ href: CALLANCHOR_PATH, label: "CallAnchor Config" }]} />
      <h1 className="text-xl font-semibold text-slate-900">Client health</h1>
      <p className="mt-1 text-sm text-slate-500">
        {profile
          ? "Every client. Recordings, CRM syncs and errors cover the last 24 hours. Each visit pulls only what's new from CallAnchor."
          : "CallAnchor can't be reached right now."}
      </p>
      {profile && (
        <Suspense fallback={<LoadingNote text="Pulling what's new from CallAnchor. The very first load also stores the last 5 days, which takes up to a minute." />}>
          <FleetHealth />
        </Suspense>
      )}
    </div>
  );
}

async function FleetHealth() {
  const { member } = await requireCallAnchorSession(HEALTH_PATH);
  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(HEALTH_PATH));

  let data;
  try {
    data = await loadFleetHealth(cookie);
  } catch (error) {
    if (error instanceof PortalError && error.rejected) redirect(verifyUrl(HEALTH_PATH));
    return (
      <p className="mt-6 text-sm text-red-700">
        Couldn&apos;t read the fleet from CallAnchor{error instanceof PortalError ? ` (HTTP ${error.status})` : ""}. Reload to try again.
      </p>
    );
  }

  const now = Date.parse(data.loadedAt);
  const { rows, pipelineTotals: p } = data;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const delivered = sum((r) => r.syncDelivered);
  const failed = sum((r) => r.syncFailed);
  const levels = (level: string) => rows.filter((r) => r.level === level).length;

  return (
    <>
      <StoreNote store={data.store} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />
      {rows.length === 0 && <p className="mt-6 text-sm text-slate-500">No clients stored yet. Reload to try the first pull again.</p>}

      {p.purgeFailed > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">! CallAnchor isn&apos;t deleting recordings from S3 after they sync</p>
          <p className="mt-1">
            <ItemLink href={itemsHref(HEALTH_PATH, PURGE_FAILURES)}>
              {int(p.purgeFailed)} of {int(p.purgeFailed + p.purged)} deletions failed
            </ItemLink>{" "}
            in the last 24 hours. CallAnchor logs these as info, but recordings stay in S3 longer than intended.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Clients"
          value={int(rows.length)}
          detail={`${levels("critical")} critical · ${levels("warning")} warning · ${levels("healthy")} healthy · ${levels("idle")} idle`}
        />
        <Tile label="Calls today" value={int(sum((r) => r.callsToday))} detail={`${int(p.callsIngested)} ingested in 24h · ${int(sum((r) => r.totalCalls))} lifetime`} />
        <Tile
          label="Recordings 24h"
          value={int(p.uploadsVerified)}
          detail={
            <>
              {int(p.expectingRecording)} calls expected one ·{" "}
              <ItemLink href={itemsHref(HEALTH_PATH, { kind: "recordings", stage: "waiting" })}>{int(sum((r) => r.waitingRecordings))} not uploaded</ItemLink> ·{" "}
              <ItemLink href={itemsHref(HEALTH_PATH, { kind: "recordings", stage: "stuck" })}>{int(sum((r) => r.stuckRecordings))} stuck</ItemLink> ·{" "}
              <ItemLink href={itemsHref(HEALTH_PATH, { kind: "recordings", stage: "unsynced" })}>{int(sum((r) => r.unsyncedRecordings))} not synced</ItemLink>
            </>
          }
        />
        <Tile
          label="CRM syncs 24h"
          value={pct(delivered + failed ? Math.round((delivered / (delivered + failed)) * 1000) / 10 : null)}
          href={itemsHref(HEALTH_PATH, { kind: "syncs" })}
          detail={`${int(delivered)} delivered · ${int(failed)} failed · ${int(sum((r) => r.recordingsSynced))} recordings synced`}
        />
      </div>

      <Section title="Clients" note="Worst first. Open a client for its full breakdown.">
        <FleetTable
          basePath={HEALTH_PATH}
          rows={rows.map((r) => ({
            ...r,
            lastCallLabel: `Call ${ago(r.lastCallAt, now)}`,
            lastDeliveredLabel: `Sync ${ago(r.lastDeliveredAt, now)}`,
          }))}
        />
      </Section>

      <Section
        title="CRM errors across clients, last 24 hours"
        note={
          <>
            Ids, numbers, emails and links are masked so identical failures group together. Open an error for every failed sync behind it, or{" "}
            <ItemLink href={itemsHref(HEALTH_PATH, { kind: "syncs", status: "failed" })}>see all failed syncs</ItemLink>.
          </>
        }
      >
        <Table head={["Platform", "Error", "Failures", "Clients"]} empty={data.errors.length ? undefined : "No failed syncs in the last 24 hours."}>
          {data.errors.slice(0, 25).map((e) => {
            const drill = { kind: "syncs", status: "failed", platform: e.platform, label: e.label } as const;
            return (
              <tr key={`${e.platform}|${e.label}`}>
                <td className={td}>{e.platform}</td>
                <td className="px-3 py-2 align-top text-slate-700">
                  <ItemLink href={itemsHref(HEALTH_PATH, drill)}>{e.label}</ItemLink>
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  <ItemLink href={itemsHref(HEALTH_PATH, drill)}>{int(e.count)}</ItemLink>
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
      </Section>

      <Section title="System log sources across clients, last 24 hours" note="Everything CallAnchor logged, by source and severity. The recording pipeline is the mobile.* and cleanup rows. Open a source for its log lines.">
        <Table head={["Source", "Severity", "Events", "Latest", "Example message"]}>
          {p.sources.map((s) => (
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
      </Section>
    </>
  );
}
