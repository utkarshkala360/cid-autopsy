import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadCall, type AnchorResult } from "@/lib/callanchor/health";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { ago, formatTime, int } from "../../format";
import { Json, Section, Table, td } from "../../parts";

export const metadata: Metadata = { title: "Call timeline" };

// One call through the stored system logs and CRM callouts, in order, then each CRM request read
// live from CallAnchor with its payload and replies. GETs only; payloads aren't stored.

const ID_PATTERN = /^[\w-]{1,100}$/;

const seconds = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CallTimelinePage({ params }: PageProps<"/dashboard/call_anchor_config/health/calls/[callId]">) {
  const { callId } = await params;
  if (!ID_PATTERN.test(callId)) notFound();
  const path = `${HEALTH_PATH}/calls/${callId}`;
  const { member, profile } = await requireCallAnchorSession(path);
  const cookie = profile ? await storedCookie(member.id) : null;

  const call = await loadCall(callId, cookie);
  const now = Date.parse(call.loadedAt);
  type Step = { id: string; at: string; kind: "Log" | "CRM callout"; what: string; outcome: string; bad: boolean; text: string; raw?: unknown; requestId?: string | null };
  const steps: Step[] = [
    ...call.logs.map((l) => ({
      id: l.id,
      at: l.occurredAt,
      kind: "Log" as const,
      what: l.source,
      outcome: [l.severity, l.detail].filter(Boolean).join(" · "),
      bad: l.severity !== "info",
      text: l.message,
      raw: l.raw,
    })),
    ...call.callouts.map((e) => ({
      id: e.id,
      at: e.at,
      kind: "CRM callout" as const,
      what: `${e.eventType} → ${e.platformId}`,
      outcome: `${e.status}${e.callAnchorStatus !== e.status ? ` (CallAnchor: ${e.callAnchorStatus})` : ""}${e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""}${e.attempt > 1 ? ` · attempt ${e.attempt}` : ""}`,
      bad: e.status === "failed",
      text: `${e.label}${e.durationMs !== null ? ` (${int(e.durationMs)} ms)` : ""}`,
      requestId: e.requestId,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const first = steps[0] ? Date.parse(steps[0].at) : 0;
  const reached = [...new Set(call.callouts.filter((e) => e.status === "delivered").map((e) => e.eventType))];
  const loaded = new Set(call.requests.filter((r) => r.log).map((r) => r.requestId));

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: CALLANCHOR_PATH, label: "CallAnchor Config" },
          { href: HEALTH_PATH, label: "Client health" },
          ...(call.clientId ? [{ href: `${HEALTH_PATH}/${call.clientId}`, label: call.companyName ?? call.clientId }] : []),
        ]}
      />
      <h1 className="text-xl font-semibold text-slate-900">
        Call <span className="font-mono text-base">{callId}</span>
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {steps.length
          ? `${int(call.logs.length)} system logs and ${int(call.callouts.length)} CRM callouts stored, from ${formatTime(steps[0].at)} IST (${ago(steps[0].at, now)}).`
          : "Nothing stored for this call. CallAnchor keeps system logs for about 3 days, and the store keeps 90."}
      </p>

      {steps.length > 0 && (
        <div className="mt-4 grid gap-1 text-sm">
          {call.problem ? (
            <p className="text-amber-800">
              <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">Flagged</span>
              {call.problem.stage}, since {formatTime(call.problem.since)} IST
            </p>
          ) : (
            <p className="text-slate-600">Not flagged by the recording pipeline.</p>
          )}
          {call.takesRecordings !== null && (
            <p className="text-slate-500">
              {call.takesRecordings
                ? `This client's integration takes recordings. ${reached.length ? `Reached the CRM: ${reached.join(", ")}.` : "Nothing reached the CRM for this call."}`
                : "No active integration for this client takes recordings."}
            </p>
          )}
        </div>
      )}

      <Section title="Timeline" note="Oldest first. The second column is the time since the first entry. Open a log's metadata, or jump to a callout's payload and replies.">
        <Table head={["When (IST)", "+ seconds", "Type", "What", "Outcome", "Message, reply or error"]} empty={steps.length ? undefined : "No entries."}>
          {steps.map((s) => (
            <tr key={`${s.kind}|${s.id}`}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(s.at)}</td>
              <td className={`${td} text-right text-xs tabular-nums text-slate-500`}>{seconds.format((Date.parse(s.at) - first) / 1000)}</td>
              <td className={`${td} text-xs`}>{s.kind}</td>
              <td className={`${td} text-xs`}>{s.what}</td>
              <td className={`${td} text-xs ${s.bad ? "font-medium text-red-700" : ""}`}>{s.outcome}</td>
              <td className="min-w-80 max-w-2xl px-3 py-2 align-top text-slate-700">
                {s.text}
                {s.kind === "Log" &&
                  (s.raw ? (
                    <Json value={s.raw} label="Metadata and full log line" />
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Stored before full log lines were kept, so only the summary above exists.</p>
                  ))}
                {s.requestId && loaded.has(s.requestId) && (
                  <a href={`#request-${s.requestId}`} className="mt-1 block text-xs font-medium text-indigo-700 hover:underline">
                    Payload and CRM reply ↓
                  </a>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="CRM requests"
        note="Read live from CallAnchor: what was sent, where, and every attempt with the CRM's reply or error. Not stored in the portal."
      >
        {!cookie ? (
          <p className="text-sm text-slate-500">
            CallAnchor isn&apos;t connected, so payloads can&apos;t be read.{" "}
            <Link href={verifyUrl(path)} className="text-indigo-700 hover:underline">Verify CallAnchor</Link> to see them.
          </p>
        ) : call.requests.length === 0 ? (
          <p className="text-sm text-slate-500">
            {call.missingRequestIds > 0
              ? "These callouts were stored before request ids were kept. The next 5-day refresh adds them; reload in a few minutes."
              : "No CRM callouts for this call."}
          </p>
        ) : (
          <div className="space-y-4">
            {call.requests.map((r) => (
              <Request key={r.requestId} result={r} retry={verifyUrl(path)} />
            ))}
            {call.missingRequestIds > 0 && (
              <p className="text-sm text-slate-500">
                {int(call.missingRequestIds)} more callouts were stored before request ids were kept; the next 5-day refresh adds them.
              </p>
            )}
          </div>
        )}
      </Section>

      {call.clientId && (
        <p className="mt-6 text-sm">
          <Link href={`${HEALTH_PATH}/${call.clientId}`} className="text-indigo-700 hover:underline">
            Back to {call.companyName}
          </Link>
        </p>
      )}
    </div>
  );
}

function Request({ result, retry }: { result: AnchorResult; retry: string }) {
  const { log } = result;
  if (!log) {
    return (
      <div id={`request-${result.requestId}`} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <p className="font-mono text-xs text-slate-500">Request {result.requestId}</p>
        <p className="mt-1 text-red-700">
          Couldn&apos;t read it from CallAnchor ({result.error}).{" "}
          {result.error === "HTTP 401" || result.error === "HTTP 403" ? (
            <Link href={retry} className="text-indigo-700 hover:underline">Verify CallAnchor again</Link>
          ) : (
            "Reload to try again."
          )}
        </p>
      </div>
    );
  }
  const { request, events, platform } = log;
  const attempts = [...events].sort((a, b) => a.attempt - b.attempt || a.at.localeCompare(b.at));
  return (
    <div id={`request-${result.requestId}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold text-slate-900">{request.eventType.replace("_", ".")}</h3>
        <span className={`text-sm ${request.status === "failed" ? "font-medium text-red-700" : request.status === "delivered" ? "text-emerald-700" : "text-slate-600"}`}>
          {request.status}
        </span>
        <span className="text-sm text-slate-500">
          {platform?.name ?? attempts[0]?.platformId}
          {platform?.isCustom ? " (custom)" : ""} · {int(request.attemptCount ?? attempts.length)} attempts
        </span>
        <span className="font-mono text-xs text-slate-400">request {request.id}</span>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-[max-content_1fr]">
        <dt className="text-slate-400">Endpoint</dt>
        <dd className="break-all font-mono">{request.endpoint}</dd>
        <dt className="text-slate-400">Created</dt>
        <dd>{formatTime(request.createdAt)} IST</dd>
        <dt className="text-slate-400">Completed</dt>
        <dd>{request.completedAt ? `${formatTime(request.completedAt)} IST` : "—"}</dd>
      </dl>
      <Json value={request.payloadJson ?? attempts[0]?.payloadPreview ?? null} label="Payload sent" open />
      {log.call && <Json value={log.call} label="Call record" />}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["Attempt", "When (IST)", "Status", "HTTP", "Time", "CRM record", "Reply or error"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className={`${td} tabular-nums`}>{a.attempt}</td>
                <td className={`${td} text-xs text-slate-500`}>{formatTime(a.at)}</td>
                <td className={`${td} ${a.status === "failed" ? "font-medium text-red-700" : a.status === "delivered" ? "text-emerald-700" : ""}`}>{a.status}</td>
                <td className={`${td} tabular-nums`}>{a.httpStatus ?? "—"}</td>
                <td className={`${td} text-xs tabular-nums text-slate-500`}>{a.durationMs == null ? "—" : `${int(a.durationMs)} ms`}</td>
                <td className={`${td} font-mono text-xs`}>{a.externalRecordId ?? "—"}</td>
                <td className="min-w-96 max-w-2xl px-3 py-2 align-top">
                  {a.errorMessage && <Json value={a.errorMessage} label="Error" open />}
                  {a.responsePreview && <Json value={a.responsePreview} label="CRM reply" open={!a.errorMessage} />}
                  {!a.errorMessage && !a.responsePreview && <span className="text-xs text-slate-400">No reply recorded</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
