import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadClientHealth, PURGE_FAILURES, WINDOW_DAYS, type Drill, type WindowDays } from "@/lib/callanchor/health";
import { PortalError } from "@/lib/callanchor/portal";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { ago, callHref, formatTime, int, itemsHref, pct, rateClass } from "../format";
import { Flags, HealthBadge, ItemLink, LoadingNote, Section, StoreNote, SyncTrend, Table, Tile, td } from "../parts";

export const metadata: Metadata = { title: "Client health" };
// The first pull stores this client's last 5 days, and the daily refresh runs after the response.
export const maxDuration = 300;

const ID_PATTERN = /^[\w-]{1,100}$/; // ids can't contain "/" or "..", so one can't reach another endpoint

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/dashboard/call_anchor_config/health/[clientId]">) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  if (!ID_PATTERN.test(clientId)) notFound();
  const path = `${HEALTH_PATH}/${clientId}`;
  const { profile } = await requireCallAnchorSession(path);
  const days = (WINDOW_DAYS.find((d) => String(d) === query.window) ?? 7) as WindowDays;

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: CALLANCHOR_PATH, label: "CallAnchor Config" },
          { href: HEALTH_PATH, label: "Client health" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Window</span>
        {WINDOW_DAYS.map((d) => (
          <Link
            key={d}
            href={`${path}?window=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              d === days ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {d === 1 ? "24 hours" : `${d} days`}
          </Link>
        ))}
      </div>
      {profile ? (
        <Suspense key={days} fallback={<LoadingNote text="Reading this client's calls, recordings and CRM syncs from CallAnchor…" />}>
          <ClientHealth clientId={clientId} days={days} path={path} />
        </Suspense>
      ) : (
        <p className="mt-6 text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>
      )}
    </div>
  );
}

async function ClientHealth({ clientId, days, path }: { clientId: string; days: WindowDays; path: string }) {
  const { member } = await requireCallAnchorSession(path);
  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(path));

  let data;
  try {
    data = await loadClientHealth(cookie, clientId, days);
  } catch (error) {
    if (error instanceof PortalError && error.rejected) redirect(verifyUrl(path));
    if (error instanceof PortalError && error.status === 404) notFound();
    return (
      <p className="mt-6 text-sm text-red-700">
        Couldn&apos;t read this client from CallAnchor{error instanceof PortalError ? ` (HTTP ${error.status})` : ""}. Reload to try again.
      </p>
    );
  }

  const now = Date.parse(data.loadedAt);
  const { client, tenant, sync, pipeline, lifetime, contacts, store } = data;
  const settled = sync.delivered + sync.failed;
  // Stored history can start after the window does: the store only holds what it has pulled.
  const shortBy = (from: string | null) => from !== null && Date.parse(from) - Date.parse(data.since) > 60 * 60_000;
  const items = (drill: Drill) => itemsHref(HEALTH_PATH, drill, { client: clientId, window: days });
  const logs = (source: string) => items({ kind: "logs", source });
  const stages = [
    { stage: "stuck", rows: pipeline.stuck },
    { stage: "unsynced", rows: pipeline.unsynced },
    { stage: "waiting", rows: pipeline.waiting },
  ] as const;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{client.companyName}</h1>
        <HealthBadge level={data.level} />
        <span className="text-sm text-slate-500">
          {client.status} · {client.plan} plan{client.accessSuspended ? " · access suspended" : ""}
        </span>
      </div>
      <StoreNote store={store} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />

      <div className="mt-4">
        <Flags flags={data.flags} href={items} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Calls, lifetime"
          value={int(contacts?.totalCalls)}
          detail={
            contacts
              ? `${int(contacts.outgoing)} out · ${int(contacts.incoming)} in · ${int(contacts.missed)} missed · ${pct(contacts.answerRate)} answered`
              : "Call stats unavailable"
          }
        />
        <Tile
          label="Recordings"
          value={int(tenant.recordedCalls)}
          detail={`${int(tenant.pendingRecordings)} pending · limit ${tenant.recordingLimit === null ? "none set" : int(tenant.recordingLimit)}`}
        />
        <Tile
          label={`CRM syncs, ${data.windowLabel.replace("the last ", "")}`}
          href={items({ kind: "syncs" })}
          value={<span className={rateClass(sync.successRate)}>{pct(sync.successRate)}</span>}
          detail={`${int(sync.delivered)} delivered · ${int(sync.failed)} failed${sync.inFlight ? ` · ${int(sync.inFlight)} in flight` : ""}`}
        />
        <Tile
          label="CRM syncs, lifetime"
          value={<span className={rateClass(lifetime?.total ? lifetime.successRate : null)}>{pct(lifetime?.total ? lifetime.successRate : null)}</span>}
          detail={
            lifetime
              ? `${int(lifetime.delivered)} delivered · ${int(lifetime.failed)} failed · ${int(lifetime.retrying + lifetime.queued)} queued`
              : "Not pulled yet"
          }
        />
      </div>

      <Section
        title="CRM syncs over time"
        note={shortBy(store.callsSince) ? `Stored history for this client starts ${formatTime(store.callsSince)} IST, after the window begins.` : undefined}
      >
        <SyncTrend buckets={data.trend} hourly={data.trendHourly} />
      </Section>

      <Section
        title="Recording pipeline"
        note={
          <>
            Each call followed through CallAnchor&apos;s system log. A stage older than 30 minutes with no next step counts as stuck.
            {shortBy(store.logsSince) &&
              ` Stored system logs start ${formatTime(store.logsSince)} IST. CallAnchor keeps only about 3 days, so earlier ones are gone.`}
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile
            label="Calls ingested"
            value={int(pipeline.callsIngested)}
            href={logs("mobile.call.create")}
            detail={`${int(pipeline.expectingRecording)} to record · ${int(pipeline.notRecorded)} not recorded`}
          />
          <Tile label="Upload started" value={int(pipeline.uploadsStarted)} href={logs("mobile.recording.upload-init")} />
          <Tile
            label="Uploaded"
            value={int(pipeline.uploadsCompleted)}
            href={logs("mobile.recording.upload-complete")}
            detail={pipeline.uploadsFailed ? <ItemLink href={logs("mobile.recording.upload-failed")}>{int(pipeline.uploadsFailed)} failed</ItemLink> : undefined}
          />
          <Tile label="Verified" value={int(pipeline.uploadsVerified)} href={logs("mobile.recording.job-processed")} />
          <Tile
            label="Synced to CRM"
            value={int(sync.recordingsSynced)}
            href={items({ kind: "syncs", event: "recording.ready", status: "delivered" })}
            detail={
              tenant.takesRecordings ? (
                <ItemLink href={items({ kind: "syncs", event: "recording.ready", status: "failed" })}>{int(sync.recordingsFailed)} recording syncs failed</ItemLink>
              ) : (
                "No integration takes recordings"
              )
            }
          />
          <Tile
            label="Removed from S3"
            value={int(pipeline.purged)}
            href={logs("platform-recording-cleanup")}
            detail={pipeline.purgeFailed ? <ItemLink href={items(PURGE_FAILURES)}>{int(pipeline.purgeFailed)} failed to delete</ItemLink> : undefined}
          />
        </div>
        {(pipeline.stuck.length > 0 || pipeline.waiting.length > 0 || pipeline.unsynced.length > 0) && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-slate-500">
              The newest 50 are listed. All of them:{" "}
              {stages
                .filter((g) => g.rows.length > 0)
                .map((g, i) => (
                  <span key={g.stage}>
                    {i > 0 && " · "}
                    <ItemLink href={items({ kind: "recordings", stage: g.stage })}>
                      {int(g.rows.length)} {g.stage === "stuck" ? "stuck" : g.stage === "unsynced" ? "not synced" : "not uploaded"}
                    </ItemLink>
                  </span>
                ))}
            </p>
            <Table head={["Call", "Where it stopped", "Since"]}>
              {[...pipeline.stuck, ...pipeline.unsynced, ...pipeline.waiting].slice(0, 50).map((s) => (
                <tr key={`${s.callId}|${s.stage}`}>
                  <td className={td}>
                    <Link href={callHref(HEALTH_PATH, s.callId)} className="font-mono text-xs text-indigo-700 hover:underline">{s.callId}</Link>
                  </td>
                  <td className={td}>{s.stage}</td>
                  <td className={`${td} text-xs text-slate-500`}>{formatTime(s.since)} ({ago(s.since, now)})</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Section>

      <Section title="What the CRM sent back" note={`Every reply in ${data.windowLabel}, grouped. Successes by reply shape, failures by error, with ids and numbers masked. Open one for each sync behind it.`}>
        <Table head={["Outcome", "Platform", "HTTP", "Reply or error", "Events", "Count", "Latest"]} empty={sync.outcomes.length ? undefined : "No CRM syncs in this window."}>
          {sync.outcomes.slice(0, 40).map((o) => {
            const href = items({ kind: "syncs", status: o.status, platform: o.platform, http: o.httpStatus === null ? "none" : String(o.httpStatus), label: o.label });
            return (
              <tr key={`${o.status}|${o.platform}|${o.httpStatus}|${o.label}`}>
                <td className={`${td} ${o.status === "failed" ? "font-medium text-red-700" : o.status === "delivered" ? "text-emerald-700" : ""}`}>{o.status}</td>
                <td className={td}>{o.platform}</td>
                <td className={`${td} tabular-nums`}>{o.httpStatus ?? "—"}</td>
                <td className="min-w-80 px-3 py-2 align-top text-slate-700">
                  <ItemLink href={href}>{o.label}</ItemLink>
                </td>
                <td className={`${td} text-xs text-slate-500`}>{o.eventTypes.join(", ")}</td>
                <td className={`${td} text-right tabular-nums`}>
                  <ItemLink href={href}>{int(o.count)}</ItemLink>
                </td>
                <td className={`${td} text-xs text-slate-500`}>{formatTime(o.lastAt)}</td>
              </tr>
            );
          })}
        </Table>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(sync.byEvent).map(([event, c]) => (
            <Tile
              key={event}
              label={event}
              value={int(c.delivered)}
              href={items({ kind: "syncs", event, status: "delivered" })}
              detail={
                <>
                  delivered · <ItemLink href={items({ kind: "syncs", event, status: "failed" })}>{int(c.failed)} failed</ItemLink>
                </>
              }
            />
          ))}
          <Tile
            label="CRM response time"
            value={sync.p50Ms === null ? "—" : `${int(sync.p50Ms)} ms`}
            detail={`median · 95th percentile ${sync.p95Ms === null ? "—" : `${int(sync.p95Ms)} ms`}${sync.retried ? ` · ${int(sync.retried)} retries` : " · no retries seen"}`}
          />
        </div>
      </Section>

      <Section
        title="Latest failed syncs"
        note={
          settled ? (
            <>
              <ItemLink href={items({ kind: "syncs", status: "failed" })}>{int(sync.failed)} failed</ItemLink> in {data.windowLabel}. The newest 25 are listed.
            </>
          ) : undefined
        }
      >
        <Table head={["When", "Event", "Platform", "HTTP", "Attempt", "Error", "Call"]} empty={sync.recentFailures.length ? undefined : "No failed syncs in this window."}>
          {sync.recentFailures.map((f) => (
            <tr key={f.id}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(f.at)}</td>
              <td className={td}>{f.eventType}</td>
              <td className={td}>{f.platformId}</td>
              <td className={`${td} tabular-nums`}>{f.httpStatus ?? "—"}</td>
              <td className={`${td} tabular-nums`}>{f.attempt}</td>
              <td className="min-w-80 px-3 py-2 align-top text-slate-700">
                <ItemLink href={items({ kind: "syncs", status: "failed", platform: f.platformId, label: f.label })}>{f.label}</ItemLink>
              </td>
              <td className={td}>
                <Link href={callHref(HEALTH_PATH, f.callId)} className="font-mono text-xs text-indigo-700 hover:underline">{f.callId}</Link>
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Integrations">
        <Table head={["Platform", "State", "Schedule", "Events sent", "Last health check", "Connected"]} empty={tenant.integrations.length ? undefined : "No integrations configured."}>
          {tenant.integrations.map((i) => (
            <tr key={i.platformId}>
              <td className={td}>
                {i.platformName}
                {i.isCustom && <span className="ml-1 text-xs text-slate-400">custom</span>}
              </td>
              <td className={`${td} ${i.active ? "text-emerald-700" : "text-slate-400"}`}>{i.active ? "Active" : "Inactive"}</td>
              <td className={td}>
                {i.frequency ?? "—"}
                {i.schedulerEnabled === false && " (off)"}
              </td>
              <td className={`${td} text-xs`}>{i.eventTypes.length ? i.eventTypes.join(", ") : "none"}</td>
              <td className={`${td} text-xs text-slate-500`}>{i.lastHealthCheck ? `${formatTime(i.lastHealthCheck)} (${ago(i.lastHealthCheck, now)})` : "—"}</td>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(i.connectedAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Licenses" note={`${tenant.loggedIn} of ${tenant.licenses} logged in.`}>
        <Table head={["Number", "Agent", "Logged in", "Last login", "Device", "App", "Recording", "Lifetime calls"]}>
          {data.licenses.map((l) => (
            <tr key={l.id} className={l.isLoggedIn && l.lifetimeCallRecordCount === 0 ? "bg-amber-50/60" : undefined}>
              <td className={`${td} font-mono text-xs`}>…{l.number.slice(-4)}</td>
              <td className={td}>{l.assignedTo?.name ?? "Unassigned"}</td>
              <td className={td}>{l.isLoggedIn ? "Yes" : "No"}{!l.isActive && <span className="text-xs text-slate-400"> (inactive)</span>}</td>
              <td className={`${td} text-xs text-slate-500`}>{l.lastLoginLabel ?? "—"}</td>
              <td className={`${td} text-xs text-slate-500`}>{[l.lastLoginAndroidBrand, l.lastLoginAndroidModel].filter(Boolean).join(" ") || "—"}</td>
              <td className={`${td} text-xs text-slate-500`}>{l.lastLoginAppVersion ?? "—"}</td>
              <td className={`${td} text-xs`}>{l.recordingEnabled === null || l.recordingEnabled === undefined ? "Default" : l.recordingEnabled ? "On" : "Off"}</td>
              <td className={`${td} text-right tabular-nums`}>{int(l.lifetimeCallRecordCount)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Account">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Trial"
            value={client.status === "trial" ? (tenant.trialExpired ? "Expired" : `${int(tenant.trialDaysRemaining)} days left`) : "—"}
            detail={client.status === "trial" ? undefined : `Status: ${client.status}`}
          />
          <Tile label="Licenses" value={`${tenant.licenses} / ${client.licenseCount}`} detail={tenant.licenseOverBy ? `${tenant.licenseOverBy} over the cap` : "assigned / allowed"} />
          <Tile
            label="OneAPI"
            value={data.oneApi ? (data.oneApi.linked ? "Linked" : "Not linked") : "—"}
            detail={data.oneApi ? `${data.oneApi.accountStatus} · product ${data.oneApi.assignProductStatus ?? "none"}${data.oneApi.backfillRecommended ? " · backfill recommended" : ""}` : "Status unavailable"}
          />
          <Tile label="Storage" value={tenant.storageError ? "Error" : "OK"} detail={tenant.storageError ?? (tenant.migrationFailed ? `${tenant.migrationFailed} failed migrations` : undefined)} />
        </div>
      </Section>

      <Section title="System log sources" note="Everything CallAnchor logged for this client in the window, by source and severity. Open a source for its log lines.">
        <Table head={["Source", "Severity", "Events", "Latest", "Example message"]} empty={pipeline.sources.length ? undefined : "No system logs in this window."}>
          {pipeline.sources.map((s) => (
            <tr key={`${s.severity}|${s.source}`}>
              <td className={td}>
                <ItemLink href={items({ kind: "logs", source: s.source, severity: s.severity })}>{s.source}</ItemLink>
              </td>
              <td className={`${td} ${s.severity === "info" ? "" : "font-medium text-red-700"}`}>{s.severity}</td>
              <td className={`${td} text-right tabular-nums`}>{int(s.count)}</td>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(s.lastAt)}</td>
              <td className="px-3 py-2 align-top text-xs text-slate-500">{s.message}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent activity" note="The latest 25 audit log entries for this client.">
        <Table head={["When", "Who", "Action", "On"]} empty={data.audit.length ? undefined : "No audit entries."}>
          {data.audit.map((a) => (
            <tr key={a.id}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(a.occurredAt)}</td>
              <td className={td}>{a.actorDisplayName ?? "System"}</td>
              <td className={td}>{a.action}</td>
              <td className={td}>{a.resourceType}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
