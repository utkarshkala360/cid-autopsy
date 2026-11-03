import "server-only";
import { after } from "next/server";
import { deliveryLabel, mask } from "@/lib/callanchor/labels";
import { getJson, PortalError } from "@/lib/callanchor/portal";
import { db } from "@/lib/db";

// Keeps CallAnchor's health data in Postgres, so a view pulls only what's new. Each stream stores a
// milestone, its newest row. A pull reads newest-first back to that milestone, usually one page.
// Once a day the trailing 5 days are read again, to pick up rows that changed or arrived late; the
// first pull of a stream is that same 5-day read. GETs only. Tables are in db/schema.sql.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PAGE_SIZE = 100; // CallAnchor caps callout-logs and support/logs at 100 rows a page
const CONCURRENCY = 4;
const FLEET_TIMEOUT_MS = 45_000; // /api/fleet is 1.3 MB and took 7s on 3 Nov 2026
const ROWS_PER_INSERT = 1000;

export const SYNC = {
  pullEveryMs: 30_000, // a pull newer than this is reused, to spare CallAnchor
  overlapMs: 10 * MINUTE, // read a little past the milestone, in case rows land out of order
  refreshDays: 5,
  refreshEveryMs: DAY,
  snapshotEveryMs: 10 * MINUTE,
  retainDays: 90,
  leaseMs: 4 * MINUTE,
  maxPages: 150,
};

// ---- CallAnchor response shapes (only the fields used) ----

type Pagination = { page: number; total: number; totalPages: number; hasMore: boolean };
type Paged<T> = { items: T[]; pagination: Pagination };

type CalloutEvent = {
  id: string;
  platformId: string;
  eventType: string;
  callId: string;
  attempt: number;
  status: string;
  httpStatus?: number | null;
  durationMs?: number | null;
  at: string;
  responsePreview?: string;
  errorMessage?: string;
};

export type Aggregate = { total: number; delivered: number; failed: number; retrying: number; queued: number; successRate: number };

type SystemLog = {
  id: string;
  occurredAt: string;
  category: string;
  severity: string;
  source: string;
  clientId: string | null;
  resourceId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
};

export type License = {
  id: string;
  number: string;
  assignedTo?: { name?: string } | null;
  isLoggedIn: boolean;
  isActive: boolean;
  lastLoginLabel?: string | null;
  lastLoginAppVersion?: string | null;
  lastLoginAndroidBrand?: string | null;
  lastLoginAndroidModel?: string | null;
  recordingEnabled?: boolean | null;
  lifetimeCallRecordCount: number;
};

type Integration = {
  platformId: string;
  platformName: string;
  active: boolean;
  isCustom: boolean;
  scheduler?: { frequency?: string; enabled?: boolean };
  eventTypes?: unknown[];
  connectedAt?: string;
  lastHealthCheck?: string;
};

export type Tenant = {
  callRecords: { datetime: string }[];
  licenses: License[];
  integrations: Integration[];
  storageSettings?: { lastError?: string | null; migrationFailed?: number };
  trialRecordedCalls?: number;
  trialPendingRecordings?: number;
  trialRecordingLimit?: number | null;
  trialRecordingAtLimit?: boolean;
  trialExpired?: boolean;
  trialDaysRemaining?: number | null;
  contractRecordedCalls?: number;
  contractPendingRecordings?: number;
  contractRecordingLimit?: number | null;
  contractRecordingAtLimit?: boolean;
  contractLicenseOverCap?: boolean;
  contractLicenseOverBy?: number;
};

type ClientMetrics = { clientId: string; companyName: string; status: string; totalCalls: number; callsToday: number; totalLicenses: number };

export type OneApiStatus = { linked: boolean; assignProductStatus: string | null; accountStatus: string; backfillRecommended: boolean };

// ---- Stored shapes ----

export type StoredCallout = {
  id: string;
  clientId: string;
  platformId: string;
  eventType: string;
  callId: string;
  attempt: number;
  status: string;
  httpStatus: number | null;
  durationMs: number | null;
  at: string;
  label: string;
};

export type StoredLog = {
  id: string;
  clientId: string | null;
  occurredAt: string;
  category: string;
  severity: string;
  source: string;
  resourceId: string | null;
  message: string;
  detail: string | null;
};

export type TenantSummary = ReturnType<typeof summarizeTenant>;

export type Snapshot = {
  clientId: string;
  companyName: string | null;
  status: string | null;
  fetchedAt: string | null;
  metrics: { totalCalls: number; callsToday: number; totalLicenses: number } | null;
  tenant: TenantSummary | null;
  oneApi: OneApiStatus | null;
  aggregate: Aggregate | null;
};

// The tenant reduced to counts and integration settings: no agent names, numbers or credentials.
export function summarizeTenant(tenant: Tenant, status: string) {
  const trial = status === "trial";
  const licenses = tenant.licenses;
  const integrations = tenant.integrations.map((i) => ({
    platformId: i.platformId,
    platformName: i.platformName,
    active: i.active,
    isCustom: i.isCustom,
    frequency: i.scheduler?.frequency ?? null,
    schedulerEnabled: i.scheduler?.enabled ?? null,
    eventTypes: (i.eventTypes ?? []).filter((e): e is string => typeof e === "string"),
    connectedAt: i.connectedAt ?? null,
    lastHealthCheck: i.lastHealthCheck ?? null,
  }));
  const active = integrations.filter((i) => i.active);
  return {
    lastCallAt: tenant.callRecords.reduce<string | null>((latest, r) => (!latest || r.datetime > latest ? r.datetime : latest), null),
    licenses: licenses.length,
    loggedIn: licenses.filter((l) => l.isLoggedIn).length,
    loggedInNoCalls: licenses.filter((l) => l.isLoggedIn && l.lifetimeCallRecordCount === 0).length,
    recordedCalls: (trial ? tenant.trialRecordedCalls : tenant.contractRecordedCalls) ?? 0,
    pendingRecordings: (trial ? tenant.trialPendingRecordings : tenant.contractPendingRecordings) ?? 0,
    recordingLimit: (trial ? tenant.trialRecordingLimit : tenant.contractRecordingLimit) ?? null,
    recordingAtLimit: Boolean(trial ? tenant.trialRecordingAtLimit : tenant.contractRecordingAtLimit),
    trialExpired: trial && Boolean(tenant.trialExpired),
    trialDaysRemaining: trial ? (tenant.trialDaysRemaining ?? null) : null,
    licenseOverBy: tenant.contractLicenseOverCap ? (tenant.contractLicenseOverBy ?? 0) : 0,
    storageError: tenant.storageSettings?.lastError ? mask(tenant.storageSettings.lastError).slice(0, 140) : null,
    migrationFailed: tenant.storageSettings?.migrationFailed ?? 0,
    integrations,
    activeIntegrations: active.map((i) => i.platformName),
    // recording.ready is only sent to integrations that subscribe to it.
    takesRecordings: active.some((i) => i.eventTypes.includes("recording.ready")),
  };
}

// ---- Fetching ----

export async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await run(items[i]);
      }
    }),
  );
  return results;
}

// Session rejections must reach the page, which sends the member to the OTP screen.
export const optional = <T>(promise: Promise<T>) =>
  promise.catch((error) => {
    if (error instanceof PortalError && error.rejected) throw error;
    return null;
  });

// Reads a newest-first log until it passes `since`. `complete` is false when `maxPages` ran out first.
async function pagesSince<T extends { id: string }, Extra = unknown>(
  fetchPage: (page: number) => Promise<Paged<T> & Extra>,
  time: (item: T) => string,
  since: number,
) {
  const first = await fetchPage(1);
  const items = [...first.items];
  const reachesSince = (page: T[]) => page.length === 0 || Date.parse(time(page[page.length - 1])) < since;
  let complete = reachesSince(first.items) || !first.pagination.hasMore;
  const last = Math.min(first.pagination.totalPages, SYNC.maxPages);
  let page = 2;
  while (!complete && page <= last) {
    const numbers = Array.from({ length: Math.min(CONCURRENCY, last - page + 1) }, (_, i) => page + i);
    for (const result of await Promise.all(numbers.map(fetchPage))) {
      items.push(...result.items);
      if (reachesSince(result.items)) complete = true;
    }
    page += numbers.length;
  }
  complete ||= page > first.pagination.totalPages;
  // Pages shift while new rows arrive, so a row can be read twice.
  const unique = [...new Map(items.map((item) => [item.id, item])).values()].filter((item) => Date.parse(time(item)) >= since);
  const newestAt = unique.reduce<string | null>((newest, item) => (!newest || time(item) > newest ? time(item) : newest), null);
  return { first, items: unique, complete, newestAt };
}

// ---- Saving ----

function chunks<T>(rows: T[]) {
  return Array.from({ length: Math.ceil(rows.length / ROWS_PER_INSERT) }, (_, i) => rows.slice(i * ROWS_PER_INSERT, (i + 1) * ROWS_PER_INSERT));
}

async function saveCallouts(clientId: string, events: CalloutEvent[]) {
  for (const rows of chunks(events)) {
    await db()`
      INSERT INTO ca_callout_events (id, client_id, platform_id, event_type, call_id, attempt, status, http_status, duration_ms, at, label)
      SELECT * FROM unnest(
        ${rows.map((e) => e.id)}::text[],
        ${rows.map(() => clientId)}::text[],
        ${rows.map((e) => e.platformId)}::text[],
        ${rows.map((e) => e.eventType)}::text[],
        ${rows.map((e) => e.callId)}::text[],
        ${rows.map((e) => e.attempt)}::int[],
        ${rows.map((e) => e.status)}::text[],
        ${rows.map((e) => e.httpStatus ?? null)}::int[],
        ${rows.map((e) => e.durationMs ?? null)}::int[],
        ${rows.map((e) => e.at)}::timestamptz[],
        ${rows.map((e) => deliveryLabel(e))}::text[]
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, http_status = EXCLUDED.http_status,
        duration_ms = EXCLUDED.duration_ms, label = EXCLUDED.label
    `;
  }
}

// The pipeline needs one metadata field: a call's recordingStatus, or a webhook sync's status.
const logDetail = (meta: Record<string, unknown> | null) => {
  const value = meta?.recordingStatus ?? meta?.status;
  return typeof value === "string" ? value : null;
};

async function saveLogs(logs: SystemLog[]) {
  for (const rows of chunks(logs)) {
    await db()`
      INSERT INTO ca_system_logs (id, client_id, occurred_at, category, severity, source, resource_id, message, detail)
      SELECT * FROM unnest(
        ${rows.map((l) => l.id)}::text[],
        ${rows.map((l) => l.clientId)}::text[],
        ${rows.map((l) => l.occurredAt)}::timestamptz[],
        ${rows.map((l) => l.category)}::text[],
        ${rows.map((l) => l.severity)}::text[],
        ${rows.map((l) => l.source)}::text[],
        ${rows.map((l) => l.resourceId)}::text[],
        ${rows.map((l) => mask(l.message).slice(0, 300))}::text[],
        ${rows.map((l) => logDetail(l.metadata))}::text[]
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// ---- Streams and milestones ----

type StreamState = { milestoneAt: number | null; pulledAt: number | null; refreshedAt: number | null };
type Mode = "latest" | "refresh";

const time = (value: unknown) => (value ? new Date(value as string).getTime() : null);
const iso = (value: unknown) => new Date(value as string).toISOString();

async function readStates() {
  const rows = await db()`SELECT stream, milestone_at, pulled_at, refreshed_at FROM ca_sync_state`;
  return new Map<string, StreamState>(
    rows.map((r) => [r.stream, { milestoneAt: time(r.milestone_at), pulledAt: time(r.pulled_at), refreshedAt: time(r.refreshed_at) }]),
  );
}

// Whether a stream has work to do. Its first pull is always the 5-day read.
function isDue(state: StreamState | undefined, mode: Mode, now = Date.now()) {
  if (!state?.refreshedAt) return true;
  if (mode === "refresh") return now - state.refreshedAt >= SYNC.refreshEveryMs;
  return !state.pulledAt || now - state.pulledAt >= SYNC.pullEveryMs;
}

// Takes the stream's lease, or returns null when another pull holds it.
async function claim(stream: string): Promise<StreamState | null> {
  const [row] = await db()`
    INSERT INTO ca_sync_state (stream, lease_until)
    VALUES (${stream}, now() + ${`${SYNC.leaseMs} milliseconds`}::interval)
    ON CONFLICT (stream) DO UPDATE SET lease_until = EXCLUDED.lease_until
      WHERE ca_sync_state.lease_until IS NULL OR ca_sync_state.lease_until < now()
    RETURNING milestone_at, pulled_at, refreshed_at
  `;
  return row ? { milestoneAt: time(row.milestone_at), pulledAt: time(row.pulled_at), refreshedAt: time(row.refreshed_at) } : null;
}

async function release(stream: string, done: { milestoneAt?: string | null; refreshed?: boolean; incomplete?: boolean; error?: string }) {
  await db()`
    UPDATE ca_sync_state SET
      lease_until = NULL,
      milestone_at = GREATEST(milestone_at, ${done.milestoneAt ?? null}::timestamptz),
      pulled_at = CASE WHEN ${!done.error}::boolean THEN now() ELSE pulled_at END,
      refreshed_at = CASE
        WHEN ${done.incomplete ?? false}::boolean THEN NULL
        WHEN ${done.refreshed ?? false}::boolean THEN now()
        ELSE refreshed_at END,
      last_error = ${done.error ?? null}
    WHERE stream = ${stream}
  `;
}

const describe = (error: unknown) =>
  error instanceof PortalError ? `CallAnchor returned HTTP ${error.status}` : error instanceof Error ? error.message.slice(0, 200) : "Unknown error";

// Pulls one stream from its milestone, or the last 5 days on a refresh, and moves the milestone on.
async function runStream(
  stream: string,
  mode: Mode,
  pull: (since: number) => Promise<{ newestAt: string | null; complete: boolean }>,
) {
  const state = await claim(stream);
  if (!state) return;
  const now = Date.now();
  if (!isDue(state, mode, now)) {
    await db()`UPDATE ca_sync_state SET lease_until = NULL WHERE stream = ${stream}`;
    return;
  }
  const refresh = mode === "refresh" || !state.refreshedAt;
  const fiveDaysAgo = now - SYNC.refreshDays * DAY;
  const milestone = (state.milestoneAt ?? state.refreshedAt ?? fiveDaysAgo) - SYNC.overlapMs;
  // A refresh also covers any gap since the milestone, if nobody looked for longer than 5 days.
  const since = refresh ? Math.max(Math.min(fiveDaysAgo, milestone), now - SYNC.retainDays * DAY) : milestone;
  try {
    const { newestAt, complete } = await pull(since);
    // A pull that ran out of pages leaves a gap, so the next one does the 5-day read instead.
    await release(stream, { milestoneAt: newestAt, refreshed: refresh, incomplete: !refresh && !complete });
  } catch (error) {
    await release(stream, { error: describe(error) });
    throw error;
  }
}

const pullCallouts = (cookie: string, clientId: string, mode: Mode) =>
  runStream(`callouts:${clientId}`, mode, async (since) => {
    const result = await pagesSince(
      (page) =>
        getJson<Paged<CalloutEvent> & { aggregate: Aggregate }>(cookie, `/api/clients/${clientId}/callout-logs?page=${page}&limit=${PAGE_SIZE}`),
      (event) => event.at,
      since,
    );
    await saveCallouts(clientId, result.items);
    await db()`
      INSERT INTO ca_client_snapshots (client_id, aggregate) VALUES (${clientId}, ${JSON.stringify(result.first.aggregate)}::jsonb)
      ON CONFLICT (client_id) DO UPDATE SET aggregate = EXCLUDED.aggregate
    `;
    return result;
  });

// One stream for every client's system logs: the endpoint can return them all at once.
const pullLogs = (cookie: string, mode: Mode) =>
  runStream("logs", mode, async (since) => {
    const result = await pagesSince(
      (page) => getJson<Paged<SystemLog>>(cookie, `/api/support/logs?page=${page}&limit=${PAGE_SIZE}`),
      (log) => log.occurredAt,
      since,
    );
    await saveLogs(result.items);
    if (mode === "refresh") await prune();
    return result;
  });

async function prune() {
  const cutoff = `${SYNC.retainDays} days`;
  await db()`DELETE FROM ca_callout_events WHERE at < now() - ${cutoff}::interval`;
  await db()`DELETE FROM ca_system_logs WHERE occurred_at < now() - ${cutoff}::interval`;
}

// Fleet metrics, tenant counts and OneAPI status for every client. Not paged, so no milestone.
async function pullSnapshots(cookie: string) {
  const state = await claim("snapshots");
  if (!state) return;
  try {
    const fleet = await getJson<{ clientMetrics: ClientMetrics[] }>(cookie, "/api/fleet", FLEET_TIMEOUT_MS);
    await mapLimit(fleet.clientMetrics, CONCURRENCY, async (m) => {
      const [tenant, oneApi] = await Promise.all([
        optional(getJson<Tenant>(cookie, `/api/clients/${m.clientId}/tenant`)),
        optional(getJson<OneApiStatus>(cookie, `/api/clients/${m.clientId}/oneapi/status`)),
      ]);
      const data = {
        metrics: { totalCalls: m.totalCalls, callsToday: m.callsToday, totalLicenses: m.totalLicenses },
        tenant: tenant ? summarizeTenant(tenant, m.status) : null,
        oneApi: oneApi && {
          linked: oneApi.linked,
          assignProductStatus: oneApi.assignProductStatus,
          accountStatus: oneApi.accountStatus,
          backfillRecommended: oneApi.backfillRecommended,
        },
      };
      await db()`
        INSERT INTO ca_client_snapshots (client_id, company_name, status, data, fetched_at)
        VALUES (${m.clientId}, ${m.companyName}, ${m.status}, ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (client_id) DO UPDATE SET
          company_name = EXCLUDED.company_name, status = EXCLUDED.status, data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
      `;
    });
    await release("snapshots", { refreshed: true });
  } catch (error) {
    await release("snapshots", { error: describe(error) });
    throw error;
  }
}

// ---- What a page calls ----

export type PullReport = { errors: string[] };

// Runs a pull, keeping CallAnchor errors for the page. Session rejections are rethrown.
async function attempt(report: PullReport, label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof PortalError && error.rejected) throw error;
    report.errors.push(`${label}: ${describe(error)}`);
  }
}

// After the response is sent: the daily 5-day refresh for every stream that's due.
function refreshLater(cookie: string, streams: string[], states: Map<string, StreamState>) {
  const due = streams.filter((s) => states.get(s)?.refreshedAt && isDue(states.get(s), "refresh"));
  if (due.length === 0) return;
  after(async () => {
    await mapLimit(due, CONCURRENCY, async (stream) => {
      try {
        if (stream === "logs") await pullLogs(cookie, "refresh");
        else await pullCallouts(cookie, stream.slice("callouts:".length), "refresh");
      } catch {
        // Recorded in ca_sync_state.last_error; the next view tries again.
      }
    });
  });
}

// Brings every client up to date. Waits only for what's new; a stale snapshot and the daily 5-day
// refresh run after the response.
export async function pullFleet(cookie: string): Promise<PullReport> {
  const report: PullReport = { errors: [] };
  const states = await readStates();
  const snapshots = states.get("snapshots");
  const logs = attempt(report, "System logs", () => (isDue(states.get("logs"), "latest") ? pullLogs(cookie, "latest") : Promise.resolve()));

  if (!snapshots?.refreshedAt) {
    await attempt(report, "Client list", () => pullSnapshots(cookie));
  } else if (Date.now() - snapshots.refreshedAt >= SYNC.snapshotEveryMs) {
    after(() => pullSnapshots(cookie).catch(() => undefined));
  }

  const clients = (await db()`SELECT client_id FROM ca_client_snapshots WHERE data IS NOT NULL`).map((r) => r.client_id as string);
  await mapLimit(clients, CONCURRENCY, (clientId) =>
    attempt(report, "CRM syncs", () => (isDue(states.get(`callouts:${clientId}`), "latest") ? pullCallouts(cookie, clientId, "latest") : Promise.resolve())),
  );
  await logs;
  refreshLater(cookie, ["logs", ...clients.map((c) => `callouts:${c}`)], states);
  return report;
}

// Brings one client up to date: its CRM syncs and the shared system logs.
export async function pullClient(cookie: string, clientId: string): Promise<PullReport> {
  const report: PullReport = { errors: [] };
  const states = await readStates();
  const stream = `callouts:${clientId}`;
  await Promise.all([
    attempt(report, "System logs", () => (isDue(states.get("logs"), "latest") ? pullLogs(cookie, "latest") : Promise.resolve())),
    attempt(report, "CRM syncs", () => (isDue(states.get(stream), "latest") ? pullCallouts(cookie, clientId, "latest") : Promise.resolve())),
  ]);
  refreshLater(cookie, ["logs", stream], states);
  return report;
}

// ---- Reading ----

export async function readCallouts(clientId: string | null, since: number): Promise<StoredCallout[]> {
  const from = new Date(since).toISOString();
  const rows = clientId
    ? await db()`SELECT * FROM ca_callout_events WHERE client_id = ${clientId} AND at >= ${from} ORDER BY at DESC`
    : await db()`SELECT * FROM ca_callout_events WHERE at >= ${from} ORDER BY at DESC`;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    platformId: r.platform_id,
    eventType: r.event_type,
    callId: r.call_id,
    attempt: r.attempt,
    status: r.status,
    httpStatus: r.http_status,
    durationMs: r.duration_ms,
    at: iso(r.at),
    label: r.label,
  }));
}

export async function readLogs(clientId: string | null, since: number): Promise<StoredLog[]> {
  const from = new Date(since).toISOString();
  const rows = clientId
    ? await db()`SELECT * FROM ca_system_logs WHERE client_id = ${clientId} AND occurred_at >= ${from} ORDER BY occurred_at DESC`
    : await db()`SELECT * FROM ca_system_logs WHERE occurred_at >= ${from} ORDER BY occurred_at DESC`;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    occurredAt: iso(r.occurred_at),
    category: r.category,
    severity: r.severity,
    source: r.source,
    resourceId: r.resource_id,
    message: r.message,
    detail: r.detail,
  }));
}

export async function readSnapshots(clientId?: string): Promise<Snapshot[]> {
  const rows = clientId
    ? await db()`SELECT * FROM ca_client_snapshots WHERE client_id = ${clientId}`
    : await db()`SELECT * FROM ca_client_snapshots WHERE data IS NOT NULL`;
  return rows.map((r) => ({
    clientId: r.client_id,
    companyName: r.company_name,
    status: r.status,
    fetchedAt: r.fetched_at ? iso(r.fetched_at) : null,
    metrics: r.data?.metrics ?? null,
    tenant: r.data?.tenant ?? null,
    oneApi: r.data?.oneApi ?? null,
    aggregate: r.aggregate ?? null,
  }));
}

export type StoreStatus = {
  pulledAt: string | null;
  refreshedAt: string | null;
  snapshotAt: string | null;
  callsSince: string | null;
  logsSince: string | null;
  streamErrors: number;
};

// When the stored data was last pulled and refreshed, and how far back it goes.
export async function readStoreStatus(clientId: string | null): Promise<StoreStatus> {
  const streams = clientId ? ["logs", `callouts:${clientId}`] : null;
  const [[state], [calls], [logs]] = await Promise.all([
    streams
      ? db()`
          SELECT min(pulled_at) AS pulled_at, min(refreshed_at) AS refreshed_at, count(last_error) AS errors,
                 (SELECT fetched_at FROM ca_client_snapshots WHERE client_id = ${clientId}) AS snapshot_at
          FROM ca_sync_state WHERE stream = ANY(${streams}::text[])`
      : db()`
          SELECT min(pulled_at) FILTER (WHERE stream <> 'snapshots') AS pulled_at,
                 min(refreshed_at) FILTER (WHERE stream <> 'snapshots') AS refreshed_at,
                 count(last_error) AS errors,
                 max(refreshed_at) FILTER (WHERE stream = 'snapshots') AS snapshot_at
          FROM ca_sync_state`,
    clientId
      ? db()`SELECT min(at) AS since FROM ca_callout_events WHERE client_id = ${clientId}`
      : db()`SELECT min(at) AS since FROM ca_callout_events`,
    db()`SELECT min(occurred_at) AS since FROM ca_system_logs`,
  ]);
  return {
    pulledAt: state?.pulled_at ? iso(state.pulled_at) : null,
    refreshedAt: state?.refreshed_at ? iso(state.refreshed_at) : null,
    snapshotAt: state?.snapshot_at ? iso(state.snapshot_at) : null,
    callsSince: calls?.since ? iso(calls.since) : null,
    logsSince: logs?.since ? iso(logs.since) : null,
    streamErrors: Number(state?.errors ?? 0),
  };
}
