import type { Metadata } from "next";
import { phoneText } from "@/lib/callanchor/labels";
import { notFound, redirect } from "next/navigation";
import { customBounds, loadLicense, rangeFrom } from "@/lib/callanchor/health";
import { RULES, type CallStage } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession, storedCookie } from "@/lib/callanchor/session";
import { ago, formatDay, formatHour, formatTime, int, itemsHref, licenseHref } from "../../../../format";
import { CompareStrip, RangePicker } from "../../../../range-ui";
import { Funnel, IssueList, JourneyRollup, ItemLink, Json, PulsePanel, Section, StatusBadge, Table, Tile, td } from "../../../../parts";

export const metadata: Metadata = { title: "License" };

// One phone: its status and issues, its calls against its 7-day baseline, its device and settings, and
// every change to them. From the store; the agent's name is read live and never stored.

const ID_PATTERN = /^[\w-]{1,100}$/;

export default async function LicensePage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/licenses/[licenseId]">) {
  const [{ clientId, licenseId }, query] = await Promise.all([params, searchParams]);
  if (!ID_PATTERN.test(licenseId) || !ID_PATTERN.test(clientId)) notFound();
  const path = licenseHref(HEALTH_PATH, licenseId, clientId);
  const { member, profile } = await requireCallAnchorSession(path);
  const cookie = profile ? await storedCookie(member.id) : null;
  // The picked range, Today by default, drives the journey and the chart (owner, 2026-11-19).
  const range = rangeFrom(query);
  const data = await loadLicense(licenseId, cookie, range);
  if (!data) notFound();
  // A phone is always shown under its own client.
  if (data.license.clientId !== clientId) redirect(licenseHref(HEALTH_PATH, licenseId, data.license.clientId));

  const now = Date.parse(data.loadedAt);
  const { license: l, health } = data;
  // The journey's numbers open the range's calls; the pulse's fixed spans (1, 7, 30 days) keep theirs.
  const calls = (stage: CallStage) => itemsHref(HEALTH_PATH, { kind: "calls", stage, license: licenseId }, { client: l.clientId, range: data.range });
  const pulseCalls = (stage: CallStage, window = 1) => itemsHref(HEALTH_PATH, { kind: "calls", stage, license: licenseId, window: String(window) }, { client: l.clientId });
  const peak = Math.max(1, ...data.chart.map((h) => Math.max(h.calls, h.baseline)));
  const cellLabel = (start: string) => (data.hourlyCells ? formatHour(start) : formatDay(start));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          Phone <span className="font-mono">{phoneText(l)}</span>
        </h1>
        {health && <StatusBadge status={health.status} />}
        <span className="text-sm text-slate-500">
          {data.agent ?? (cookie ? "Unassigned" : "Agent shown when CallAnchor is connected")} · {l.isLoggedIn ? "logged in" : "logged out"}
          {l.isActive === false ? " · inactive" : ""}
        </span>
      </div>
      {health?.learning && (
        <p className="mt-1 text-sm text-slate-500">
          {health.newAgent ? "This phone got a new agent" : "We started tracking this phone"}
          {health.baselineSince ? ` on ${formatTime(health.baselineSince)} IST` : ""}. Once {health.newAgent ? "they have" : "it has"} a full day of calls we can warn you
          if {health.newAgent ? "they stop" : "it stops"} making calls
          {health.baselineSince ? ` (from ${formatTime(new Date(Date.parse(health.baselineSince) + RULES.baselineWindows[0] * 86_400_000).toISOString())} IST)` : ""}. Everything else is checked as normal.
        </p>
      )}
      {health && !health.learning && health.windowDays !== null && health.windowDays < RULES.baselineDays && (
        <p className="mt-1 text-sm text-slate-500">
          Its usual calls a day come from its last {health.windowDays === 1 ? "day" : `${health.windowDays} days`}, as that&apos;s all we have so far
          {health.baselineSince ? `; from ${formatTime(new Date(Date.parse(health.baselineSince) + RULES.baselineWindows.find((d) => d > health.windowDays!)! * 86_400_000).toISOString())} IST it uses ${RULES.baselineWindows.find((d) => d > health.windowDays!)} days` : ""}.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <RangePicker range={range} path={path} query={query} bounds={customBounds()} />
      </div>
      <Section title={`Call journey, ${data.range.label}`} note="Where this phone's calls stop between the phone and the CRM. Every number opens its calls.">
        <CompareStrip totals={data.totals} comparison={data.comparison} />
        <JourneyRollup journey={data.journey} href={calls} lastComplete={health?.pulse.lastComplete ?? null} now={now} />
      </Section>

      {health && <PulsePanel pulse={health.pulse} now={now} href={pulseCalls} />}
      {health && (
        <p className="mt-2 text-xs text-slate-500">
          A dot on a day marks a change to the phone that day, such as an app update or a new agent; hover the day to see it.
        </p>
      )}

      <Section title="Issues">
        <IssueList issues={health?.issues ?? []} basePath={HEALTH_PATH} now={now} empty="Nothing needs attention for this phone." />
      </Section>

      <Section
        title={`Calls, ${data.range.label}`}
        note={
          data.priorDays > 0
            ? `Calls per ${data.hourlyCells ? "hour, against this phone's average for that hour" : "day, against this phone's average day"} over the ${data.priorDays === 1 ? "day" : `${data.priorDays} days`} before the range.`
            : `Calls per ${data.hourlyCells ? "hour" : "day"}. No earlier full day yet to compare with.`
        }
      >
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Step-by-step counts</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
            <Funnel title="Calls to the CRM" steps={data.funnel.crm} href={calls} />
            <Funnel title="Recordings" steps={data.funnel.recording} href={calls} />
          </div>
        </details>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-600" />Calls</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-slate-400" />Usual for the {data.hourlyCells ? "hour" : "day"}</span>
            <span className="ml-auto text-slate-400">{int(data.calls)} calls {data.range.inText}</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-0.5 border-b border-slate-300">
            {data.chart.map((h) => (
              <div key={h.start} className="relative flex h-full min-w-0 flex-1 items-end" title={`${cellLabel(h.start)}: ${h.calls} calls, usually ${h.baseline.toFixed(1)}`}>
                <div className="w-full rounded-t bg-slate-600" style={{ height: h.calls ? `${(h.calls / peak) * 100}%` : "0" }} />
                {h.baseline > 0 && <div className="absolute inset-x-0 h-0.5 bg-slate-400" style={{ bottom: `${(h.baseline / peak) * 100}%` }} />}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-0.5 text-[10px] text-slate-400">
            {data.chart.map((h, i) => (
              <span key={h.start} className="min-w-0 flex-1 truncate">{i % (data.hourlyCells ? 4 : 1) === 0 ? cellLabel(h.start) : ""}</span>
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm">
          <ItemLink href={calls("all")}>All of this phone&apos;s calls</ItemLink>
        </p>
      </Section>

      <Section title="Device, app and settings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Device" value={[l.deviceBrand, l.deviceModel].filter(Boolean).join(" ") || "—"} detail={`Firmware ${l.firmware ?? "—"} · Google dialer ${l.googleDialer === null ? "—" : l.googleDialer ? "yes" : "no"}`} />
          <Tile label="App" value={l.appVersion ?? "—"} detail={l.appVersionCode !== null ? `version code ${l.appVersionCode}` : undefined} />
          <Tile label="Recording" value={l.recordingEnabled === null ? "Client default" : l.recordingEnabled ? "On" : "Off"} detail={`Call capture policy: ${l.callPolicy ?? "default"}`} />
          <Tile label="Calls, lifetime" value={int(l.lifetimeCalls)} detail={`Last login ${l.lastLoginLabel ?? "never"} · last call ${ago(health?.lastCallAt, now)}`} />
        </div>
      </Section>

      <Section title="History" note="Every change seen to this phone since the store began tracking it. Changes are only seen when the dashboard reads the tenant.">
        <Table head={["When (IST)", "What", "From", "To"]} empty={data.changes.length ? undefined : `No changes seen since ${formatTime(l.firstSeenAt)} IST.`}>
          {data.changes.map((c, i) => (
            <tr key={i}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(c.at)}</td>
              <td className={td}>{c.label}</td>
              <td className={`${td} text-xs text-slate-500`}>{c.field === "member_id" ? (c.oldValue ? "a member" : "nobody") : (c.oldValue ?? "—")}</td>
              <td className={`${td} text-xs`}>{c.field === "member_id" ? (c.newValue ? "another member" : "nobody") : (c.newValue ?? "—")}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Portal events"
        note="What happened to this phone in CallAnchor's portal and app: settings changes, activation, logins and logouts, with who did it. From the stored audit log."
      >
        <Table head={["When (IST)", "Event", "By", "Details"]} empty={data.portal.length ? undefined : "No portal events stored for this phone."}>
          {data.portal.map((a) => (
            <tr key={a.id}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(a.occurredAt)}</td>
              <td className={td}>
                {a.action} {a.resourceType.replace(/_/g, " ")}
              </td>
              <td className={`${td} text-xs text-slate-500`}>{a.actorType ?? "—"}</td>
              <td className={`${td} text-xs`}>{a.raw ? <Json value={a.raw} label="Event and metadata" /> : "—"}</td>
            </tr>
          ))}
        </Table>
      </Section>

    </div>
  );
}
