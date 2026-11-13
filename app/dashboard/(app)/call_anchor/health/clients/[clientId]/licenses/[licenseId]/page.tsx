import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadLicense } from "@/lib/callanchor/health";
import type { CallStage } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession, storedCookie } from "@/lib/callanchor/session";
import { ago, formatHour, formatTime, int, itemsHref, licenseHref } from "../../../../format";
import { Funnel, IssueList, JourneyRollup, ItemLink, Json, PulsePanel, Section, StatusBadge, Table, Tile, td } from "../../../../parts";

export const metadata: Metadata = { title: "License" };

// One phone: its status and issues, its calls against its 7-day baseline, its device and settings, and
// every change to them. From the store; the agent's name is read live and never stored.

const ID_PATTERN = /^[\w-]{1,100}$/;

export default async function LicensePage({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/licenses/[licenseId]">) {
  const { clientId, licenseId } = await params;
  if (!ID_PATTERN.test(licenseId) || !ID_PATTERN.test(clientId)) notFound();
  const path = licenseHref(HEALTH_PATH, licenseId, clientId);
  const { member, profile } = await requireCallAnchorSession(path);
  const cookie = profile ? await storedCookie(member.id) : null;
  const data = await loadLicense(licenseId, cookie);
  if (!data) notFound();
  // A phone is always shown under its own client.
  if (data.license.clientId !== clientId) redirect(licenseHref(HEALTH_PATH, licenseId, data.license.clientId));

  const now = Date.parse(data.loadedAt);
  const { license: l, health } = data;
  const calls = (stage: CallStage, window = 1) => itemsHref(HEALTH_PATH, { kind: "calls", stage, license: licenseId }, { client: l.clientId, window });
  const peak = Math.max(1, ...data.hourly.map((h) => Math.max(h.calls, h.baseline)));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          Phone <span className="font-mono">…{l.last4}</span>
        </h1>
        {health && <StatusBadge status={health.status} />}
        <span className="text-sm text-slate-500">
          {data.agent ?? (cookie ? "Unassigned" : "Agent shown when CallAnchor is connected")} · {l.isLoggedIn ? "logged in" : "logged out"}
          {l.isActive === false ? " · inactive" : ""}
        </span>
      </div>
      {health?.learning && (
        <p className="mt-1 text-sm text-slate-500">
          Learning: rules that compare against this phone&apos;s usual calls need about 7 days of stored history
          {health.baselineSince ? `, counted from ${formatTime(health.baselineSince)} IST (the first linked call, or the last agent change)` : " first"}.
        </p>
      )}

      <Section title="Call journey, last 24 hours" note="Where this phone's calls stop between the phone and the CRM. Every number opens its calls.">
        <JourneyRollup journey={data.journey} href={calls} lastComplete={health?.pulse.lastComplete ?? null} now={now} />
      </Section>

      {health && <PulsePanel pulse={health.pulse} now={now} href={calls} />}
      {health && (
        <p className="mt-2 text-xs text-slate-500">
          A dot on a day marks a change to the phone that day, such as an app update or a new agent; hover the day to see it.
        </p>
      )}

      <Section title="Issues">
        <IssueList issues={health?.issues ?? []} basePath={HEALTH_PATH} now={now} empty="Nothing needs attention for this phone." />
      </Section>

      <Section title="Last 24 hours" note="Calls per hour, against this phone's average for that hour over the previous 7 days.">
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Step-by-step counts</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
            <Funnel title="Calls to the CRM" steps={data.funnel.crm} href={calls} />
            <Funnel title="Recordings" steps={data.funnel.recording} href={calls} />
          </div>
        </details>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-600" />Calls today</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-slate-400" />Usual for the hour</span>
            <span className="ml-auto text-slate-400">{int(data.calls)} calls in 24 hours</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-0.5 border-b border-slate-300">
            {data.hourly.map((h) => (
              <div key={h.start} className="relative flex h-full min-w-0 flex-1 items-end" title={`${formatHour(h.start)}: ${h.calls} calls, usually ${h.baseline.toFixed(1)}`}>
                <div className="w-full rounded-t bg-slate-600" style={{ height: h.calls ? `${(h.calls / peak) * 100}%` : "0" }} />
                {h.baseline > 0 && <div className="absolute inset-x-0 h-0.5 bg-slate-400" style={{ bottom: `${(h.baseline / peak) * 100}%` }} />}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-0.5 text-[10px] text-slate-400">
            {data.hourly.map((h, i) => (
              <span key={h.start} className="min-w-0 flex-1 truncate">{i % 4 === 0 ? formatHour(h.start) : ""}</span>
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
