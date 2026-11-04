import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadRecordingItems, RECORDING_STAGES, WINDOW_DAYS, type RecordingStage, type WindowDays } from "@/lib/callanchor/health";
import { CALLANCHOR_PATH, HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import {
  ITEMS_PER_PAGE,
  readCalloutPage,
  readClientNames,
  readLogPage,
  readStoreStatus,
  type CalloutFilter,
  type LogFilter,
} from "@/lib/callanchor/store";
import { ago, callHref, formatTime, int } from "../format";
import { Json, LoadingNote, Table, td } from "../parts";

export const metadata: Metadata = { title: "Health items" };

// Every row behind a flag, count or error on the health pages, one per line for debugging. Read
// from the store only: the dashboard that linked here has just pulled what's new.

const ID_PATTERN = /^[\w-]{1,100}$/;
const KINDS = ["syncs", "recordings", "logs"] as const;
type Kind = (typeof KINDS)[number];
type Query = Record<string, string | string[] | undefined>;

// The filters each kind takes, with how a chip names them.
const FILTERS: Record<Kind, Record<string, string>> = {
  syncs: { status: "Status", event: "Event", platform: "Platform", http: "HTTP", label: "Reply or error", auth: "Sign-in failures" },
  recordings: {},
  logs: { source: "Source", severity: "Severity", detail: "Detail", starts: "Message starts" },
};

const STAGE_TITLES: Record<RecordingStage, string> = {
  stuck: "Recordings stuck or failed after the upload began",
  waiting: "Recordings the phone hasn't uploaded after 30 minutes",
  unsynced: "Uploaded recordings not synced to the CRM",
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function HealthItemsPage({ searchParams }: PageProps<"/dashboard/call_anchor_config/health/items">) {
  const query = (await searchParams) as Query;
  const kind = KINDS.find((k) => k === one(query.kind));
  const client = one(query.client);
  if (!kind || (client !== undefined && !ID_PATTERN.test(client))) notFound();
  const stage = RECORDING_STAGES.find((s) => s === one(query.stage));
  if (kind === "recordings" && !stage) notFound();
  const days = (WINDOW_DAYS.find((d) => String(d) === one(query.window)) ?? 1) as WindowDays;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(query.page) ?? "1", 10) || 1));

  // Only the filters this kind knows, so links rebuilt from them stay clean.
  const filters: Record<string, string> = {};
  for (const key of Object.keys(FILTERS[kind])) {
    const value = one(query[key]);
    if (value !== undefined && value.length <= 300) filters[key] = value;
  }
  const base = { kind, ...(stage ? { stage } : {}), ...(client ? { client } : {}), window: String(days), ...filters };
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...base, ...changes })) if (value !== null) next.set(key, value);
    return `${HEALTH_PATH}/items?${next}`;
  };

  const path = href({ page: page > 1 ? String(page) : null });
  await requireCallAnchorSession(path);
  const names = await readClientNames();
  const clientName = client ? (names.get(client) ?? client) : null;
  const title =
    kind === "recordings"
      ? STAGE_TITLES[stage!]
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
        ]}
      />
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
          <Chip key={key} href={href({ [key]: null, page: null })} label={FILTERS[kind][key]} value={key === "auth" ? "yes" : value} />
        ))}
      </div>

      <Suspense key={path} fallback={<LoadingNote text="Reading the stored items…" />}>
        {kind === "syncs" && <SyncItems filter={calloutFilter(filters, client)} days={days} page={page} names={names} href={href} />}
        {kind === "logs" && <LogItems filter={{ ...filters, clientId: client }} days={days} page={page} names={names} href={href} />}
        {kind === "recordings" && <RecordingItems client={client ?? null} days={days} stage={stage!} page={page} href={href} />}
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

async function StoreLine({ now }: { now: number }) {
  const store = await readStoreStatus(null);
  return <p className="mt-4 text-xs text-slate-400">From stored data. Latest changes pulled {ago(store.pulledAt, now)}.</p>;
}

function Pager({ page, total, href }: { page: number; total: number; href: Href }) {
  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const from = total ? (page - 1) * ITEMS_PER_PAGE + 1 : 0;
  const to = Math.min(total, page * ITEMS_PER_PAGE);
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

function CallCell({ callId, requestId }: { callId: string | null; requestId?: string | null }) {
  if (!callId) return <span className="text-slate-400">—</span>;
  return (
    <>
      <Link href={callHref(HEALTH_PATH, callId)} className="font-mono text-xs text-indigo-700 hover:underline">
        {callId}
      </Link>
      {requestId && (
        <Link href={`${callHref(HEALTH_PATH, callId)}#request-${requestId}`} className="block text-xs font-medium text-indigo-700 hover:underline">
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
              <td className={td}><CallCell callId={e.callId} requestId={e.requestId} /></td>
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
              <td className={td}><CallCell callId={l.callId} /></td>
            </tr>
          ))}
        </Table>
      </div>
      {total > ITEMS_PER_PAGE && <Pager page={page} total={total} href={href} />}
    </>
  );
}

async function RecordingItems({ client, days, stage, page, href }: { client: string | null; days: WindowDays; stage: RecordingStage; page: number; href: Href }) {
  const { items, loadedAt } = await loadRecordingItems(client, days, stage);
  const now = Date.parse(loadedAt);
  const shown = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  return (
    <>
      <StoreLine now={now} />
      {stage === "unsynced" && (
        <p className="mt-2 text-sm text-slate-500">
          A recording counts as synced once call.completed or recording.ready reaches the CRM for its call (a 2xx reply).
        </p>
      )}
      <Pager page={page} total={items.length} href={href} />
      <div className="mt-3">
        <Table head={[...(client ? [] : ["Client"]), "Call", "Where it stopped", "Since", "CRM callouts for this call"]} empty={items.length ? undefined : "Nothing at this stage in the window."}>
          {shown.map((r) => (
            <tr key={`${r.clientId}|${r.callId}`}>
              {!client && (
                <td className={td}>
                  <Link href={`${HEALTH_PATH}/${r.clientId}`} className="text-indigo-700 hover:underline">{r.companyName}</Link>
                </td>
              )}
              <td className={td}><CallCell callId={r.callId} /></td>
              <td className={td}>{r.stage}</td>
              <td className={`${td} text-xs text-slate-500`}>{formatTime(r.since)} ({ago(r.since, now)})</td>
              <td className={`${td} text-xs`}>{r.callouts.length ? r.callouts.join(", ") : <span className="text-slate-400">none</span>}</td>
            </tr>
          ))}
        </Table>
      </div>
      {items.length > ITEMS_PER_PAGE && <Pager page={page} total={items.length} href={href} />}
    </>
  );
}
