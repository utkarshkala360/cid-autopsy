import Link from "next/link";
import type { CoverageSummary, Drill, FunnelStep, JourneyStep, Level } from "@/lib/callanchor/health";
import type { CallStage, Day, Issue, IssueLevel, JourneySummary, LicenseStatus, Pulse } from "@/lib/callanchor/issues";
import type { ReplySuggestion, StoreStatus } from "@/lib/callanchor/store";
import { badgeClass, cardClass, secondaryButtonClass } from "@/components/ui";
import { StatCell, type IconName, type Tone } from "./ui";
import { EstimatedProgress } from "./Progress";
import { DAY_STATES, ISSUE_LEVELS, LEVELS, LICENSE_STATUSES, TRENDS, ago, formatDay, formatHour, formatTime, int, issueHref, itemsHref, pct, rateClass } from "./format";

// How complete and fresh the stored data is: last pull, stream errors, calls missing their ingest
// log (finding D), empty hours and the snapshot's age. Replaces the raw store note.
export function CoverageNote({ store, coverage, pullErrors, now, tookMs }: { store: StoreStatus; coverage: CoverageSummary; pullErrors: string[]; now: number; tookMs: number }) {
  const thin: string[] = [];
  if (coverage.callsWithoutLog > 0) {
    const share = Math.round((coverage.callsWithoutLog / Math.max(1, coverage.callsWithCallouts)) * 100);
    thin.push(`${int(coverage.callsWithoutLog)} of ${int(coverage.callsWithCallouts)} calls with CRM callouts in 24 hours (${share}%) have no stored ingest log, so recording counts undercount`);
  }
  // Hours with CRM callouts but no system logs at all: the log pull fell behind there.
  const gaps = coverage.hourly.filter((h) => h.callouts > 0 && h.logs === 0).length;
  if (gaps > 0) thin.push(`${gaps} of the last 24 hours have CRM callouts but no system logs`);
  if (coverage.snapshotAt && now - Date.parse(coverage.snapshotAt) > 60 * 60_000) thin.push(`client details are ${ago(coverage.snapshotAt, now)} old`);
  if (coverage.streamErrors.length) thin.push(`${coverage.streamErrors.length} stream${coverage.streamErrors.length === 1 ? "" : "s"} failed on the last pull (${[...new Set(coverage.streamErrors.map((e) => e.error))].slice(0, 2).join("; ")})`);
  return (
    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
      <p>
        Data: pulled {ago(store.pulledAt, now)} · 5-day refresh {ago(store.refreshedAt, now)} · system logs from {formatTime(coverage.logsSince)} IST · loaded in{" "}
        {(tookMs / 1000).toFixed(1)}s
      </p>
      {thin.length > 0 && (
        <p className="text-amber-800">
          <span aria-hidden>! </span>
          <span className="font-medium">Data is thin:</span> {thin.join(" · ")}. This is about our copy of the data, not the client&apos;s health.
        </p>
      )}
      {pullErrors.length > 0 && <p className="text-amber-800">Couldn&apos;t pull everything new, so some numbers may be behind: {pullErrors.join("; ")}.</p>}
    </div>
  );
}

export function HealthBadge({ level }: { level: Level }) {
  const { label, icon, className } = LEVELS[level];
  return (
    <span className={`${badgeClass} inline-flex items-center gap-1 whitespace-nowrap ring-1 ${className}`}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: LicenseStatus | IssueLevel }) {
  const { label, icon, className } = status in LICENSE_STATUSES ? LICENSE_STATUSES[status as LicenseStatus] : ISSUE_LEVELS[status as IssueLevel];
  return (
    <span className={`${badgeClass} inline-flex items-center gap-1 whitespace-nowrap ring-1 ${className}`}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

// Affected calls per hour over the last 24 hours. One series, so the card's title names it.
export function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  if (values.every((v) => v === 0)) return null;
  return (
    <div className="flex h-6 w-24 shrink-0 items-end gap-px" role="img" aria-label={`${label}: ${values.join(", ")} per hour, oldest first`} title={`${label}, per hour over 24 hours`}>
      {values.map((v, i) => (
        <div key={i} className="min-w-0 flex-1 rounded-t-[1px] bg-slate-400" style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : "1px", opacity: v ? 1 : 0.35 }} />
      ))}
    </div>
  );
}

// Links for an issue: its page, and the rows behind it with the issue's evidence above them. A card
// has one link: to the rows when there are any, else to the issue page (QA U1, U2).
export function issueLinks(basePath: string, issue: Issue) {
  const scope = { ...(issue.licenseId ? { license: issue.licenseId } : {}) };
  const page = issueHref(basePath, issue.id, issue.clientId);
  const rows = issue.drill ? itemsHref(basePath, { ...issue.drill, ...scope } as Drill, { client: issue.clientId ?? undefined, issue: issue.id }) : null;
  return { page, rows, primary: rows ?? page };
}

// One issue as a table row: what's wrong in plain words, where, its impact, since when and its
// trend. The title and the last column open its rows (owner, 2026-11-13: rows, not cards).
function IssueRow({ issue, basePath, now, clientName, licenseLabel }: { issue: Issue; basePath: string; now: number; clientName?: string; licenseLabel?: string | null }) {
  const links = issueLinks(basePath, issue);
  return (
    <tr className="hover:bg-slate-50">
      <td className={td}><StatusBadge status={issue.level} /></td>
      <td className="min-w-56 px-3 py-2 align-top">
        <Link href={links.primary} className={rowLinkClass}>{issue.title}</Link>
        {issue.newSinceVisit && <span className="ml-2 whitespace-nowrap rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800">New</span>}
      </td>
      <td className="px-3 py-2 align-top text-slate-700">
        {clientName ?? "—"}
        {licenseLabel && <span className="block font-mono text-xs text-slate-500">phone {licenseLabel}</span>}
      </td>
      <td className="min-w-64 px-3 py-2 align-top text-slate-700">{issue.impactText || "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-600">
        {issue.firstAt ? (
          <>
            {formatTime(issue.firstAt)} IST
            <span className="block text-slate-500">{ago(issue.firstAt, now)}</span>
          </>
        ) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-600">
        {TRENDS[issue.trend]}
        {issue.lastAt && <span className="block text-slate-500">last seen {ago(issue.lastAt, now)}</span>}
      </td>
      <td className="px-3 py-2 align-top"><Spark values={issue.hourly} label={issue.title} /></td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-right">
        <Link href={links.primary} className={secondaryButtonClass}>{links.rows ? "Open items" : "Details"}</Link>
      </td>
    </tr>
  );
}

// An issue's evidence, what the CRM said, suggestions and what to check: above its rows on the items
// page, and on the issue page.
export function IssuePanel({ issue, checklist, suggestions, now, compact = false }: { issue: Issue; checklist: string[]; suggestions: ReplySuggestion[]; now: number; compact?: boolean }) {
  const level = ISSUE_LEVELS[issue.level];
  return (
    <div className={`${cardClass} border-l-4 p-4 ${level.card}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={issue.level} />
        <p className="font-semibold text-slate-900">{issue.title}</p>
        <span className="text-xs text-slate-500">
          {TRENDS[issue.trend]}
          {issue.firstAt && ` · since ${formatTime(issue.firstAt)} IST (${ago(issue.firstAt, now)})`}
          {issue.lastAt && ` · last seen ${ago(issue.lastAt, now)}`}
        </span>
        <Spark values={issue.hourly} label={issue.title} />
      </div>
      <div className={`mt-3 grid gap-4 ${compact ? "lg:grid-cols-2" : ""}`}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What we know</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {issue.impactText && <li>{issue.impactText}</li>}
            {issue.evidence.map((e) => <li key={e}>{e}</li>)}
          </ul>
          {issue.samples.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">What the CRM said (masked samples, never decide severity)</p>
              <ul className="mt-1 space-y-1">
                {issue.samples.map((s) => <li key={s} className="rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{s}</li>)}
              </ul>
            </>
          )}
          {suggestions.map((s) => (
            <p key={s.id} className="mt-2 rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <span className="font-medium">Suggestion ({s.category}):</span> {s.suggestion} <span className="text-xs text-sky-700">({s.author})</span>
            </p>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What to check</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-700">
            {checklist.map((c) => <li key={c}>{c}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

// Days of CRM sync, oldest first: one cell per IST day, with marks such as an app update (QA L4, L11).
export function DayStrip({ days, size = "md" }: { days: Day[]; size?: "sm" | "md" }) {
  const cell = size === "sm" ? "h-4 w-4 text-[9px]" : "h-6 w-6 text-[11px]";
  return (
    <ol className="flex gap-0.5" aria-label="CRM sync by day, oldest first">
      {days.map((d) => {
        const state = DAY_STATES[d.state];
        const rate = d.due ? Math.round((d.delivered / d.due) * 100) : null;
        const title = `${formatDay(`${d.day}T12:00:00+05:30`)}: ${state.label}${d.calls ? ` · ${int(d.calls)} calls, ${int(d.delivered)} of ${int(d.due)} due reached the CRM${rate !== null ? ` (${rate}%)` : ""}` : ""}${d.marks.length ? ` · ${d.marks.join(", ")}` : ""}`;
        return (
          <li key={d.day} title={title} className={`relative flex shrink-0 items-center justify-center rounded-sm font-bold ${cell} ${state.className}`}>
            <span aria-hidden>{state.icon}</span>
            <span className="sr-only">{title}</span>
            {d.marks.length > 0 && <span aria-hidden className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-600 ring-1 ring-white" />}
          </li>
        );
      })}
    </ol>
  );
}

const consistencyText = (c: { synced: number; active: number }) => (c.active ? `${c.synced} of ${c.active}` : "—");

// The same three numbers for a client or a phone (QA section 11): when it last reached the CRM, how
// consistently, and how far its recordings get. Each opens its calls.
export function PulsePanel({ pulse, now, href, seats }: { pulse: Pulse; now: number; href: (stage: CallStage, window?: number) => string; seats?: React.ReactNode }) {
  const { chain } = pulse;
  const steps = [
    { label: "Recorded", count: chain.recorded, stage: "recorded" as const },
    { label: "Uploaded", count: chain.uploaded, stage: "uploaded" as const },
    { label: "Verified", count: chain.verified, stage: "verified" as const },
    { label: "Synced", count: chain.synced, stage: "synced" as const },
  ];
  return (
    <div className={`mt-4 grid gap-3 ${seats ? "lg:grid-cols-4" : "lg:grid-cols-3"} sm:grid-cols-2`}>
      <div className={`${cardClass} p-4`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last good CRM sync</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{pulse.lastSyncAt ? ago(pulse.lastSyncAt, now) : "Never"}</p>
        <p className="mt-1 text-xs text-slate-500">
          {pulse.lastSyncAt ? `${formatTime(pulse.lastSyncAt)} IST` : "No stored call reached the CRM"} · last call {ago(pulse.lastCallAt, now)}
        </p>
        <p className="mt-1 text-xs">
          <ItemLink href={href("due")} className={rateClass(pulse.reached.share)}>
            {pct(pulse.reached.share)} of {int(pulse.reached.due)} due calls
          </ItemLink>{" "}
          <span className="text-slate-500">reached it in 24 hours</span>
        </p>
      </div>
      <div className={`${cardClass} p-4`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Synced days</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">
          {consistencyText(pulse.week)} <span className="text-sm font-normal text-slate-500">days, last 7</span>
        </p>
        <div className="mt-2 overflow-x-auto"><DayStrip days={pulse.days} size="sm" /></div>
        <p className="mt-1 text-xs text-slate-500">30 days: {consistencyText(pulse.month)} days with calls synced. Hover a day for its numbers.</p>
      </div>
      <div className={`${cardClass} p-4`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recording chain, 7 days</p>
        <ol className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-baseline gap-1.5">
              {i > 0 && <span aria-hidden className="text-slate-400">→</span>}
              <ItemLink href={href(s.stage, 7)} className="font-semibold tabular-nums text-slate-900">{int(s.count)}</ItemLink>
              <span className="text-xs text-slate-500">{s.label.toLowerCase()}</span>
            </li>
          ))}
        </ol>
        <p className={`mt-2 text-xs ${pulse.openDrops ? "font-medium text-amber-800" : "text-slate-500"}`}>
          {pulse.openDrops ? (
            <>
              <ItemLink href={href("openDrop", 15)}>{int(pulse.openDrops)} recordings still open</ItemLink> (on the phone, stuck or not synced), kept until fixed
            </>
          ) : (
            "No recording is stuck anywhere along the chain."
          )}
        </p>
      </div>
      {seats}
    </div>
  );
}

export function IssueList({ issues, basePath, now, names, licenseLabels, empty = "Nothing needs action." }: {
  issues: Issue[];
  basePath: string;
  now: number;
  names?: Record<string, string>;
  licenseLabels?: Record<string, string>;
  empty?: string;
}) {
  if (issues.length === 0) return <p className="text-sm text-slate-500"><span aria-hidden className="text-emerald-700">✓ </span>{empty}</p>;
  return (
    <Table head={["Severity", "Issue", "Client · phone", "Impact", "Since", "Status", "Last 24h", ""]}>
      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          basePath={basePath}
          now={now}
          clientName={names && issue.clientId ? names[issue.clientId] : undefined}
          licenseLabel={issue.licenseId ? (licenseLabels?.[issue.licenseId] ?? null) : null}
        />
      ))}
    </Table>
  );
}

// A call journey: each step's count, and the calls lost before the next one.
export function Funnel({ title, steps, href }: { title: string; steps: FunnelStep[]; href: (stage: CallStage) => string }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <Link href={href(step.stage)} className="text-slate-700 hover:text-indigo-700 hover:underline">{step.label}</Link>
              <Link href={href(step.stage)} className="font-semibold tabular-nums text-slate-900 hover:text-indigo-700">{int(step.count)}</Link>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-slate-500" style={{ width: `${Math.min(100, (step.count / top) * 100)}%` }} />
            </div>
            {step.lost && step.lost.count > 0 && (
              <p className="mt-0.5 text-right text-xs text-amber-800">
                <ItemLink href={href(step.lost.stage)}>↓ {int(step.lost.count)} {step.lost.label}</ItemLink>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- The call journey: phone → app → recording uploaded → sent to the CRM → accepted ----

type JourneyState = JourneyStep["state"];
const JOURNEY_STATES: Record<JourneyState, { word: string; ring: string; text: string; line: string }> = {
  done: { word: "Done", ring: "bg-emerald-600 text-white ring-emerald-600", text: "text-emerald-700", line: "bg-emerald-500" },
  stopped: { word: "Stopped here", ring: "bg-red-600 text-white ring-red-600", text: "text-red-700", line: "bg-red-300" },
  waiting: { word: "On its way", ring: "bg-white text-amber-600 ring-amber-400", text: "text-amber-700", line: "bg-slate-200" },
  skipped: { word: "Not needed", ring: "bg-slate-100 text-slate-400 ring-slate-200", text: "text-slate-500", line: "bg-slate-200" },
  unknown: { word: "No record", ring: "bg-white text-slate-400 ring-slate-300", text: "text-slate-500", line: "bg-slate-200" },
};

// Simple outline icons for the five steps, so the row reads without its labels.
const STEP_ICONS: Record<JourneyStep["key"], React.ReactNode> = {
  phone: <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z" />,
  app: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18h2" /></>,
  upload: <><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4 4 0 0 1 0 10" /><path d="M12 12v8M9 15l3-3 3 3" /></>,
  sent: <path d="M3 11.5 21 3l-8.5 18-2.2-7.3z M10.3 13.7 21 3" />,
  crm: <><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
};

function StepIcon({ step, state, count }: { step: JourneyStep["key"]; state: JourneyState; count?: number }) {
  return (
    <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ${JOURNEY_STATES[state].ring}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {STEP_ICONS[step]}
      </svg>
      {count !== undefined && count > 0 && (
        <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white ring-2 ring-white">{int(count)}</span>
      )}
    </span>
  );
}

// One call's journey: each step with its state, time, the wait since the step before, one plain
// sentence, and the ids that tie it to the next step.
export function CallJourney({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="grid gap-6 sm:grid-cols-5 sm:gap-3">
      {steps.map((step, i) => {
        const style = JOURNEY_STATES[step.state];
        const previous = steps.slice(0, i).findLast((s) => s.at)?.at ?? null;
        const gap = step.at && previous && step.state === "done" ? Date.parse(step.at) - Date.parse(previous) : null;
        const next = steps[i + 1];
        return (
          <li key={step.key} className="relative flex gap-3 sm:block">
            {next && (
              <span
                aria-hidden
                className={`absolute left-5 top-10 -ml-px h-[calc(100%+0.5rem)] w-0.5 sm:left-1/2 sm:top-5 sm:ml-5 sm:h-0.5 sm:w-full ${step.state === "done" && next.state !== "unknown" ? JOURNEY_STATES.done.line : style.line}`}
              />
            )}
            <div className="sm:flex sm:justify-center">
              <StepIcon step={step.key} state={step.state} />
            </div>
            <div className="min-w-0 sm:mt-3 sm:text-center">
              <p className="text-sm font-semibold text-slate-900">{step.label}</p>
              <p className={`text-xs font-medium ${style.text}`}>
                {style.word}
                {step.at && <span className="font-normal text-slate-500"> · {formatTime(step.at)} IST</span>}
              </p>
              {gap !== null && <p className="text-xs text-slate-400">{duration(gap)} after the step before</p>}
              <p className="mt-1 text-xs text-slate-600">{step.note}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// The ids that connect the steps, one block per step, in the journey's order. Select one to copy it.
export function JourneyIds({ steps }: { steps: JourneyStep[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((step) => (
        <div key={step.key} className={`${cardClass} p-3`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step.label}</p>
          <dl className="mt-2 space-y-1.5">
            {step.ids.map((id, i) => (
              <div key={`${id.label}|${i}`}>
                <dt className="text-[11px] text-slate-400">{id.label}</dt>
                <dd className="break-all font-mono text-xs text-slate-800">
                  {id.value ? (
                    id.href ? (
                      <Link href={id.href} className={`select-all ${rowLinkClass}`}>{id.value}</Link>
                    ) : (
                      <span className="select-all">{id.value}</span>
                    )
                  ) : (
                    <span className="font-sans text-slate-400">— {id.note ?? "not recorded"}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

// Where a set of calls stopped along the journey: how many reached each step, and the calls that
// stopped there, each opening its list. Counts use the same stage tests as the lists.
export function JourneyRollup({ journey, href, lastComplete, now, recordings = true }: {
  journey: JourneySummary;
  href: (stage: CallStage) => string;
  lastComplete?: Pulse["lastComplete"];
  now: number;
  recordings?: boolean;
}) {
  const { calls, stops } = journey;
  const steps: { key: JourneyStep["key"]; label: string; reached: React.ReactNode; stop?: { count: number; stage: CallStage; text: string } }[] = [
    { key: "phone", label: "Calls made", reached: <ItemLink href={href("all")}>{int(calls)}</ItemLink> },
    { key: "app", label: "Picked up by the app", reached: int(journey.picked) },
    { key: "upload", label: "Recordings uploaded", reached: recordings ? <ItemLink href={href("recorded")}>{int(journey.recorded - stops.upload)} of {int(journey.recorded)}</ItemLink> : "not taken", stop: { count: stops.upload, stage: "stopUpload", text: "stuck" } },
    { key: "sent", label: "Sent to the CRM", reached: <ItemLink href={href("sent")}>{int(journey.sent)}</ItemLink>, stop: { count: stops.sent, stage: "stopSent", text: "never sent" } },
    { key: "crm", label: "All the way through", reached: <ItemLink href={href("complete")}>{int(journey.complete)}</ItemLink>, stop: { count: stops.crm, stage: "stopCrm", text: "refused by the CRM" } },
  ];
  const stopped = stops.upload + stops.sent + stops.crm;
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-sm text-slate-800">
        {calls === 0 ? (
          "No calls in this window."
        ) : (
          <>
            <span className="font-semibold">{int(journey.complete)} of {int(calls)}</span> calls went all the way from the phone to the CRM.{" "}
            {stopped > 0 ? (
              <ItemLink href={href(stops.upload ? "stopUpload" : stops.sent ? "stopSent" : "stopCrm")} className="font-medium text-red-700">{int(stopped)} stopped on the way</ItemLink>
            ) : (
              <span className="text-emerald-700">None stopped on the way</span>
            )}
            {journey.moving > 0 && (
              <>
                {", "}
                <ItemLink href={href("moving")} className="text-slate-600">{int(journey.moving)} still on their way</ItemLink>
              </>
            )}
            .
          </>
        )}
        {lastComplete !== undefined && (
          <span className="block text-xs text-slate-500">
            Last call all the way through:{" "}
            {lastComplete ? (
              <Link href={`/dashboard/call_anchor/health/calls/${encodeURIComponent(lastComplete.callId)}`} className={rowLinkClass}>
                {ago(lastComplete.at, now)} ({formatTime(lastComplete.at)} IST)
              </Link>
            ) : (
              <span className="font-medium text-amber-800">none stored</span>
            )}
          </span>
        )}
      </p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-5 sm:gap-3">
        {steps.map((s, i) => {
          const bad = (s.stop?.count ?? 0) > 0;
          const state: JourneyState = bad ? "stopped" : calls ? "done" : "skipped";
          return (
            <li key={s.key} className="relative flex gap-3 sm:block sm:text-center">
              {i < steps.length - 1 && (
                <span aria-hidden className="absolute left-5 top-10 -ml-px h-[calc(100%+0.25rem)] w-0.5 bg-slate-200 sm:left-1/2 sm:top-5 sm:ml-5 sm:h-0.5 sm:w-full" />
              )}
              <div className="sm:flex sm:justify-center">
                <StepIcon step={s.key} state={state} count={s.stop?.count} />
              </div>
              <div className="sm:mt-2">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{s.reached}</p>
                {bad && s.stop && (
                  <ItemLink href={href(s.stop.stage)} className="text-xs font-medium text-red-700">
                    {int(s.stop.count)} {s.stop.text}
                  </ItemLink>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// The journey in one line, for a table row: five dots, red with a count where calls stopped.
export function JourneyDots({ journey, href }: { journey: JourneySummary; href: (stage: CallStage) => string }) {
  const stopAt: Partial<Record<JourneyStep["key"], { count: number; stage: CallStage }>> = {
    upload: { count: journey.stops.upload, stage: "stopUpload" },
    sent: { count: journey.stops.sent, stage: "stopSent" },
    crm: { count: journey.stops.crm, stage: "stopCrm" },
  };
  const labels: Record<JourneyStep["key"], string> = { phone: "Phone", app: "App", upload: "Upload", sent: "Sent", crm: "CRM" };
  const worst = (["upload", "sent", "crm"] as const).filter((k) => journey.stops[k] > 0);
  return (
    <div>
      <ol className="flex items-center" aria-label="Where calls stopped, phone to CRM">
        {(Object.keys(labels) as JourneyStep["key"][]).map((key, i) => {
          const stop = stopAt[key];
          const bad = (stop?.count ?? 0) > 0;
          const dot = (
            <span
              title={`${labels[key]}${bad ? `: ${stop!.count} calls stopped here` : ""}`}
              className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${bad ? "bg-red-600 text-white" : journey.calls ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}
            >
              {bad ? int(stop!.count) : ""}
            </span>
          );
          return (
            <li key={key} className="flex items-center">
              {i > 0 && <span aria-hidden className="h-0.5 w-2 bg-slate-200" />}
              {bad ? <Link href={href(stop!.stage)}>{dot}</Link> : dot}
            </li>
          );
        })}
      </ol>
      <p className="mt-0.5 text-xs text-slate-500">
        {!journey.calls ? "no calls" : worst.length ? <span className="text-red-700">stops at {worst.map((k) => labels[k].toLowerCase()).join(", ")}</span> : "all through"}
      </p>
    </div>
  );
}

export function duration(ms: number) {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 2 * 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} days`;
}

// Text that opens the items behind it.
// A number or label that opens the rows behind it: a quiet chip, so tables read as data rather than a
// wall of links (owner, 2026-11-13). Its colour comes from the text around it.
export function ItemLink({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`-mx-0.5 inline-flex items-center rounded px-1 ring-1 ring-transparent transition hover:bg-indigo-50 hover:text-indigo-800 hover:ring-indigo-200 ${className}`}>
      {children}
    </Link>
  );
}

// The main link of a table row (a client, a phone): plain dark text that turns indigo on hover.
export const rowLinkClass = "font-medium text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline";

export function Tile({ label, value, detail, href, icon, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; href?: string; icon?: IconName; tone?: Tone }) {
  // The same look as the stat cells under a hero: an accent, an optional icon, the number large.
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      {icon ? (
        <StatCell icon={icon} tone={tone ?? "slate"} label={label} value={value} sub={detail} href={href} />
      ) : (
        <PlainStat label={label} value={value} detail={detail} href={href} tone={tone ?? "slate"} />
      )}
    </div>
  );
}

const ACCENT: Record<Tone, string> = {
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  violet: "border-l-violet-500",
  red: "border-l-red-500",
  amber: "border-l-amber-500",
  slate: "border-l-slate-300",
};

function PlainStat({ label, value, detail, href, tone }: { label: string; value: React.ReactNode; detail?: React.ReactNode; href?: string; tone: Tone }) {
  const body = (
    <div className={`h-full border-l-4 bg-white px-4 py-3.5 ${ACCENT[tone]} ${href ? "transition hover:bg-slate-50" : ""}`}>
      <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {href && <span aria-hidden className="text-slate-300">→</span>}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

// A client's views, all under /health/clients/<client> (owner, 2026-11-13).
export const clientViews = (basePath: string, clientId: string) => {
  const root = `${basePath}/clients/${encodeURIComponent(clientId)}`;
  return { health: root, licenses: `${root}/licenses`, seats: `${root}/licenses?use=unused`, items: `${root}/items?kind=calls&stage=all&window=1` };
};

// A section's anchor and its name in the left menu's "On this page": the title up to any count.
export function sectionAnchor(title: string) {
  const label = title.split(":")[0].trim();
  return { id: `s-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, label };
}

export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  const anchor = sectionAnchor(title);
  return (
    <section id={anchor.id} data-section={anchor.label} className="mt-8 scroll-mt-32">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      {note && <p className="mt-1 max-w-4xl text-sm text-slate-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A section that starts closed, for detail most visits don't need (QA U4).
export function Collapsed({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  const anchor = sectionAnchor(title);
  return (
    <details id={anchor.id} data-section={anchor.label} className="mt-6 scroll-mt-32">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">{title}</summary>
      {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}

// A column heading, optionally with an info mark whose tooltip explains it (a formula, a rule).
export type Head = string | { label: string; info: string };

export function Table({ head, children, empty }: { head: Head[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) =>
              typeof h === "string" ? (
                <th key={`${i}-${h}`} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
              ) : (
                <th key={`${i}-${h.label}`} className="whitespace-nowrap px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1" title={h.info}>
                    {h.label}
                    <span aria-label={h.info} className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold normal-case text-slate-600">
                      i
                    </span>
                  </span>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-4 text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export const td = "whitespace-nowrap px-3 py-2 align-top text-slate-700";

// While a page reads the store: a progress bar with an estimated percentage (owner, 2026-11-13).
export function LoadingNote({ text, expectMs }: { text: string; expectMs?: number }) {
  return <EstimatedProgress text={text} expectMs={expectMs} />;
}

// CRM syncs per bucket, stacked by HTTP class. Status colours, each named in the legend and table.
const SERIES = [
  { key: "delivered", label: "Delivered (2xx)", color: "#0ca30c" },
  { key: "rejected", label: "Rejected (4xx)", color: "#d03b3b" },
  { key: "unreachable", label: "No response or 5xx", color: "#ec835a" },
  { key: "other", label: "Other failures", color: "#fab219" },
] as const;
type TrendBucket = { start: string; delivered: number; rejected: number; unreachable: number; other: number };

export function SyncTrend({ buckets, hourly }: { buckets: TrendBucket[]; hourly: boolean }) {
  const total = (b: TrendBucket) => b.delivered + b.rejected + b.unreachable + b.other;
  const max = Math.max(1, ...buckets.map(total));
  const label = (start: string) => (hourly ? formatHour(start) : formatDay(start));
  const every = Math.ceil(buckets.length / 8);
  const shown = SERIES.filter((s) => s.key === "delivered" || buckets.some((b) => b[s.key] > 0));
  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
        <span className="ml-auto text-slate-400">Peak {int(max)} per {hourly ? "hour" : "day"}</span>
      </div>
      <div className="mt-3 flex h-36 items-end gap-0.5 border-b border-slate-300">
        {buckets.map((b) => {
          const parts = [...SERIES].reverse().filter((s) => b[s.key] > 0);
          return (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px] hover:opacity-80"
              title={`${label(b.start)}: ${SERIES.map((s) => `${int(b[s.key])} ${s.label.toLowerCase()}`).join(", ")}`}
            >
              {parts.map((s, i) => (
                <div key={s.key} className={i === 0 ? "rounded-t" : ""} style={{ height: `${(b[s.key] / max) * 100}%`, background: s.color }} />
              ))}
              {total(b) === 0 && <div className="h-px" />}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-400">
        {buckets.map((b, i) => (
          <span key={b.start} className="min-w-0 flex-1 truncate">{i % every === 0 ? label(b.start) : ""}</span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500">Show as a table</summary>
        <table className="mt-2 text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pr-4 font-medium">{hourly ? "Hour" : "Day"}</th>
              {SERIES.map((s) => <th key={s.key} className="pr-4 font-medium">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.start}>
                <td className="pr-4 text-slate-500">{label(b.start)}</td>
                {SERIES.map((s) => <td key={s.key} className="pr-4 tabular-nums">{int(b[s.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// Raw CallAnchor data, pretty-printed. JSON sent as text (payload and reply previews) is parsed first.
export function Json({ value, label, open = false }: { value: unknown; label: string; open?: boolean }) {
  let shown = value;
  if (typeof value === "string") {
    try {
      shown = JSON.parse(value);
    } catch {
      // Not JSON, or cut short by CallAnchor's preview: show the text as it is.
    }
  }
  const text = typeof shown === "string" ? shown : JSON.stringify(shown, null, 2);
  return (
    <details open={open} className="mt-1 text-xs">
      <summary className="cursor-pointer select-none font-medium text-indigo-700">{label}</summary>
      <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 ring-1 ring-slate-200">
        {text}
      </pre>
    </details>
  );
}

// When a phone or client last had a call go all the way to the CRM, opening that call.
export function LastComplete({ pulse, now }: { pulse: Pulse; now: number }) {
  const last = pulse.lastComplete;
  return (
    <p className="mt-0.5 text-xs text-slate-500">
      last through{" "}
      {last ? (
        <Link href={`/dashboard/call_anchor/health/calls/${encodeURIComponent(last.callId)}`} className={rowLinkClass} title={`${formatTime(last.at)} IST`}>
          {ago(last.at, now)}
        </Link>
      ) : (
        <span className="font-medium text-amber-800">never</span>
      )}
    </p>
  );
}

// CRM sync over the last 7 days, the same cell for a client and a license (owner, 2026-11-13): the day
// strip, synced days out of days with due calls, and when a call last went all the way through.
// `last` comes formatted from the server so the browser doesn't re-render it in another zone.
export function SyncCell({ days, week, last }: { days: Day[]; week: { synced: number; active: number }; last: { href: string; label: string; title?: string } | null }) {
  return (
    <div>
      <DayStrip days={days.slice(-7)} size="md" />
      <p className="mt-1 text-xs text-slate-500">{week.active ? `${week.synced} of ${week.active} days` : "no due calls"}</p>
      <p className="text-xs text-slate-500">
        last through{" "}
        {last ? (
          <Link href={last.href} className={rowLinkClass} title={last.title}>{last.label}</Link>
        ) : (
          <span className="font-medium text-amber-800">never</span>
        )}
      </p>
    </div>
  );
}
