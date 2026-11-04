import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cardClass } from "@/components/ui";
import { loadClientHealth, WINDOW_DAYS, type Drill, type WindowDays } from "@/lib/callanchor/health";
import type { CallStage } from "@/lib/callanchor/issues";
import { PortalError } from "@/lib/callanchor/portal";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { STATUS_RANK, ago, formatTime, int, itemsHref, licenseHref, pct, rateClass } from "../format";
import { Collapsed, CoverageNote, DayStrip, Funnel, HealthBadge, IssueList, ItemLink, LoadingNote, PulsePanel, Section, StatusBadge, SyncTrend, Table, Tile, td } from "../parts";

export const metadata: Metadata = { title: "Client health" };
// The first pull stores this client's last 5 days, and the daily refresh runs after the response.
export const maxDuration = 300;

const ID_PATTERN = /^[\w-]{1,100}$/; // ids can't contain "/" or "..", so one can't reach another endpoint

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/dashboard/call_anchor_config/health/[clientId]">) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  if (!ID_PATTERN.test(clientId)) notFound();
  const path = `${HEALTH_PATH}/${clientId}`;
  const { profile } = await requireCallAnchorSession(path);
  const days = (WINDOW_DAYS.find((d) => String(d) === query.window) ?? 1) as WindowDays;

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: CALLANCHOR_PATH, label: "CallAnchor Config" },
          { href: HEALTH_PATH, label: "Client health" },
        ]}
      />
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

function WindowPicker({ path, days }: { path: string; days: WindowDays }) {
  return (
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
  const { client, tenant, funnel, licenseTotals, seats } = data;
  const items = (drill: Drill) => itemsHref(HEALTH_PATH, drill, { client: clientId, window: days });
  const stageHref = (stage: CallStage) => items({ kind: "calls", stage });
  // The pulse covers fixed spans (24 hours, 7 and 30 days), whatever the window picker says.
  const pulseHref = (stage: CallStage, window = 1) => itemsHref(HEALTH_PATH, { kind: "calls", stage }, { client: clientId, window });
  const top = data.issues.find((i) => i.level !== "info");
  const problemPhones = licenseTotals.critical + licenseTotals.warning;
  const licenseLabels = Object.fromEntries(data.licenses.map((h) => [h.license.licenseId, h.license.last4 ?? "????"]));
  const failedReplies = data.replies.filter((r) => r.status === "failed");

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{client.companyName}</h1>
        <HealthBadge level={data.level} />
        <span className="text-sm text-slate-500">
          {client.status} · {client.plan} plan{client.accessSuspended ? " · access suspended" : ""}
        </span>
      </div>
      <p className="mt-2 text-base text-slate-800">
        {top
          ? `${top.title}${top.impactText ? `: ${top.impactText}` : ""}${top.firstAt ? `, since ${formatTime(top.firstAt)} IST` : ""}.`
          : data.callCount
            ? `No problems found. ${funnel.due ? `${pct(funnel.reachedShare)} of due calls reached the CRM in ${data.windowLabel}.` : `No call was due at a CRM in ${data.windowLabel}.`}`
            : `No calls in ${data.windowLabel}, and nothing needs action.`}
        {problemPhones > 0 && ` ${problemPhones} of ${licenseTotals.total} phones need attention.`}
      </p>
      <CoverageNote store={data.store} coverage={data.coverage} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />

      <PulsePanel
        pulse={data.pulse}
        now={now}
        href={pulseHref}
        seats={
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Seats</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {int(seats.loggedIn)} / {int(seats.active)} <span className="text-sm font-normal text-slate-500">logged in</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {seats.purchased !== null ? `${int(seats.purchased)} purchased → ` : ""}
              {int(seats.active)} active → {int(seats.assigned)} assigned → {int(seats.loggedIn)} logged in → {int(seats.calling)} calling
            </p>
            {problemPhones > 0 && <p className="mt-1 text-xs font-medium text-amber-800">{problemPhones} phones need attention</p>}
            <p className="mt-1 text-xs">
              <Link href={`${HEALTH_PATH}/seats?client=${clientId}`} className="text-indigo-700 hover:underline">
                {int(seats.idle + seats.loggedOut + seats.unassigned)} unused seats →
              </Link>
            </p>
          </div>
        }
      />

      <Section
        title="Issues"
        note="Open now. CRM rates cover the last 24 hours and say how many days the problem has run; recordings and calls that never reached the CRM stay until they do, back to 30 days. The window picker below doesn't change these."
      >
        <IssueList issues={data.issues} basePath={HEALTH_PATH} now={now} licenseLabels={licenseLabels} empty="Nothing needs attention." />
      </Section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Call journey, {data.windowLabel}</h2>
        <WindowPicker path={path} days={days} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Each step opens its calls, and each drop opens the calls lost there.
        {funnel.noLog > 0 && (
          <>
            {" "}
            <ItemLink href={stageHref("noLog")}>{int(funnel.noLog)} calls</ItemLink> have CRM callouts but no stored ingest log, so they&apos;re missing from the first step.
          </>
        )}
        {funnel.skipped > 0 && (
          <>
            {" "}
            <ItemLink href={stageHref("skipped")}>{int(funnel.skipped)} skipped</ItemLink> for the trial recording limit.
          </>
        )}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Funnel title="Calls to the CRM" steps={funnel.crm} href={stageHref} />
        <Funnel
          title={tenant.takesRecordings ? "Recordings" : "Recordings (no integration takes recordings)"}
          steps={funnel.recording}
          href={stageHref}
        />
      </div>

      <Section
        title={`CRM replies, ${data.windowLabel}`}
        note="Grouped by what we know. What the CRM said is each client's own code, so it's shown as samples and never decides severity."
      >
        <Table head={["What we know", "Calls", "What the CRM said", "Latest"]} empty={data.replies.length ? undefined : "No CRM syncs in this window."}>
          {data.replies.slice(0, 30).map((r) => {
            const drill: Drill = { kind: "syncs", status: r.status, platform: r.platform, http: r.http === null ? "none" : String(r.http) };
            const persistence =
              r.status !== "failed" ? null : r.recovered === 0 ? "persistent: no call recovered" : r.recovered === r.calls ? "transient: every call recovered" : `${int(r.recovered)} of ${int(r.calls)} calls recovered`;
            return (
              <tr key={`${r.platform}|${r.status}|${r.http}`}>
                <td className="px-3 py-2 align-top">
                  <ItemLink href={items(drill)} className={`font-medium ${r.status === "failed" ? "text-red-700" : r.status === "delivered" ? "text-emerald-700" : "text-slate-700"}`}>
                    {r.http === null ? "No response" : `HTTP ${r.http}`} · {r.status}
                  </ItemLink>
                  <p className="text-xs text-slate-500">
                    {r.platform} · {r.eventTypes.join(", ")}
                    {persistence && ` · ${persistence}`}
                    {r.retriedCalls > 0 && ` · ${int(r.retriedCalls)} calls retried`}
                    {r.p50Ms !== null && ` · median ${int(r.p50Ms)} ms`}
                  </p>
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {int(r.calls)}
                  <p className="text-xs text-slate-400">{int(r.events)} attempts</p>
                </td>
                <td className="min-w-80 px-3 py-2 align-top text-xs text-slate-600">
                  {r.samples.map((s) => (
                    <p key={s.label}>
                      <ItemLink href={items({ ...drill, label: s.label })}>{s.label}</ItemLink> <span className="text-slate-400">×{int(s.count)}</span>
                    </p>
                  ))}
                  {data.suggestions
                    .filter((s) => r.samples.some((x) => x.label.toLowerCase().includes(s.pattern.toLowerCase())))
                    .map((s) => (
                      <p key={s.id} className="mt-1 rounded bg-sky-50 px-2 py-1 text-sky-900">
                        <span className="font-medium">Suggestion ({s.category}):</span> {s.suggestion}
                      </p>
                    ))}
                </td>
                <td className={`${td} text-xs text-slate-500`}>{formatTime(r.lastAt)}</td>
              </tr>
            );
          })}
        </Table>
        {failedReplies.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            <ItemLink href={items({ kind: "syncs", status: "failed" })}>All failed syncs</ItemLink> · Suggestions appear here once the owner adds them for a reply pattern.
          </p>
        )}
      </Section>

      <Section
        title="Licenses"
        note={`${tenant.loggedIn} of ${tenant.licenses} logged in. Worst first. Agents' names are read live from CallAnchor, never stored.${data.historyStart ? ` Calls are linked to phones from ${formatTime(data.historyStart)} IST; older calls have no phone.` : ""}`}
      >
        <Table head={["Phone", "Agent", "Status", "Calls 24h", "Reached CRM", "CRM sync, 7 days", "Recorded / uploaded", "App", "Device"]} empty={data.licenses.length ? undefined : "No licenses stored yet."}>
          {[...data.licenses]
            .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.calls24h - a.calls24h)
            .map((h) => {
              const l = h.license;
              const reached = h.pulse.reached;
              return (
                <tr key={l.licenseId}>
                  <td className={td}>
                    <Link href={licenseHref(HEALTH_PATH, l.licenseId)} className="font-mono text-xs font-medium text-indigo-700 hover:underline">…{l.last4}</Link>
                    <p className="text-xs text-slate-400">{l.isLoggedIn ? "logged in" : "logged out"}{l.isActive === false ? " · inactive" : ""}</p>
                  </td>
                  <td className={td}>{data.agents[l.licenseId] ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-3 py-2 align-top text-xs">
                    <StatusBadge status={h.status} />
                    {h.issues[0] && <p className="mt-0.5 text-slate-600">{h.issues[0].title}{h.issues.length > 1 ? ` +${h.issues.length - 1}` : ""}</p>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {int(h.calls24h)}
                    <p className="text-xs text-slate-400">{h.learning ? "learning" : h.perDay === null ? "" : `usual ${Math.round(h.perDay)}/day`}</p>
                    <p className="text-xs text-slate-400">last {ago(h.lastCallAt, now)}</p>
                  </td>
                  <td className={`${td} text-right tabular-nums ${rateClass(reached.share)}`}>
                    {pct(reached.share)}
                    {reached.due > 0 && <p className="text-xs font-normal text-slate-400">{int(reached.delivered)} of {int(reached.due)}</p>}
                  </td>
                  <td className={td}>
                    <DayStrip days={h.pulse.days.slice(-7)} size="sm" />
                    <p className="mt-0.5 text-xs text-slate-500">last sync {h.pulse.lastSyncAt ? ago(h.pulse.lastSyncAt, now) : "never"}</p>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{int(h.recorded24h)} / {int(h.uploaded24h)}</td>
                  <td className={`${td} text-xs text-slate-500`}>{l.appVersion ?? "—"}</td>
                  <td className={`${td} text-xs text-slate-500`}>{[l.deviceBrand, l.deviceModel].filter(Boolean).join(" ") || "—"}</td>
                </tr>
              );
            })}
        </Table>
      </Section>

      <Section title="CRM syncs over time" note="Every attempt, split by HTTP class.">
        <SyncTrend buckets={data.trend} hourly={data.trendHourly} />
      </Section>

      <Section
        title="Integrations"
        note="Each CRM on its own: when it last accepted a call, and every switch-off or event change seen in the last 30 days. Changes are seen when the dashboard reads the tenant."
      >
        <Table head={["Platform", "State", "Last good sync", "Schedule", "Events sent", "Last health check", "Connected"]} empty={data.integrations.length ? undefined : "No integrations configured."}>
          {data.integrations.map((i) => (
            <tr key={i.platformId}>
              <td className={td}>
                {i.platformName}
                {i.isCustom && <span className="ml-1 text-xs text-slate-400">custom</span>}
              </td>
              <td className={`${td} ${i.active ? "text-emerald-700" : "text-slate-400"}`}>
                {i.active ? "Active" : "Inactive"}
                {i.changes.map((c) => (
                  <p key={`${c.at}|${c.field}`} className="text-xs text-slate-500">
                    {c.field === "active" ? (c.newValue === "true" ? "Switched on" : "Switched off") : c.field === "event_types" ? "Events changed" : c.field === "added" ? "Added" : "Removed"} {ago(c.at, now)}
                  </p>
                ))}
              </td>
              <td className={`${td} text-xs`}>
                {i.lastSyncAt ? (
                  <ItemLink href={items({ kind: "syncs", status: "delivered", platform: i.platformId })}>{ago(i.lastSyncAt, now)}</ItemLink>
                ) : (
                  <span className="text-amber-800">never stored</span>
                )}
                {i.lastCalloutAt && i.lastCalloutAt !== i.lastSyncAt && <p className="text-slate-500">last callout {ago(i.lastCalloutAt, now)}</p>}
              </td>
              <td className={td}>
                {i.frequency ?? "—"}
                {i.schedulerEnabled === false && " (off)"}
              </td>
              <td className={`${td} text-xs`}>{i.eventTypes.length ? i.eventTypes.join(", ") : "all (none listed)"}</td>
              <td className={`${td} text-xs text-slate-500`}>{i.lastHealthCheck ? `${formatTime(i.lastHealthCheck)} (${ago(i.lastHealthCheck, now)})` : "—"}</td>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(i.connectedAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Collapsed title="Account">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Calls, lifetime"
            value={int(data.contacts?.totalCalls)}
            detail={
              data.contacts
                ? `${int(data.contacts.outgoing)} out · ${int(data.contacts.incoming)} in · ${int(data.contacts.missed)} missed · ${pct(data.contacts.answerRate)} answered`
                : "Call stats unavailable"
            }
          />
          <Tile label="Recordings" value={int(tenant.recordedCalls)} detail={`${int(tenant.pendingRecordings)} pending · limit ${tenant.recordingLimit === null ? "none set" : int(tenant.recordingLimit)}`} />
          <Tile
            label="CRM syncs, lifetime"
            value={<span className={rateClass(data.lifetime?.total ? data.lifetime.successRate : null)}>{pct(data.lifetime?.total ? data.lifetime.successRate : null)}</span>}
            detail={data.lifetime ? `${int(data.lifetime.delivered)} delivered · ${int(data.lifetime.failed)} failed` : "Not pulled yet"}
          />
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
      </Collapsed>

      <Collapsed title="System log sources">
        <Table head={["Source", "Severity", "Events", "Latest", "Example message"]} empty={data.sources.length ? undefined : "No system logs in this window."}>
          {data.sources.map((s) => (
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
      </Collapsed>

      <Collapsed title="Recent activity (audit log)">
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
      </Collapsed>
    </>
  );
}
