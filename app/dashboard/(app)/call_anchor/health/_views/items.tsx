import Link from "next/link";
import { phoneText } from "@/lib/callanchor/labels";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { ISSUE_ID, ITEMS_PER_PAGE as CALLS_PER_PAGE, loadCallItems, loadIssue, WINDOW_DAYS, type WindowDays } from "@/lib/callanchor/health";
import { isCallStage, JOURNEY_STEPS, stageTitle, type CallStage, type JourneyKey } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import {
  ITEMS_PER_PAGE,
  readCalloutPage,
  readClientNames,
  readLicense,
  readLogPage,
  readStoreStatus,
  type CalloutFilter,
  type LogFilter,
} from "@/lib/callanchor/store";
import { ago, callHref, clientHref, formatTime, httpTone, int, licenseHref, severityTone, toneBadge } from "../format";
import { IssuePanel, Json, LoadingNote, Table, rowLinkClass, td } from "../parts";
import { secondaryButtonClass } from "@/components/ui";

// Every row behind a flag, count or error on the health pages, one per line for debugging. Read
// from the store only: the dashboard that linked here has just pulled what's new.

const ID_PATTERN = /^[\w-]{1,100}$/;
// "recordings" is the old name for recording stages, kept so older links still open.
const KINDS = ["syncs", "calls", "recordings", "logs"] as const;
type Kind = (typeof KINDS)[number];
type Query = Record<string, string | string[] | undefined>;

// The filters each kind takes, with how a chip names them.
const FILTERS: Record<Kind, Record<string, string>> = {
  syncs: { status: "Status", event: "Event", platform: "Platform", http: "HTTP", label: "Reply or error", auth: "Sign-in failures" },
  calls: { license: "Phone", licenses: "Phones" },
  recordings: {},
  logs: { source: "Source", severity: "Severity", detail: "Detail", starts: "Message starts", problems: "Problems only" },
};

// The left filter panel: the kinds of item, and for calls every stage, grouped along the journey.
// Short names here; the full title shows on hover and as the list's heading.
const KIND_OPTIONS: { kind: Exclude<Kind, "recordings">; label: string }[] = [
  { kind: "calls", label: "Calls" },
  { kind: "syncs", label: "CRM syncs" },
  { kind: "logs", label: "System logs" },
];
// Each stage's short name and status: ok (went well), wait (in progress or worth a look), bad (a
// problem), info (a plain count). A new stage needs an entry; the type check enforces it.
type Tone = "ok" | "wait" | "bad" | "info";
const STAGES: Record<CallStage, { label: string; tone: Tone }> = {
  all: { label: "All calls", tone: "info" },
  complete: { label: "Went all the way through", tone: "ok" },
  moving: { label: "Still on their way", tone: "wait" },
  stopped: { label: "Stopped before the CRM", tone: "bad" },
  stopUpload: { label: "Stopped here", tone: "bad" },
  stopSent: { label: "Stopped here", tone: "bad" },
  stopCrm: { label: "Stopped here", tone: "bad" },
  recorded: { label: "Recorded", tone: "ok" },
  notConnected: { label: "Didn't connect", tone: "info" },
  notRecorded: { label: "Not recorded", tone: "bad" },
  mislabeled: { label: "Marked not recorded, uploaded", tone: "wait" },
  noLog: { label: "No stored ingest log", tone: "bad" },
  uploaded: { label: "Uploaded", tone: "ok" },
  verified: { label: "Verified", tone: "ok" },
  skipped: { label: "Skipped, trial limit", tone: "wait" },
  onPhone: { label: "Still on the phone", tone: "wait" },
  waiting: { label: "Phone hasn't uploaded", tone: "bad" },
  notUploaded: { label: "Not uploaded", tone: "bad" },
  uploadFailed: { label: "Upload failed", tone: "bad" },
  unsaved: { label: "Phone couldn't save it", tone: "bad" },
  stuck: { label: "Stuck after upload began", tone: "bad" },
  notVerified: { label: "Uploaded, not verified", tone: "bad" },
  openDrop: { label: "Still open, 15 days", tone: "bad" },
  due: { label: "Due at the CRM", tone: "info" },
  sent: { label: "Sent", tone: "ok" },
  notSent: { label: "Not sent", tone: "info" },
  notSynced: { label: "Recording verified, not sent", tone: "wait" },
  missing: { label: "Never sent after grace", tone: "bad" },
  unsynced: { label: "Recording not sent after grace", tone: "bad" },
  delivered: { label: "Reached the CRM", tone: "ok" },
  synced: { label: "Recording reached the CRM", tone: "ok" },
  late: { label: "Reached late", tone: "wait" },
  duplicate: { label: "Accepted twice", tone: "wait" },
  notReached: { label: "Didn't reach the CRM", tone: "bad" },
  notAccepted: { label: "Sent, not accepted", tone: "bad" },
  failed: { label: "Sync failed", tone: "bad" },
  rejected: { label: "CRM rejected it (4xx)", tone: "bad" },
  auth: { label: "Sign-in rejected (401/403)", tone: "bad" },
  unreachable: { label: "No response or 5xx", tone: "bad" },
};
// The panel follows the call's journey (JOURNEY_STEPS): the whole-journey outcome on top, then each
// step with where calls stopped there first, then what went well, then the problems.
const OUTCOME: CallStage[] = ["all", "complete", "moving", "stopped"];
const STEP_STAGES: Record<JourneyKey, { stop?: CallStage; stages: CallStage[] }> = {
  phone: { stages: ["recorded", "notConnected", "mislabeled", "notRecorded"] },
  app: { stages: ["noLog"] },
  upload: { stop: "stopUpload", stages: ["uploaded", "verified", "skipped", "onPhone", "waiting", "notUploaded", "uploadFailed", "stuck", "unsaved", "notVerified", "openDrop"] },
  sent: { stop: "stopSent", stages: ["due", "sent", "notSent", "notSynced", "missing", "unsynced"] },
  crm: { stop: "stopCrm", stages: ["delivered", "synced", "late", "duplicate", "notReached", "notAccepted", "failed", "rejected", "auth", "unreachable"] },
};
// Stages that are a subset of another, shown indented under it: why those calls didn't get through.
// They aren't added to the step's problem count, so a call is counted once (owner, 2026-11-13).
// The upload's reasons don't overlap: never started, stuck once begun, or no file to upload.
const UNDER: Partial<Record<CallStage, CallStage[]>> = {
  stopUpload: ["waiting", "stuck", "unsaved"],
  notReached: ["rejected", "auth", "unreachable"],
};
const NESTED = new Set(Object.values(UNDER).flat());
// Stages that only repeat a neighbour: sent but not accepted, and failed, are the same calls as didn't
// reach the CRM; still on the phone, not uploaded, upload failed, uploaded not verified and still
// open are the upload's stopped calls cut another way (owner, 2026-11-13). Kept for links from
// issues and funnels; listed only when picked.
const ONLY_WHEN_PICKED = new Set<CallStage>(["notAccepted", "failed", "onPhone", "notUploaded", "uploadFailed", "notVerified", "openDrop"]);
// A stage left out of the layout would never show in the panel: fail loudly while developing.
if (process.env.NODE_ENV !== "production") {
  const placed = new Set<CallStage>([...OUTCOME, ...Object.values(STEP_STAGES).flatMap((g) => [...(g.stop ? [g.stop] : []), ...g.stages])]);
  const left = (Object.keys(STAGES) as CallStage[]).filter((s) => !placed.has(s));
  if (left.length) throw new Error(`Stages missing from the journey panel: ${left.join(", ")}`);
}
const stepOf = (stage: CallStage) => JOURNEY_STEPS.find((j) => STEP_STAGES[j.key].stop === stage || STEP_STAGES[j.key].stages.includes(stage))?.key;
const stageLabel = (stage: CallStage) => {
  const step = stepOf(stage);
  return STAGES[stage].label === "Stopped here" && step ? `Stopped at: ${JOURNEY_STEPS.find((j) => j.key === step)!.label}` : STAGES[stage].label;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// A 2xx reply isn't an error, so the reply column is named by the outcome it lists (audit note 2).
const replyHeading = (status: string | undefined) => (status === "delivered" ? "CRM reply" : status === "failed" ? "Error or reply" : "Reply or error");

// Fleet-wide at /health/items, or one client's at /health/clients/<client>/items (the client's
// "Calls & logs" tab). The fleet route sends a ?client= link to the client's route.
export async function ItemsView({ query, clientId }: { query: Query; clientId: string | null }) {
  const asked = KINDS.find((k) => k === one(query.kind));
  const kind = asked === "recordings" ? "calls" : asked;
  const client = clientId ?? undefined;
  if (!kind || (client !== undefined && !ID_PATTERN.test(client))) notFound();
  const root = client ? clientHref(HEALTH_PATH, client) : HEALTH_PATH;
  const askedStage = one(query.stage);
  const stage: CallStage | undefined = isCallStage(askedStage) ? askedStage : undefined;
  if (kind === "calls" && !stage) notFound();
  if (one(query.license) !== undefined && !ID_PATTERN.test(one(query.license)!)) notFound();
  // The issue these rows are behind, shown above them (QA U1).
  const issueId = one(query.issue);
  if (issueId !== undefined && !ISSUE_ID.test(issueId)) notFound();
  const days = (WINDOW_DAYS.find((d) => String(d) === one(query.window)) ?? 1) as WindowDays;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(query.page) ?? "1", 10) || 1));

  // Only the filters this kind knows, so links rebuilt from them stay clean.
  const filters: Record<string, string> = {};
  for (const key of Object.keys(FILTERS[kind])) {
    const value = one(query[key]);
    if (value !== undefined && value.length <= (key === "licenses" ? 2000 : 300)) filters[key] = value;
  }
  const phones = filters.licenses?.split(",") ?? [];
  if (phones.length > 50 || phones.some((id) => !ID_PATTERN.test(id))) notFound();
  const base = { kind, ...(stage ? { stage } : {}), window: String(days), ...filters, ...(issueId ? { issue: issueId } : {}) };
  const href = (changes: Record<string, string | null>, at = root) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...base, ...changes })) if (value !== null) next.set(key, value);
    return `${at}/items?${next}`;
  };

  // Another kind keeps the client, window and phone; its own filters start empty. Another stage drops
  // the issue, whose rows these no longer are.
  const kindHref = (next: Kind) => {
    const params = new URLSearchParams({ kind: next, ...(next === "calls" ? { stage: stage ?? "all" } : {}), window: String(days) });
    if (next === "calls" && filters.license) params.set("license", filters.license);
    return `${root}/items?${params}`;
  };

  const path = href({ page: page > 1 ? String(page) : null });
  await requireCallAnchorSession(path);
  const [names, phone, internal] = await Promise.all([readClientNames(), filters.license ? readLicense(filters.license) : Promise.resolve(null), showInternal()]);
  // Across all clients, internal ones are left out unless "Show internal" is ticked.
  const hideInternal = !client && !internal;
  const clientName = client ? (names.get(client) ?? client) : null;
  // How a chip names a filter: a phone by its last four digits, never its raw id (QA U7).
  const chipValue = (key: string, value: string) =>
    key === "auth" || key === "problems" ? "yes" : key === "license" ? phoneText(phone) : key === "licenses" ? `${phones.length} phones` : value;
  const title =
    kind === "calls"
      ? "Calls"
      : kind === "syncs"
        ? filters.auth
          ? "CRM syncs rejected for credentials"
          : filters.status === "failed"
            ? "Failed CRM syncs"
            : filters.status === "delivered"
              ? "Delivered CRM syncs"
              : "CRM syncs"
        : "System logs";

  const filterProps: FilterProps = { kind, stage, kindHref, stageHref: (s) => href({ stage: s, page: null, issue: null }) };
  return (
    <div>
      <div className="lg:flex lg:gap-8">
      {kind === "calls" ? (
        <Suspense key={path} fallback={<ItemFilters {...filterProps} />}>
          <CountedFilters {...filterProps} load={() => callItems(client, filters.license, phones.join(","), !hideInternal, stage!, days, page)} />
        </Suspense>
      ) : (
        <ItemFilters {...filterProps} />
      )}
      <div className="min-w-0 lg:flex-1">
      {issueId && (
        <Suspense fallback={<LoadingNote text="Reading the issue…" />}>
          <IssueHeader issueId={issueId} />
        </Suspense>
      )}
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{clientName ?? "All clients"} · one row per item, newest first.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Window</span>
        {WINDOW_DAYS.map((d) => (
          <Link
            key={d}
            href={href({ window: String(d), page: null })}
            aria-current={d === days ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              d === days ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {d === 1 ? "24 hours" : `${d} days`}
          </Link>
        ))}
        {client && (
          <Chip href={href({ page: null }, HEALTH_PATH)} label="Client" value={clientName!} />
        )}
        {Object.entries(filters).map(([key, value]) => (
          <Chip key={key} href={href({ [key]: null, page: null })} label={key === "label" ? replyHeading(filters.status) : FILTERS[kind][key]} value={chipValue(key, value)} />
        ))}
      </div>

      <Suspense key={path} fallback={<LoadingNote text="Reading the stored items…" />}>
        {kind === "syncs" && <SyncItems filter={{ ...calloutFilter(filters, client), hideInternal }} days={days} page={page} names={names} href={href} />}
        {kind === "logs" && <LogItems filter={{ ...filters, clientId: client, problems: filters.problems === "1", hideInternal }} days={days} page={page} names={names} href={href} />}
        {kind === "calls" && <CallItems client={client} license={filters.license} licenses={phones} showInternal={!hideInternal} days={days} stage={stage!} page={page} names={names} href={href} />}
      </Suspense>
      </div>
      </div>
    </div>
  );
}

// One load of a scope's calls per request, shared by the filter panel's counts and the call rows.
const callItems = cache(
  (client: string | undefined, license: string | undefined, licenses: string, showInternal: boolean, stage: CallStage, days: WindowDays, page: number) =>
    loadCallItems({ clientId: client, licenseId: license, licenseIds: licenses ? licenses.split(",") : [], showInternal }, stage, days, page),
);

type FilterProps = { kind: Kind; stage?: CallStage; kindHref: (kind: Kind) => string; stageHref: (stage: CallStage) => string };

// The panel with each stage's count, once the calls are read. Until then it shows without counts.
async function CountedFilters({ load, ...props }: FilterProps & { load: () => ReturnType<typeof callItems> }) {
  const { counts } = await load();
  return <ItemFilters {...props} counts={counts} />;
}

const TONE_DOT: Record<Tone, string> = { ok: "bg-emerald-500", wait: "bg-amber-400", bad: "bg-rose-500", info: "bg-slate-300" };
const TONE_NAME: Record<Tone, string> = { ok: "Went well", wait: "In progress or worth a look", bad: "Problem", info: "Count" };

// Filters on the left. Kind is a switch at the top; for calls, the stages follow the call's journey
// as a numbered stepper: the whole-journey outcome, then one step per stage of the flow. Each step's
// dot says how it's doing (green clear, red calls stopped there, amber problems that don't stop a
// call), and its stages carry a status dot and their count, so one view shows where calls are.
// Steps are an accordion: one open at a time, starting on the step that holds the current pick.
// Every choice is a link, so it lives in the URL like every other filter here.
function ItemFilters({ kind, stage, kindHref, stageHref, counts }: FilterProps & { counts?: Record<CallStage, number> }) {
  const openStep = stage ? stepOf(stage) : undefined;
  return (
    <aside className="mb-6 lg:sticky lg:top-32 lg:mb-0 lg:max-h-[calc(100vh-9rem)] lg:w-72 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:pr-1">
      <div role="tablist" aria-label="Kind" className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 text-center text-xs font-medium">
        {KIND_OPTIONS.map((o) => (
          <Link
            key={o.kind}
            href={kindHref(o.kind)}
            role="tab"
            aria-selected={o.kind === kind}
            className={`rounded-md px-2 py-1.5 ${o.kind === kind ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {kind === "calls" && (
        <nav aria-label="Call journey" className="mt-5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Call journey</p>
          <ul className="mt-2 space-y-0.5">
            {OUTCOME.map((s) => (
              <StageRow key={s} stage={s} active={s === stage} href={stageHref(s)} count={counts?.[s]} />
            ))}
          </ul>

          <ol className="mt-4">
            {JOURNEY_STEPS.map((step, i) => {
              const { stop, stages } = STEP_STAGES[step.key];
              const stopped = stop && counts ? counts[stop] : 0;
              const problems = counts ? stages.filter((s) => STAGES[s].tone === "bad" && !NESTED.has(s) && !ONLY_WHEN_PICKED.has(s)).reduce((n, s) => n + counts[s], 0) : 0;
              const state: Tone = !counts ? "info" : stopped > 0 ? "bad" : problems > 0 ? "wait" : "ok";
              const open = step.key === openStep;
              const picked = stage && open ? stageLabel(stage) : undefined;
              return (
                <li key={step.key} className="relative pb-1 before:absolute before:bottom-0 before:left-[19px] before:top-8 before:w-px before:bg-slate-200 last:before:hidden">
                  <details key={String(open)} name="call-journey" open={open} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      <StepNode n={i + 1} state={state} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{step.label}</span>
                        {picked && <span className="block truncate text-xs text-indigo-700 group-open:hidden">{picked}</span>}
                      </span>
                      {stopped > 0 && <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium tabular-nums text-rose-700 ring-1 ring-rose-200">{int(stopped)} stopped</span>}
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90">
                        <path fillRule="evenodd" d="M7.2 14.8a.75.75 0 0 1 0-1.06L10.94 10 7.2 6.26a.75.75 0 1 1 1.06-1.06l4.27 4.27a.75.75 0 0 1 0 1.06L8.26 14.8a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                      </svg>
                    </summary>
                    <ul className="mb-2 ml-9 mt-1 space-y-0.5">
                      {(stop ? [stop, ...stages] : stages)
                        .filter((s) => !NESTED.has(s) && (!ONLY_WHEN_PICKED.has(s) || s === stage))
                        .map((s) => (
                          <StageRow key={s} stage={s} active={s === stage} href={stageHref(s)} count={counts?.[s]}>
                            {UNDER[s] && (
                              <ul className="ml-4 border-l border-slate-200 pl-1">
                                {UNDER[s]!.filter((c) => counts?.[c] !== 0 || c === stage).map((c) => (
                                  <StageRow key={c} stage={c} active={c === stage} href={stageHref(c)} count={counts?.[c]} />
                                ))}
                              </ul>
                            )}
                          </StageRow>
                        ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ol>

          <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 px-2 pt-3 text-[11px] text-slate-500">
            {(["ok", "wait", "bad"] as Tone[]).map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[t]}`} aria-hidden />
                {TONE_NAME[t]}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
}

// A numbered step on the journey, coloured by how the step is doing.
function StepNode({ n, state }: { n: number; state: Tone }) {
  const look: Record<Tone, string> = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-300",
    wait: "bg-amber-50 text-amber-700 ring-amber-300",
    bad: "bg-rose-500 text-white ring-rose-500",
    info: "bg-white text-slate-500 ring-slate-300",
  };
  return (
    <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ${look[state]}`} title={state === "info" ? undefined : TONE_NAME[state]}>
      {n}
    </span>
  );
}

// One stage: its status dot, name and count. An empty stage is dimmed; a problem with calls in it
// shows its count in red.
function StageRow({ stage, active, href, count, children }: { stage: CallStage; active: boolean; href: string; count?: number; children?: React.ReactNode }) {
  const { label, tone } = STAGES[stage];
  const empty = count === 0;
  return (
    <li>
      <Link
        href={href}
        title={stageTitle(stage)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
          active ? "bg-indigo-50 font-medium text-indigo-700" : empty ? "text-slate-400 hover:bg-slate-50" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]} ${empty ? "opacity-40" : ""}`} aria-label={TONE_NAME[tone]} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className={`shrink-0 text-xs tabular-nums ${!empty && tone === "bad" ? "font-semibold text-rose-700" : "text-slate-400"}`}>{int(count)}</span>
        )}
      </Link>
      {children}
    </li>
  );
}

function calloutFilter(filters: Record<string, string>, client: string | undefined): CalloutFilter {
  const http = filters.http === "none" ? "none" : /^\d{3}$/.test(filters.http ?? "") ? Number(filters.http) : undefined;
  return { ...filters, clientId: client, http, auth: filters.auth === "1" };
}

// An active filter. Clicking it removes it.
function Chip({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      title="Remove this filter"
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-800 hover:bg-indigo-100"
    >
      <span className="font-medium">{label}:</span>
      <span className="truncate">{value}</span>
      <span aria-hidden className="ml-0.5 text-indigo-400">✕</span>
    </Link>
  );
}

type Href = (changes: Record<string, string | null>) => string;

async function IssueHeader({ issueId }: { issueId: string }) {
  const data = await loadIssue(issueId);
  const now = Date.parse(data.loadedAt);
  if (!data.issue) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        <span aria-hidden className="text-emerald-700">✓ </span>The issue behind these rows isn&apos;t open now.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <IssuePanel issue={data.issue} checklist={data.checklist} suggestions={data.suggestions} now={now} compact />
    </div>
  );
}

async function StoreLine({ now }: { now: number }) {
  const store = await readStoreStatus(null);
  return <p className="mt-4 text-xs text-slate-400">From stored data. Latest changes pulled {ago(store.pulledAt, now)}.</p>;
}

function Pager({ page, total, href, perPage = ITEMS_PER_PAGE }: { page: number; total: number; href: Href; perPage?: number }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(total, page * perPage);
  const link = "rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50";
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
      <span>
        {int(from)}–{int(to)} of {int(total)}
      </span>
      {page > 1 && <Link href={href({ page: page > 2 ? String(page - 1) : null })} className={link}>Newer</Link>}
      {page < pages && <Link href={href({ page: String(page + 1) })} className={link}>Older</Link>}
    </div>
  );
}

function ClientCell({ id, names }: { id: string | null; names: Map<string, string> }) {
  if (!id) return <span className="text-slate-400">—</span>;
  return (
    <Link href={clientHref(HEALTH_PATH, id)} className={rowLinkClass}>
      {names.get(id) ?? id}
    </Link>
  );
}

function CallCell({ callId, clientId, requestId, back }: { callId: string | null; clientId: string | null; requestId?: string | null; back: string }) {
  if (!callId) return <span className="text-slate-400">—</span>;
  const call = callHref(HEALTH_PATH, callId, back, clientId);
  return (
    <div className="flex flex-col items-start gap-1">
      <Link href={call} className={`${rowLinkClass} font-mono text-xs`} title="Open this call's journey">
        {callId}
      </Link>
      {requestId && (
        <Link href={`${call}#request-${requestId}`} className={secondaryButtonClass}>
          Payload and reply
        </Link>
      )}
    </div>
  );
}

// Filter links inside the table, so one row narrows the list to its siblings.
function FilterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="hover:text-indigo-700 hover:underline" title="Show only these">
      {children}
    </Link>
  );
}

async function SyncItems({ filter, days, page, names, href }: { filter: CalloutFilter; days: WindowDays; page: number; names: Map<string, string>; href: Href }) {
  const { items, total, now } = await readCalloutPage(filter, days, page);
  const allClients = !filter.clientId;
  return (
    <>
      <StoreLine now={now} />
      <Pager page={page} total={total} href={href} />
      <div className="mt-3">
        <Table
          head={["When", ...(allClients ? ["Client"] : []), "Event", "Status", "Platform", "HTTP", "Attempt", "Time", replyHeading(filter.status), "Call"]}
          empty={items.length ? undefined : "Nothing matches in this window."}
        >
          {items.map((e) => (
            <tr key={e.id}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(e.at)}</td>
              {allClients && <td className={td}><ClientCell id={e.clientId} names={names} /></td>}
              <td className={td}><FilterLink href={href({ event: e.eventType, page: null })}>{e.eventType}</FilterLink></td>
              <td className={`${td} ${e.status === "failed" ? "font-medium text-red-700" : e.status === "delivered" ? "text-emerald-700" : ""}`}>
                <FilterLink href={href({ status: e.status, page: null })}>{e.status}</FilterLink>
                {e.callAnchorStatus !== e.status && <p className="text-xs font-normal text-slate-400">CallAnchor: {e.callAnchorStatus}</p>}
              </td>
              <td className={td}><FilterLink href={href({ platform: e.platformId, page: null })}>{e.platformId}</FilterLink></td>
              <td className={`${td} tabular-nums`}>
                <FilterLink href={href({ http: e.httpStatus === null ? "none" : String(e.httpStatus), page: null })}><span className={toneBadge(httpTone(e.httpStatus))}>{e.httpStatus ?? "none"}</span></FilterLink>
              </td>
              <td className={`${td} tabular-nums`}>{e.attempt}</td>
              <td className={`${td} tabular-nums text-xs text-slate-500`}>{e.durationMs === null ? "—" : `${int(e.durationMs)} ms`}</td>
              <td className="min-w-80 px-3 py-2 align-top text-slate-700">
                <FilterLink href={href({ label: e.label, page: null })}>{e.label}</FilterLink>
              </td>
              <td className={td}><CallCell callId={e.callId} clientId={e.clientId} requestId={e.requestId} back={href({})} /></td>
            </tr>
          ))}
        </Table>
      </div>
      {total > ITEMS_PER_PAGE && <Pager page={page} total={total} href={href} />}
    </>
  );
}

async function LogItems({ filter, days, page, names, href }: { filter: LogFilter; days: WindowDays; page: number; names: Map<string, string>; href: Href }) {
  const { items, total, now } = await readLogPage(filter, days, page);
  const allClients = !filter.clientId;
  return (
    <>
      <StoreLine now={now} />
      <Pager page={page} total={total} href={href} />
      <div className="mt-3">
        <Table
          head={["When", ...(allClients ? ["Client"] : []), "Source", "Severity", "Message", "Detail", "Call"]}
          empty={items.length ? undefined : "Nothing matches in this window. CallAnchor keeps system logs for about 3 days, so older ones exist only if they were stored."}
        >
          {items.map((l) => (
            <tr key={l.id}>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(l.occurredAt)}</td>
              {allClients && <td className={td}><ClientCell id={l.clientId} names={names} /></td>}
              <td className={`${td} text-xs`}><FilterLink href={href({ source: l.source, page: null })}>{l.source}</FilterLink></td>
              <td className={td}>
                <FilterLink href={href({ severity: l.severity, page: null })}><span className={toneBadge(severityTone(l.severity))}>{l.severity}</span></FilterLink>
              </td>
              <td className="min-w-80 max-w-2xl px-3 py-2 align-top text-slate-700">
                {l.message}
                {l.raw && <Json value={l.raw} label="Metadata and full log line" />}
              </td>
              <td className={`${td} text-xs`}>
                {l.detail ? <FilterLink href={href({ detail: l.detail, page: null })}>{l.detail}</FilterLink> : <span className="text-slate-400">—</span>}
              </td>
              <td className={td}><CallCell callId={l.callId} clientId={l.clientId} back={href({})} /></td>
            </tr>
          ))}
        </Table>
      </div>
      {total > ITEMS_PER_PAGE && <Pager page={page} total={total} href={href} />}
    </>
  );
}

async function CallItems({ client, license, licenses, showInternal, days, stage, page, names, href }: {
  client?: string;
  license?: string;
  licenses: string[];
  showInternal: boolean;
  days: WindowDays;
  stage: CallStage;
  page: number;
  names: Map<string, string>;
  href: Href;
}) {
  const { items, total, title, loadedAt } = await callItems(client, license, licenses.join(","), showInternal, stage, days, page);
  const now = Date.parse(loadedAt);
  return (
    <>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <StoreLine now={now} />
      <p className="mt-1 text-sm text-slate-500">
        One row per call, however many CRM attempts it had. A call counts as reached once any callout got a 2xx reply. A delivered recording.ready
        counts its recording as uploaded and verified, even when those logs weren&apos;t stored. Its time is when it came in, or its first callout
        when its ingest log wasn&apos;t stored.
      </p>
      <Pager page={page} total={total} href={href} perPage={CALLS_PER_PAGE} />
      <div className="mt-3">
        <Table
          head={["Came in", ...(client ? [] : ["Client"]), "Phone", "Call", "Recording", "CRM", "Attempts", "Last reply", "Where it stopped"]}
          empty={items.length ? undefined : "No calls at this step in the window."}
        >
          {items.map((c) => (
            <tr key={c.callId}>
              <td className={`${td} text-xs text-slate-500`}>
                {formatTime(c.ingestedAt ?? c.firstCalloutAt)}
                {!c.ingestedAt && <p className="text-amber-700">no ingest log</p>}
              </td>
              {!client && <td className={td}><ClientCell id={c.clientId} names={names} /></td>}
              <td className={`${td} font-mono text-xs`}>
                {c.licenseId ? (
                  <Link href={licenseHref(HEALTH_PATH, c.licenseId, c.clientId)} className={rowLinkClass}>{c.phone ?? "Unknown phone"}</Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={td}><CallCell callId={c.callId} clientId={c.clientId} back={href({})} /></td>
              <td className={`${td} text-xs`}>
                {c.recordingDetail ?? "—"}
                {c.callType && <p className="text-slate-500">{c.callType}</p>}
                {c.verifiedAt || c.deliveredEvents.includes("recording.ready") ? (
                  <p className="text-emerald-700">verified</p>
                ) : c.uploadedAt ? (
                  <p>uploaded</p>
                ) : c.uploadFailedAt ? (
                  <p className="text-red-700">upload failed</p>
                ) : c.unavailableAt ? (
                  <p className="whitespace-normal text-red-700" title="mobile.recording.mark-unavailable">
                    phone couldn&apos;t save it{c.unavailableReason ? `: ${c.unavailableReason}` : ""}
                  </p>
                ) : null}
              </td>
              <td className={`${td} text-xs ${c.firstDeliveredAt ? "text-emerald-700" : c.lastStatus === "failed" ? "font-medium text-red-700" : ""}`}>
                {c.firstDeliveredAt ? `reached ${ago(c.firstDeliveredAt, now)}` : (c.lastStatus ?? "no callout")}
                {c.deliveredEvents.length > 0 && <p className="text-slate-500">{c.deliveredEvents.join(", ")}</p>}
              </td>
              <td className={`${td} text-right tabular-nums`}>{int(c.attempts)}</td>
              <td className="min-w-64 px-3 py-2 align-top text-xs text-slate-600">
                {c.lastHttp !== null ? `HTTP ${c.lastHttp} · ` : c.attempts ? "No response · " : ""}
                {c.lastLabel ?? ""}
              </td>
              <td className={`${td} text-xs ${c.problem ? "text-amber-800" : "text-slate-400"}`}>{c.problem ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
      {total > CALLS_PER_PAGE && <Pager page={page} total={total} href={href} perPage={CALLS_PER_PAGE} />}
    </>
  );
}
