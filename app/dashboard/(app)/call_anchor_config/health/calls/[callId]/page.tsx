import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadCall } from "@/lib/callanchor/health";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { ago, formatTime, int } from "../../format";
import { Section, Table, td } from "../../parts";

export const metadata: Metadata = { title: "Call timeline" };

// One call through the stored system logs and CRM callouts, in order. Read from the store only.

const ID_PATTERN = /^[\w-]{1,100}$/;

const seconds = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CallTimelinePage({ params }: PageProps<"/dashboard/call_anchor_config/health/calls/[callId]">) {
  const { callId } = await params;
  if (!ID_PATTERN.test(callId)) notFound();
  await requireCallAnchorSession(`${HEALTH_PATH}/calls/${callId}`);

  const call = await loadCall(callId);
  const now = Date.parse(call.loadedAt);
  type Step = { id: string; at: string; kind: "Log" | "CRM callout"; what: string; outcome: string; bad: boolean; text: string };
  const steps: Step[] = [
    ...call.logs.map((l) => ({
      id: l.id,
      at: l.occurredAt,
      kind: "Log" as const,
      what: l.source,
      outcome: [l.severity, l.detail].filter(Boolean).join(" · "),
      bad: l.severity !== "info",
      text: l.message,
    })),
    ...call.callouts.map((e) => ({
      id: e.id,
      at: e.at,
      kind: "CRM callout" as const,
      what: `${e.eventType} → ${e.platformId}`,
      outcome: `${e.status}${e.callAnchorStatus !== e.status ? ` (CallAnchor: ${e.callAnchorStatus})` : ""}${e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""}${e.attempt > 1 ? ` · attempt ${e.attempt}` : ""}`,
      bad: e.status === "failed",
      text: `${e.label}${e.durationMs !== null ? ` (${int(e.durationMs)} ms)` : ""}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const first = steps[0] ? Date.parse(steps[0].at) : 0;
  const reached = [...new Set(call.callouts.filter((e) => e.status === "delivered").map((e) => e.eventType))];

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

      <Section title="Timeline" note="Oldest first. The second column is the time since the first entry.">
        <Table head={["When (IST)", "+ seconds", "Type", "What", "Outcome", "Message, reply or error"]} empty={steps.length ? undefined : "No entries."}>
          {steps.map((s) => (
            <tr key={`${s.kind}|${s.id}`}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(s.at)}</td>
              <td className={`${td} text-right text-xs tabular-nums text-slate-500`}>{seconds.format((Date.parse(s.at) - first) / 1000)}</td>
              <td className={`${td} text-xs`}>{s.kind}</td>
              <td className={`${td} text-xs`}>{s.what}</td>
              <td className={`${td} text-xs ${s.bad ? "font-medium text-red-700" : ""}`}>{s.outcome}</td>
              <td className="min-w-80 px-3 py-2 align-top text-slate-700">{s.text}</td>
            </tr>
          ))}
        </Table>
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
