import Link from "next/link";
import type { CoverageSummary, Drill, FunnelStep, JourneyStep, Level } from "@/lib/callanchor/health";
import type { CallStage, Day, Issue, IssueLevel, LicenseStatus, Pulse } from "@/lib/callanchor/issues";
import type { ReplySuggestion, StoreStatus } from "@/lib/callanchor/store";
import { badgeClass, cardClass } from "@/components/ui";
import { DAY_STATES, ISSUE_LEVELS, LEVELS, LICENSE_STATUSES, TRENDS, ago, formatDay, formatHour, formatTime, int, issueHref, itemsHref, pct, rateClass } from "./format";

// The health views, as tabs. Each page passes its own.
const TABS = [
  { key: "clients", label: "Clients", path: "" },
  { key: "licenses", label: "Licenses", path: "/licenses" },
  { key: "seats", label: "Seats", path: "/seats" },
  { key: "settings", label: "Settings", path: "/settings" },
] as const;

export function HealthTabs({ basePath, current }: { basePath: string; current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Client health" className="mt-3 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`${basePath}${t.path}`}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            t.key === current ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

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
  const page = issueHref(basePath, issue.id);
  const rows = issue.drill ? itemsHref(basePath, { ...issue.drill, ...scope } as Drill, { client: issue.clientId ?? undefined, issue: issue.id }) : null;
  return { page, rows, primary: rows ?? page };
}

// One issue: what's wrong in plain words, its impact, since when. The whole card opens its rows.
export function IssueCard({ issue, basePath, now, clientName, licenseLabel }: { issue: Issue; basePath: string; now: number; clientName?: string; licenseLabel?: string | null }) {
  const level = ISSUE_LEVELS[issue.level];
  const links = issueLinks(basePath, issue);
  const where = [clientName, licenseLabel ? `phone …${licenseLabel}` : null].filter(Boolean).join(" · ");
  return (
    <Link href={links.primary} className={`${cardClass} group flex flex-col gap-2 border-l-4 p-3 transition hover:bg-slate-50 ${level.card}`}>
      <div className="flex items-start gap-2">
        <StatusBadge status={issue.level} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 group-hover:text-indigo-700 group-hover:underline">{issue.title}</p>
          {where && <p className="truncate text-xs text-slate-500">{where}</p>}
        </div>
        <Spark values={issue.hourly} label={issue.title} />
      </div>
      <p className="text-sm text-slate-700">
        {issue.impactText}
        {issue.firstAt && (
          <span className="text-slate-500">
            {issue.impactText ? " " : ""}since {formatTime(issue.firstAt)} IST ({ago(issue.firstAt, now)})
          </span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {issue.newSinceVisit && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800">New since your last visit</span>}
        <span>
          {TRENDS[issue.trend]}
          {issue.lastAt && ` · last seen ${ago(issue.lastAt, now)}`}
        </span>
        <span className="ml-auto font-medium text-indigo-700">{links.rows ? "Open the items →" : "Details →"}</span>
      </p>
    </Link>
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
              <ItemLink href={href("openDrop", 30)}>{int(pulse.openDrops)} recordings still open</ItemLink> (on the phone, stuck or not synced), kept until fixed
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          basePath={basePath}
          now={now}
          clientName={names && issue.clientId ? names[issue.clientId] : undefined}
          licenseLabel={issue.licenseId ? (licenseLabels?.[issue.licenseId] ?? null) : null}
        />
      ))}
    </div>
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

const STEP_STYLES: Record<JourneyStep["state"], { icon: string; className: string; word: string }> = {
  done: { icon: "✓", className: "border-emerald-600 bg-emerald-50 text-emerald-800", word: "Done" },
  failed: { icon: "✕", className: "border-red-600 bg-red-50 text-red-700", word: "Failed" },
  missing: { icon: "?", className: "border-amber-500 bg-amber-50 text-amber-800", word: "Not stored" },
  pending: { icon: "…", className: "border-slate-300 bg-white text-slate-600", word: "Not yet" },
  skipped: { icon: "–", className: "border-slate-200 bg-slate-50 text-slate-400", word: "Not expected" },
};

// Ingested → Uploaded → Verified → Sent → Accepted, with the time between steps.
export function Stepper({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {steps.map((step, i) => {
        const style = STEP_STYLES[step.state];
        const previous = steps.slice(0, i).findLast((s) => s.at)?.at ?? null;
        const gap = step.at && previous ? Date.parse(step.at) - Date.parse(previous) : null;
        return (
          <li key={step.label} className={`rounded-lg border-2 px-3 py-2 text-sm ${style.className}`}>
            <p className="font-medium"><span aria-hidden>{style.icon} </span>{step.label}</p>
            <p className="text-xs">{step.at ? `${formatTime(step.at)} IST` : style.word}</p>
            {gap !== null && <p className="text-xs opacity-80">+{duration(gap)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function duration(ms: number) {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 2 * 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} days`;
}

// Text that opens the items behind it.
export function ItemLink({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`underline decoration-dotted underline-offset-2 hover:decoration-solid ${className}`}>
      {children}
    </Link>
  );
}

export function Tile({ label, value, detail, href }: { label: string; value: React.ReactNode; detail?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${href ? "text-indigo-700" : "text-slate-900"}`}>{value}</p>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${cardClass} block p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${cardClass} p-4`}>{body}</div>
  );
}

export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A section that starts closed, for detail most visits don't need (QA U4).
export function Collapsed({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">{title}</summary>
      {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-4 text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export const td = "whitespace-nowrap px-3 py-2 align-top text-slate-700";

export function LoadingNote({ text }: { text: string }) {
  return (
    <div className={`${cardClass} mt-6 animate-pulse p-6`} aria-busy="true">
      <p className="text-sm text-slate-500">{text}</p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${95 - i * 10}%` }} />
        ))}
      </div>
    </div>
  );
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
