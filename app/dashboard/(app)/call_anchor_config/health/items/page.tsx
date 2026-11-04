import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ISSUE_ID, ITEMS_PER_PAGE as CALLS_PER_PAGE, loadCallItems, loadIssue, WINDOW_DAYS, type WindowDays } from "@/lib/callanchor/health";
import { isCallStage, type CallStage } from "@/lib/callanchor/issues";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
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
import { ago, callHref, formatTime, int, issueHref, licenseHref } from "../format";
import { IssuePanel, Json, LoadingNote, Table, td } from "../parts";

export const metadata: Metadata = { title: "Health items" };

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

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function HealthItemsPage({ searchParams }: PageProps<"/dashboard/call_anchor_config/health/items">) {
  const query = (await searchParams) as Query;
  const asked = KINDS.find((k) => k === one(query.kind));
  const kind = asked === "recordings" ? "calls" : asked;
  const client = one(query.client);
  if (!kind || (client !== undefined && !ID_PATTERN.test(client))) notFound();
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
  const base = { kind, ...(stage ? { stage } : {}), ...(client ? { client } : {}), window: String(days), ...filters, ...(issueId ? { issue: issueId } : {}) };
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...base, ...changes })) if (value !== null) next.set(key, value);
    return `${HEALTH_PATH}/items?${next}`;
  };

  const path = href({ page: page > 1 ? String(page) : null });
  await requireCallAnchorSession(path);
  const [names, phone] = await Promise.all([readClientNames(), filters.license ? readLicense(filters.license) : Promise.resolve(null)]);
  const clientName = client ? (names.get(client) ?? client) : null;
  // How a chip names a filter: a phone by its last four digits, never its raw id (QA U7).
  const chipValue = (key: string, value: string) =>
    key === "auth" || key === "problems" ? "yes" : key === "license" ? `…${phone?.last4 ?? "????"}` : key === "licenses" ? `${phones.length} phones` : value;
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

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: CALLANCHOR_PATH, label: "CallAnchor Config" },
          { href: HEALTH_PATH, label: "Client health" },
          ...(client ? [{ href: `${HEALTH_PATH}/${client}?window=${days}`, label: clientName! }] : []),
          ...(phone ? [{ href: licenseHref(HEALTH_PATH, phone.licenseId), label: `Phone …${phone.last4 ?? "????"}` }] : []),
          ...(issueId ? [{ href: issueHref(HEALTH_PATH, issueId), label: "Issue" }] : []),
        ]}
      />
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
          <Chip href={href({ client: null, page: null })} label="Client" value={clientName!} />
        )}
        {Object.entries(filters).map(([key, value]) => (
          <Chip key={key} href={href({ [key]: null, page: null })} label={FILTERS[kind][key]} value={chipValue(key, value)} />
        ))}
      </div>

      <Suspense key={path} fallback={<LoadingNote text="Reading the stored items…" />}>
        {kind === "syncs" && <SyncItems filter={calloutFilter(filters, client)} days={days} page={page} names={names} href={href} />}
        {kind === "logs" && <LogItems filter={{ ...filters, clientId: client, problems: filters.problems === "1" }} days={days} page={page} names={names} href={href} />}
        {kind === "calls" && <CallItems client={client} license={filters.license} licenses={phones} days={days} stage={stage!} page={page} names={names} href={href} />}
      </Suspense>
    </div>
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
    <Link href={`${HEALTH_PATH}/${id}`} className="text-indigo-700 hover:underline">
      {names.get(id) ?? id}
    </Link>
  );
}

function CallCell({ callId, requestId, back }: { callId: string | null; requestId?: string | null; back: string }) {
  if (!callId) return <span className="text-slate-400">—</span>;
  return (
    <>
      <Link href={callHref(HEALTH_PATH, callId, back)} className="font-mono text-xs text-indigo-700 hover:underline">
        {callId}
      </Link>
      {requestId && (
        <Link href={`${callHref(HEALTH_PATH, callId, back)}#request-${requestId}`} className="block text-xs font-medium text-indigo-700 hover:underline">
          Payload and CRM reply
        </Link>
      )}
    </>
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
          head={["When", ...(allClients ? ["Client"] : []), "Event", "Status", "Platform", "HTTP", "Attempt", "Time", "Reply or error", "Call"]}
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
                <FilterLink href={href({ http: e.httpStatus === null ? "none" : String(e.httpStatus), page: null })}>{e.httpStatus ?? "—"}</FilterLink>
              </td>
              <td className={`${td} tabular-nums`}>{e.attempt}</td>
              <td className={`${td} tabular-nums text-xs text-slate-500`}>{e.durationMs === null ? "—" : `${int(e.durationMs)} ms`}</td>
              <td className="min-w-80 px-3 py-2 align-top text-slate-700">
                <FilterLink href={href({ label: e.label, page: null })}>{e.label}</FilterLink>
              </td>
              <td className={td}><CallCell callId={e.callId} requestId={e.requestId} back={href({})} /></td>
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
              <td className={`${td} ${l.severity === "info" ? "" : "font-medium text-red-700"}`}>
                <FilterLink href={href({ severity: l.severity, page: null })}>{l.severity}</FilterLink>
              </td>
              <td className="min-w-80 max-w-2xl px-3 py-2 align-top text-slate-700">
                {l.message}
                {l.raw && <Json value={l.raw} label="Metadata and full log line" />}
              </td>
              <td className={`${td} text-xs`}>
                {l.detail ? <FilterLink href={href({ detail: l.detail, page: null })}>{l.detail}</FilterLink> : <span className="text-slate-400">—</span>}
              </td>
              <td className={td}><CallCell callId={l.callId} back={href({})} /></td>
            </tr>
          ))}
        </Table>
      </div>
      {total > ITEMS_PER_PAGE && <Pager page={page} total={total} href={href} />}
    </>
  );
}

async function CallItems({ client, license, licenses, days, stage, page, names, href }: {
  client?: string;
  license?: string;
  licenses: string[];
  days: WindowDays;
  stage: CallStage;
  page: number;
  names: Map<string, string>;
  href: Href;
}) {
  const { items, total, title, loadedAt } = await loadCallItems({ clientId: client, licenseId: license, licenseIds: licenses }, stage, days, page);
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
                  <Link href={licenseHref(HEALTH_PATH, c.licenseId)} className="text-indigo-700 hover:underline">…{c.last4 ?? "????"}</Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={td}><CallCell callId={c.callId} back={href({})} /></td>
              <td className={`${td} text-xs`}>
                {c.recordingDetail ?? "—"}
                {c.verifiedAt || c.deliveredEvents.includes("recording.ready") ? (
                  <p className="text-emerald-700">verified</p>
                ) : c.uploadedAt ? (
                  <p>uploaded</p>
                ) : c.uploadFailedAt ? (
                  <p className="text-red-700">upload failed</p>
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
