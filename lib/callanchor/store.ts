import "server-only";
import { after } from "next/server";
import { CRM_STATUS_SQL, crmStatus, deliveryLabel, mask } from "@/lib/callanchor/labels";
import { auditLinks, callFacts, type AuditEntry } from "@/lib/callanchor/links";
import { getJson, PortalError } from "@/lib/callanchor/portal";
import { db } from "@/lib/db";

// Keeps CallAnchor's health data in Postgres, so a view pulls only what's new. Each stream stores a
// milestone, its newest row. A pull reads newest-first back to that milestone, usually one page.
// Once a day the trailing 5 days are read again, to pick up rows that changed or arrived late; the
// first pull of a stream is that same 5-day read. Each save also rebuilds the calls it touched in
// ca_calls, one row per call. GETs only. Tables are in db/schema.sql.

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
  // Detailed rows (system logs, CRM callouts, calls) are kept 15 days; snapshots (daily summaries,
  // phone and integration changes, portal events) 30 days (owner, 2026-11-13).
  retainDays: 15,
  snapshotDays: 30,
  leaseMs: 4 * MINUTE,
  maxPages: 150,
  // The fleet-wide log pull can't keep up with the busiest clients (finding D in
  // docs/client-health-plan.md), so these also get their own per-client log stream.
  busyClients: 3,
  busyCallsPerDay: 50,
};

// ---- CallAnchor response shapes (only the fields used) ----

type Pagination = { page: number; total: number; totalPages: number; hasMore: boolean };
type Paged<T> = { items: T[]; pagination: Pagination };

type CalloutEvent = {
  id: string;
  requestId: string;
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
  // The payload as a JSON string, possibly cut short. Only callFacts() reads it; it isn't stored.
  payloadPreview?: string;
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
  actorType?: string | null;
  actorId?: string | null;
};

// GET anchor-logs/{requestId}: one delivery request, its payload and every attempt.
export type AnchorLog = {
  request: { id: string; status: string; endpoint: string; payloadJson?: unknown; attemptCount?: number; eventType: string; createdAt?: string; completedAt?: string | null };
  events: (CalloutEvent & { endpoint?: string; payloadPreview?: string; externalRecordId?: string; calleeName?: string })[];
  call?: Record<string, unknown>;
  platform?: { slug: string; name: string; isCustom?: boolean };
};

export type License = {
  id: string;
  number: string;
  status?: string | null;
  assignedTo?: { id?: string; name?: string } | null;
  isLoggedIn: boolean;
  isActive: boolean;
  lastLoginLabel?: string | null;
  lastLoginAppVersion?: string | null;
  lastLoginAppVersionCode?: number | null;
  lastLoginAndroidBrand?: string | null;
  lastLoginAndroidModel?: string | null;
  lastLoginFirmwareVersion?: string | null;
  lastLoginGoogleDialerPresent?: boolean | null;
  recordingEnabled?: boolean | null;
  callCapturePolicy?: string | null;
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

// GET /api/clients/{id}: the account. Only the fields kept.
export type ClientDetails = { licenseCount?: number | null; plan?: string | null; accessSuspended?: boolean };

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
  // The CRM's outcome (see crmStatus); `callAnchorStatus` is what CallAnchor recorded.
  status: string;
  callAnchorStatus: string;
  requestId: string | null;
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
  callId: string | null;
  message: string;
  detail: string | null;
  // The log line as CallAnchor sent it. Read only for item views, never for summaries.
  raw?: Record<string, unknown> | null;
};

export type TenantSummary = ReturnType<typeof summarizeTenant>;

export type Snapshot = {
  clientId: string;
  companyName: string | null;
  status: string | null;
  fetchedAt: string | null;
  metrics: { totalCalls: number; callsToday: number; totalLicenses: number } | null;
  // Seats bought, plan and suspension, from the snapshot. Missing on snapshots saved before 5 Nov.
  client: { licenseCount: number | null; plan: string | null; accessSuspended: boolean } | null;
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
    takesRecordings: takesRecordings(integrations),
  };
}

// recording.ready is only sent to integrations that subscribe to it. An active integration that
// lists no events gets them all: 11 of the 15 such clients send recording.ready (finding A).
export const takesRecordings = (integrations: { active: boolean; eventTypes: string[] }[]) =>
  integrations.some((i) => i.active && (i.eventTypes.length === 0 || i.eventTypes.includes("recording.ready")));

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
    const facts = rows.map((e) => callFacts(e.payloadPreview));
    await db()`
      INSERT INTO ca_callout_events (id, client_id, platform_id, event_type, call_id, attempt, status, http_status, duration_ms, at, label, request_id,
        has_recording, call_type, call_seconds, call_started_at, agent_last4, facts_read)
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
        ${rows.map((e) => deliveryLabel(e))}::text[],
        ${rows.map((e) => e.requestId ?? null)}::text[],
        ${facts.map((f) => f?.hasRecording ?? null)}::boolean[],
        ${facts.map((f) => f?.callType ?? null)}::text[],
        ${facts.map((f) => f?.seconds ?? null)}::int[],
        ${facts.map((f) => f?.startedAt ?? null)}::timestamptz[],
        ${facts.map((f) => f?.agentLast4 ?? null)}::text[],
        ${facts.map((f) => f !== null)}::boolean[]
      )
      ON CONFLICT (id) DO UPDATE SET
        attempt = EXCLUDED.attempt, status = EXCLUDED.status, http_status = EXCLUDED.http_status,
        duration_ms = EXCLUDED.duration_ms, label = EXCLUDED.label, request_id = EXCLUDED.request_id,
        has_recording = coalesce(EXCLUDED.has_recording, ca_callout_events.has_recording),
        call_type = coalesce(EXCLUDED.call_type, ca_callout_events.call_type),
        call_seconds = coalesce(EXCLUDED.call_seconds, ca_callout_events.call_seconds),
        call_started_at = coalesce(EXCLUDED.call_started_at, ca_callout_events.call_started_at),
        agent_last4 = coalesce(EXCLUDED.agent_last4, ca_callout_events.agent_last4),
        facts_read = EXCLUDED.facts_read OR coalesce(ca_callout_events.facts_read, false)
    `;
  }
  await refreshCalls(events.map((e) => e.callId));
}

// Rebuilds these calls in ca_calls from everything stored about them (ca_refresh_calls in schema.sql).
async function refreshCalls(callIds: (string | null)[]) {
  const ids = [...new Set(callIds.filter((id): id is string => !!id))];
  for (const rows of chunks(ids)) await db()`SELECT ca_refresh_calls(${rows}::text[])`;
}

// The pipeline needs one metadata field: a call's recordingStatus, or a webhook sync's status.
const logDetail = (meta: Record<string, unknown> | null) => {
  const value = meta?.recordingStatus ?? meta?.status;
  return typeof value === "string" ? value : null;
};

// The call a log line is about. CRM sync lines name a callout request as their resource.
const logCallId = (log: SystemLog) => {
  const id = log.metadata?.callRecordId;
  return typeof id === "string" ? id : log.resourceId;
};

// The license that made the call, on mobile.call.create. actorId isn't used: on upload-complete it's
// the member, not the license.
const logLicenseId = (log: SystemLog) => {
  const id = log.metadata?.licenseId;
  return typeof id === "string" ? id : null;
};

async function saveLogs(logs: SystemLog[]) {
  for (const rows of chunks(logs)) {
    await db()`
      INSERT INTO ca_system_logs (id, client_id, occurred_at, category, severity, source, resource_id, message, detail, call_id, raw, actor_type, actor_id, license_id)
      SELECT * FROM unnest(
        ${rows.map((l) => l.id)}::text[],
        ${rows.map((l) => l.clientId)}::text[],
        ${rows.map((l) => l.occurredAt)}::timestamptz[],
        ${rows.map((l) => l.category)}::text[],
        ${rows.map((l) => l.severity)}::text[],
        ${rows.map((l) => l.source)}::text[],
        ${rows.map((l) => l.resourceId)}::text[],
        ${rows.map((l) => mask(l.message).slice(0, 300))}::text[],
        ${rows.map((l) => logDetail(l.metadata))}::text[],
        ${rows.map((l) => logCallId(l))}::text[],
        ${rows.map((l) => JSON.stringify(l))}::jsonb[],
        ${rows.map((l) => l.actorType ?? null)}::text[],
        ${rows.map((l) => l.actorId ?? null)}::text[],
        ${rows.map((l) => logLicenseId(l))}::text[]
      )
      ON CONFLICT (id) DO UPDATE SET
        call_id = EXCLUDED.call_id, raw = EXCLUDED.raw, actor_type = EXCLUDED.actor_type,
        actor_id = EXCLUDED.actor_id, license_id = EXCLUDED.license_id
      WHERE ca_system_logs.raw IS NULL
    `;
  }
  await refreshCalls(logs.map(logCallId));
}

// Portal events, stored whole with the license, integration and callout each one names.
async function saveAudit(entries: AuditEntry[]) {
  for (const rows of chunks(entries)) {
    const links = rows.map(auditLinks);
    await db()`
      INSERT INTO ca_audit_logs (id, client_id, occurred_at, action, resource_type, resource_id, actor_type, license_id, platform_id,
        callout_log_id, correlation_id, raw)
      SELECT * FROM unnest(
        ${rows.map((a) => a.id)}::text[],
        ${rows.map((a) => a.clientId ?? null)}::text[],
        ${rows.map((a) => a.occurredAt)}::timestamptz[],
        ${rows.map((a) => a.action)}::text[],
        ${rows.map((a) => a.resourceType)}::text[],
        ${rows.map((a) => a.resourceId ?? null)}::text[],
        ${rows.map((a) => a.actorType ?? null)}::text[],
        ${links.map((l) => l.licenseId)}::text[],
        ${links.map((l) => l.platformId)}::text[],
        ${links.map((l) => l.calloutLogId)}::text[],
        ${rows.map((a) => a.correlationId ?? null)}::text[],
        ${rows.map((a) => JSON.stringify(a))}::jsonb[]
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// The fields of a license whose changes are kept, as text. Agent names and full numbers aren't stored.
const LICENSE_FIELDS = {
  member_id: (l: License) => l.assignedTo?.id ?? null,
  status: (l: License) => l.status ?? null,
  is_active: (l: License) => String(l.isActive),
  is_logged_in: (l: License) => String(l.isLoggedIn),
  last_login_label: (l: License) => l.lastLoginLabel ?? null,
  device_brand: (l: License) => l.lastLoginAndroidBrand ?? null,
  device_model: (l: License) => l.lastLoginAndroidModel ?? null,
  firmware: (l: License) => l.lastLoginFirmwareVersion ?? null,
  app_version: (l: License) => l.lastLoginAppVersion ?? null,
  recording_enabled: (l: License) => (l.recordingEnabled === null || l.recordingEnabled === undefined ? null : String(l.recordingEnabled)),
  call_policy: (l: License) => l.callCapturePolicy ?? null,
};
const asText = (value: unknown) => (value === null || value === undefined ? null : String(value));

// Saves a client's licenses from its tenant, with a dated row for each field that changed since the
// last save. Licenses no longer in the tenant are marked removed.
export async function saveLicenses(clientId: string, licenses: License[]) {
  const stored = await db()`SELECT * FROM ca_licenses WHERE client_id = ${clientId}`;
  const before = new Map(stored.map((r) => [r.license_id as string, r]));
  const changes: { licenseId: string; field: string; old: string | null; value: string | null }[] = [];
  for (const license of licenses) {
    const old = before.get(license.id);
    if (!old) continue;
    for (const [field, read] of Object.entries(LICENSE_FIELDS)) {
      const value = read(license);
      if (asText(old[field]) !== value) changes.push({ licenseId: license.id, field, old: asText(old[field]), value });
    }
  }
  if (changes.length) {
    await db()`
      INSERT INTO ca_license_changes (license_id, client_id, field, old_value, new_value)
      SELECT l, ${clientId}, f, o, n FROM unnest(
        ${changes.map((c) => c.licenseId)}::text[], ${changes.map((c) => c.field)}::text[],
        ${changes.map((c) => c.old)}::text[], ${changes.map((c) => c.value)}::text[]
      ) AS x(l, f, o, n)
    `;
  }
  if (licenses.length) {
    await db()`
      INSERT INTO ca_licenses (license_id, client_id, member_id, number_last4, status, is_active, is_logged_in, last_login_label,
        device_brand, device_model, firmware, google_dialer, app_version, app_version_code, recording_enabled, call_policy, lifetime_calls)
      SELECT * FROM unnest(
        ${licenses.map((l) => l.id)}::text[],
        ${licenses.map(() => clientId)}::text[],
        ${licenses.map((l) => l.assignedTo?.id ?? null)}::text[],
        ${licenses.map((l) => (l.number ? l.number.slice(-4) : null))}::text[],
        ${licenses.map((l) => l.status ?? null)}::text[],
        ${licenses.map((l) => l.isActive)}::boolean[],
        ${licenses.map((l) => l.isLoggedIn)}::boolean[],
        ${licenses.map((l) => l.lastLoginLabel ?? null)}::text[],
        ${licenses.map((l) => l.lastLoginAndroidBrand ?? null)}::text[],
        ${licenses.map((l) => l.lastLoginAndroidModel ?? null)}::text[],
        ${licenses.map((l) => l.lastLoginFirmwareVersion ?? null)}::text[],
        ${licenses.map((l) => l.lastLoginGoogleDialerPresent ?? null)}::boolean[],
        ${licenses.map((l) => l.lastLoginAppVersion ?? null)}::text[],
        ${licenses.map((l) => l.lastLoginAppVersionCode ?? null)}::int[],
        ${licenses.map((l) => l.recordingEnabled ?? null)}::boolean[],
        ${licenses.map((l) => l.callCapturePolicy ?? null)}::text[],
        ${licenses.map((l) => l.lifetimeCallRecordCount ?? 0)}::int[]
      )
      ON CONFLICT (license_id) DO UPDATE SET
        client_id = EXCLUDED.client_id, member_id = EXCLUDED.member_id, number_last4 = EXCLUDED.number_last4,
        status = EXCLUDED.status, is_active = EXCLUDED.is_active, is_logged_in = EXCLUDED.is_logged_in,
        last_login_label = EXCLUDED.last_login_label, device_brand = EXCLUDED.device_brand, device_model = EXCLUDED.device_model,
        firmware = EXCLUDED.firmware, google_dialer = EXCLUDED.google_dialer, app_version = EXCLUDED.app_version,
        app_version_code = EXCLUDED.app_version_code, recording_enabled = EXCLUDED.recording_enabled,
        call_policy = EXCLUDED.call_policy, lifetime_calls = EXCLUDED.lifetime_calls, updated_at = now(), removed_at = NULL,
        calls_grew_at = CASE WHEN EXCLUDED.lifetime_calls > ca_licenses.lifetime_calls THEN now() ELSE ca_licenses.calls_grew_at END
    `;
  }
  await db()`
    UPDATE ca_licenses SET removed_at = now()
    WHERE client_id = ${clientId} AND removed_at IS NULL AND NOT (license_id = ANY(${licenses.map((l) => l.id)}::text[]))
  `;
}

type IntegrationSummary = TenantSummary["integrations"][number];
const INTEGRATION_FIELDS = {
  active: (i: IntegrationSummary) => String(i.active),
  event_types: (i: IntegrationSummary) => [...i.eventTypes].sort().join(","),
};

// Saves a client's CRM integrations from its tenant, with a dated row when one is switched on or off,
// its events change, or it's removed (QA finding I1). The first save records no changes.
export async function saveIntegrations(clientId: string, integrations: IntegrationSummary[]) {
  const stored = await db()`SELECT * FROM ca_integrations WHERE client_id = ${clientId}`;
  const before = new Map(stored.map((r) => [r.platform_id as string, r]));
  const changes: { platformId: string; name: string | null; field: string; old: string | null; value: string | null }[] = [];
  for (const i of integrations) {
    const old = before.get(i.platformId);
    if (!old) {
      if (stored.length) changes.push({ platformId: i.platformId, name: i.platformName, field: "added", old: null, value: String(i.active) });
      continue;
    }
    for (const [field, read] of Object.entries(INTEGRATION_FIELDS)) {
      const value = read(i);
      if (asText(old[field]) !== value) changes.push({ platformId: i.platformId, name: i.platformName, field, old: asText(old[field]), value });
    }
  }
  const current = new Set(integrations.map((i) => i.platformId));
  for (const r of stored) {
    if (!current.has(r.platform_id) && !r.removed_at) changes.push({ platformId: r.platform_id, name: r.platform_name, field: "removed", old: asText(r.active), value: null });
  }
  if (changes.length) {
    await db()`
      INSERT INTO ca_integration_changes (client_id, platform_id, platform_name, field, old_value, new_value)
      SELECT ${clientId}, p, n, f, o, v FROM unnest(
        ${changes.map((c) => c.platformId)}::text[], ${changes.map((c) => c.name)}::text[], ${changes.map((c) => c.field)}::text[],
        ${changes.map((c) => c.old)}::text[], ${changes.map((c) => c.value)}::text[]
      ) AS x(p, n, f, o, v)
    `;
  }
  if (integrations.length) {
    await db()`
      INSERT INTO ca_integrations (client_id, platform_id, platform_name, active, event_types)
      SELECT ${clientId}, * FROM unnest(
        ${integrations.map((i) => i.platformId)}::text[], ${integrations.map((i) => i.platformName)}::text[],
        ${integrations.map((i) => i.active)}::boolean[], ${integrations.map((i) => INTEGRATION_FIELDS.event_types(i))}::text[]
      )
      ON CONFLICT (client_id, platform_id) DO UPDATE SET
        platform_name = EXCLUDED.platform_name, active = EXCLUDED.active, event_types = EXCLUDED.event_types, updated_at = now(), removed_at = NULL
    `;
  }
  await db()`
    UPDATE ca_integrations SET removed_at = now()
    WHERE client_id = ${clientId} AND removed_at IS NULL AND NOT (platform_id = ANY(${[...current]}::text[]))
  `;
}

// ---- Streams and milestones ----

// backfillFrom: the next pull also reads back to here, once (ca_sync_state.backfill_from).
type StreamState = { milestoneAt: number | null; pulledAt: number | null; refreshedAt: number | null; backfillFrom: number | null };
type Mode = "latest" | "refresh";

const time = (value: unknown) => (value ? new Date(value as string).getTime() : null);
const iso = (value: unknown) => new Date(value as string).toISOString();

async function readStates() {
  const rows = await db()`SELECT stream, milestone_at, pulled_at, refreshed_at, backfill_from FROM ca_sync_state`;
  return new Map<string, StreamState>(rows.map((r) => [r.stream, toState(r)]));
}

const toState = (r: Record<string, unknown>): StreamState => ({
  milestoneAt: time(r.milestone_at),
  pulledAt: time(r.pulled_at),
  refreshedAt: time(r.refreshed_at),
  backfillFrom: time(r.backfill_from),
});

// Whether a stream has work to do. Its first pull is always the 5-day read. A pending backfill runs
// with the background refresh, so it never holds up a page.
function isDue(state: StreamState | undefined, mode: Mode, now = Date.now()) {
  if (!state?.refreshedAt) return true;
  if (mode === "refresh") return state.backfillFrom !== null || now - state.refreshedAt >= SYNC.refreshEveryMs;
  return !state.pulledAt || now - state.pulledAt >= SYNC.pullEveryMs;
}

// Takes the stream's lease, or returns null when another pull holds it.
async function claim(stream: string): Promise<StreamState | null> {
  const [row] = await db()`
    INSERT INTO ca_sync_state (stream, lease_until)
    VALUES (${stream}, now() + ${`${SYNC.leaseMs} milliseconds`}::interval)
    ON CONFLICT (stream) DO UPDATE SET lease_until = EXCLUDED.lease_until
      WHERE ca_sync_state.lease_until IS NULL OR ca_sync_state.lease_until < now()
    RETURNING milestone_at, pulled_at, refreshed_at, backfill_from
  `;
  return row ? toState(row) : null;
}

async function release(
  stream: string,
  done: { milestoneAt?: string | null; refreshed?: boolean; incomplete?: boolean; backfilled?: boolean; error?: string },
) {
  await db()`
    UPDATE ca_sync_state SET
      lease_until = NULL,
      milestone_at = GREATEST(milestone_at, ${done.milestoneAt ?? null}::timestamptz),
      pulled_at = CASE WHEN ${!done.error}::boolean THEN now() ELSE pulled_at END,
      refreshed_at = CASE
        WHEN ${done.incomplete ?? false}::boolean THEN NULL
        WHEN ${done.refreshed ?? false}::boolean THEN now()
        ELSE refreshed_at END,
      backfill_from = CASE WHEN ${done.backfilled ?? false}::boolean THEN NULL ELSE backfill_from END,
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
  const window = refresh ? Math.max(Math.min(fiveDaysAgo, milestone), now - SYNC.retainDays * DAY) : milestone;
  // A one-time backfill reads further back, never past retention.
  const backfill = refresh && state.backfillFrom !== null;
  const since = backfill ? Math.max(Math.min(window, state.backfillFrom!), now - SYNC.retainDays * DAY) : window;
  try {
    const { newestAt, complete } = await pull(since);
    // A pull that ran out of pages leaves a gap, so the next one does the 5-day read instead.
    await release(stream, { milestoneAt: newestAt, refreshed: refresh, incomplete: !refresh && !complete, backfilled: backfill });
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

// One stream for every client's system logs: the endpoint can return them all at once. The busiest
// clients also get their own stream ('logs:<clientId>'), which the fleet-wide one can't keep up with.
const pullLogs = (cookie: string, mode: Mode, clientId?: string) =>
  runStream(clientId ? `logs:${clientId}` : "logs", mode, async (since) => {
    const filter = clientId ? `&clientId=${clientId}` : "";
    const result = await pagesSince(
      (page) => getJson<Paged<SystemLog>>(cookie, `/api/support/logs?page=${page}&limit=${PAGE_SIZE}${filter}`),
      (log) => log.occurredAt,
      since,
    );
    await saveLogs(result.items);
    if (mode === "refresh" && !clientId) await prune();
    return result;
  });

// One stream for every client's portal events. A few hundred in all, so one page usually covers it.
const pullAudit = (cookie: string, mode: Mode) =>
  runStream("audit", mode, async (since) => {
    const result = await pagesSince(
      (page) => getJson<Paged<AuditEntry>>(cookie, `/api/support/audit-logs?page=${page}&limit=${PAGE_SIZE}`),
      (entry) => entry.occurredAt,
      since,
    );
    await saveAudit(result.items);
    return result;
  });

// The clients busy enough to need their own log stream, by stored calls over the last 24 hours.
// CallAnchor's calls-today count restarts at midnight IST, which dropped every client from this list
// each morning (QA finding D2). Calls are counted from callouts too, so this doesn't need the logs.
async function busyClients() {
  const rows = await db()`
    SELECT client_id FROM ca_calls
    WHERE coalesce(ingested_at, first_callout_at) >= now() - interval '24 hours' AND client_id IS NOT NULL
    GROUP BY client_id HAVING count(*) >= ${SYNC.busyCallsPerDay}
    ORDER BY count(*) DESC LIMIT ${SYNC.busyClients}
  `;
  return rows.map((r) => r.client_id as string);
}

async function prune() {
  // Days about to lose their calls keep their counts as a snapshot first.
  await saveDaily();
  const detail = `${SYNC.retainDays} days`;
  const snapshot = `${SYNC.snapshotDays} days`;
  await db()`DELETE FROM ca_callout_events WHERE at < now() - ${detail}::interval`;
  await db()`DELETE FROM ca_system_logs WHERE occurred_at < now() - ${detail}::interval`;
  await db()`DELETE FROM ca_calls WHERE coalesce(ingested_at, first_callout_at) < now() - ${detail}::interval`;
  await db()`DELETE FROM ca_license_changes WHERE at < now() - ${snapshot}::interval`;
  await db()`DELETE FROM ca_integration_changes WHERE at < now() - ${snapshot}::interval`;
  await db()`DELETE FROM ca_audit_logs WHERE occurred_at < now() - ${snapshot}::interval`;
  await db()`DELETE FROM ca_daily WHERE day < to_char((now() - ${snapshot}::interval) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
}

// Fleet metrics, tenant counts and OneAPI status for every client. Not paged, so no milestone.
async function pullSnapshots(cookie: string) {
  const state = await claim("snapshots");
  if (!state) return;
  try {
    const fleet = await getJson<{ clientMetrics: ClientMetrics[] }>(cookie, "/api/fleet", FLEET_TIMEOUT_MS);
    await mapLimit(fleet.clientMetrics, CONCURRENCY, async (m) => {
      const [tenant, oneApi, client] = await Promise.all([
        optional(getJson<Tenant>(cookie, `/api/clients/${m.clientId}/tenant`)),
        optional(getJson<OneApiStatus>(cookie, `/api/clients/${m.clientId}/oneapi/status`)),
        optional(getJson<ClientDetails>(cookie, `/api/clients/${m.clientId}`)),
      ]);
      const summary = tenant ? summarizeTenant(tenant, m.status) : null;
      if (tenant) await saveLicenses(m.clientId, tenant.licenses);
      if (summary) await saveIntegrations(m.clientId, summary.integrations);
      const data = {
        metrics: { totalCalls: m.totalCalls, callsToday: m.callsToday, totalLicenses: m.totalLicenses },
        client: client && { licenseCount: client.licenseCount ?? null, plan: client.plan ?? null, accessSuspended: Boolean(client.accessSuspended) },
        tenant: summary,
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
    // Each client becomes a customer with product CallAnchor (owner, 2026-11-12).
    await db()`SELECT ca_map_customers()`;
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
        else if (stream === "audit") await pullAudit(cookie, "refresh");
        else if (stream.startsWith("logs:")) await pullLogs(cookie, "refresh", stream.slice("logs:".length));
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
  const audit = attempt(report, "Portal events", () => (isDue(states.get("audit"), "latest") ? pullAudit(cookie, "latest") : Promise.resolve()));

  if (!snapshots?.refreshedAt) {
    await attempt(report, "Client list", () => pullSnapshots(cookie));
  } else if (Date.now() - snapshots.refreshedAt >= SYNC.snapshotEveryMs) {
    after(() => pullSnapshots(cookie).catch(() => undefined));
  }

  const clients = (await db()`SELECT client_id FROM ca_client_snapshots WHERE data IS NOT NULL`).map((r) => r.client_id as string);
  const busy = await busyClients();
  await Promise.all([
    mapLimit(clients, CONCURRENCY, (clientId) =>
      attempt(report, "CRM syncs", () => (isDue(states.get(`callouts:${clientId}`), "latest") ? pullCallouts(cookie, clientId, "latest") : Promise.resolve())),
    ),
    mapLimit(busy, CONCURRENCY, (clientId) =>
      attempt(report, "System logs", () => (isDue(states.get(`logs:${clientId}`), "latest") ? pullLogs(cookie, "latest", clientId) : Promise.resolve())),
    ),
  ]);
  await Promise.all([logs, audit]);
  refreshLater(cookie, ["logs", "audit", ...busy.map((c) => `logs:${c}`), ...clients.map((c) => `callouts:${c}`)], states);
  return report;
}

// Brings one client up to date: its CRM syncs and the shared system logs.
export async function pullClient(cookie: string, clientId: string): Promise<PullReport> {
  const report: PullReport = { errors: [] };
  const states = await readStates();
  const stream = `callouts:${clientId}`;
  const own = (await busyClients()).includes(clientId) ? `logs:${clientId}` : null;
  await Promise.all([
    attempt(report, "System logs", () => (isDue(states.get("logs"), "latest") ? pullLogs(cookie, "latest") : Promise.resolve())),
    attempt(report, "CRM syncs", () => (isDue(states.get(stream), "latest") ? pullCallouts(cookie, clientId, "latest") : Promise.resolve())),
    own ? attempt(report, "System logs", () => (isDue(states.get(own), "latest") ? pullLogs(cookie, "latest", clientId) : Promise.resolve())) : null,
    attempt(report, "Portal events", () => (isDue(states.get("audit"), "latest") ? pullAudit(cookie, "latest") : Promise.resolve())),
  ]);
  refreshLater(cookie, ["logs", "audit", stream, ...(own ? [own] : [])], states);
  return report;
}

// ---- Reading ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the shape the Neon driver returns
type Row = Record<string, any>;

const toCallout = (r: Row): StoredCallout => ({
  id: r.id,
  clientId: r.client_id,
  platformId: r.platform_id,
  eventType: r.event_type,
  callId: r.call_id,
  attempt: r.attempt,
  status: crmStatus(r.status, r.http_status),
  callAnchorStatus: r.status,
  requestId: r.request_id ?? null,
  httpStatus: r.http_status,
  durationMs: r.duration_ms,
  at: iso(r.at),
  label: r.label,
});

const toLog = (r: Row): StoredLog => ({
  id: r.id,
  clientId: r.client_id,
  occurredAt: iso(r.occurred_at),
  category: r.category,
  severity: r.severity,
  source: r.source,
  resourceId: r.resource_id,
  callId: r.call_id ?? null,
  message: r.message,
  detail: r.detail,
  raw: r.raw,
});

// Summaries read every log in a window, so they leave out `raw`.
const LOG_COLUMNS = "id, client_id, occurred_at, category, severity, source, resource_id, call_id, message, detail";

export async function readCallouts(clientId: string | null, since: number): Promise<StoredCallout[]> {
  const from = new Date(since).toISOString();
  const rows = clientId
    ? await db()`SELECT * FROM ca_callout_events WHERE client_id = ${clientId} AND at >= ${from} ORDER BY at DESC`
    : await db()`SELECT * FROM ca_callout_events WHERE at >= ${from} ORDER BY at DESC`;
  return rows.map(toCallout);
}

export async function readLogs(clientId: string | null, since: number): Promise<StoredLog[]> {
  const from = new Date(since).toISOString();
  const rows = clientId
    ? await db().query(`SELECT ${LOG_COLUMNS} FROM ca_system_logs WHERE client_id = $1 AND occurred_at >= $2 ORDER BY occurred_at DESC`, [clientId, from])
    : await db().query(`SELECT ${LOG_COLUMNS} FROM ca_system_logs WHERE occurred_at >= $1 ORDER BY occurred_at DESC`, [from]);
  return rows.map(toLog);
}

// ---- Item lists, for debugging one row at a time ----

export const ITEMS_PER_PAGE = 100;

export type CalloutFilter = {
  clientId?: string;
  status?: string;
  platform?: string;
  event?: string;
  // "none" is a callout that got no HTTP response.
  http?: number | "none";
  label?: string;
  auth?: boolean;
  // Leaves out clients marked internal.
  hideInternal?: boolean;
};

export type LogFilter = {
  clientId?: string;
  // Also matches the sources under it: "mobile" covers "mobile.call.create".
  source?: string;
  severity?: string;
  detail?: string;
  // The masked message starts with this.
  starts?: string;
  // Anything but info, as the platform fault rules count them.
  problems?: boolean;
  hideInternal?: boolean;
};

const NOT_INTERNAL = "NOT EXISTS (SELECT 1 FROM ca_client_flags f WHERE f.client_id = t.client_id AND f.internal)";

// Builds a WHERE clause with numbered parameters, since the filters are all optional.
function conditions() {
  const params: unknown[] = [];
  const parts: string[] = [];
  return {
    params,
    add(sql: string, ...values: unknown[]) {
      parts.push(sql.replace(/\?/g, () => `$${params.push(values.shift())}`));
    },
    get where() {
      return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    },
  };
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export async function readCalloutPage(filter: CalloutFilter, days: number, page: number) {
  const now = Date.now();
  const c = conditions();
  c.add("at >= ?", new Date(now - days * DAY).toISOString());
  if (filter.clientId) c.add("client_id = ?", filter.clientId);
  if (filter.status) c.add(`${CRM_STATUS_SQL} = ?`, filter.status);
  if (filter.platform) c.add("platform_id = ?", filter.platform);
  if (filter.event) c.add("event_type = ?", filter.event);
  if (filter.http === "none") c.add("http_status IS NULL");
  else if (filter.http !== undefined) c.add("http_status = ?", filter.http);
  if (filter.label !== undefined) c.add("label = ?", filter.label);
  if (filter.auth) c.add("http_status IN (401, 403)");
  if (filter.hideInternal) c.add(NOT_INTERNAL);
  const rows = await db().query(
    `SELECT *, count(*) OVER () AS total FROM ca_callout_events t ${c.where} ORDER BY at DESC, id LIMIT ${ITEMS_PER_PAGE} OFFSET ${(page - 1) * ITEMS_PER_PAGE}`,
    c.params,
  );
  return { items: rows.map(toCallout), total: Number(rows[0]?.total ?? 0), now };
}

export async function readLogPage(filter: LogFilter, days: number, page: number) {
  const now = Date.now();
  const c = conditions();
  c.add("occurred_at >= ?", new Date(now - days * DAY).toISOString());
  if (filter.clientId) c.add("client_id = ?", filter.clientId);
  if (filter.source) c.add("(source = ? OR source LIKE ?)", filter.source, `${escapeLike(filter.source)}.%`);
  if (filter.severity) c.add("severity = ?", filter.severity);
  if (filter.detail) c.add("detail = ?", filter.detail);
  if (filter.starts) c.add("message LIKE ?", `${escapeLike(filter.starts)}%`);
  if (filter.problems) c.add("severity <> 'info'");
  if (filter.hideInternal) c.add(NOT_INTERNAL);
  const rows = await db().query(
    `SELECT *, count(*) OVER () AS total FROM ca_system_logs t ${c.where} ORDER BY occurred_at DESC, id LIMIT ${ITEMS_PER_PAGE} OFFSET ${(page - 1) * ITEMS_PER_PAGE}`,
    c.params,
  );
  return { items: rows.map(toLog), total: Number(rows[0]?.total ?? 0), now };
}

// Everything stored about one call: its CRM callouts, and the system logs about it.
export async function readCall(callId: string) {
  const [callouts, logs] = await Promise.all([
    db()`SELECT * FROM ca_callout_events WHERE call_id = ${callId} ORDER BY at`,
    db()`SELECT * FROM ca_system_logs WHERE call_id = ${callId} ORDER BY occurred_at`,
  ]);
  return { callouts: callouts.map(toCallout), logs: logs.map(toLog) };
}

// A portal event as pages show it. `raw` holds actor emails, IPs and numbers, like log metadata.
export type StoredAudit = {
  id: string;
  clientId: string | null;
  occurredAt: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorType: string | null;
  licenseId: string | null;
  platformId: string | null;
  calloutLogId: string | null;
  raw: Record<string, unknown> | null;
};

const toAudit = (r: Row): StoredAudit => ({
  id: r.id,
  clientId: r.client_id,
  occurredAt: iso(r.occurred_at),
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id,
  actorType: r.actor_type,
  licenseId: r.license_id,
  platformId: r.platform_id,
  calloutLogId: r.callout_log_id,
  raw: r.raw,
});

// Portal events for a client or one license, newest first.
export async function readAudit(scope: { clientId?: string | null; licenseId?: string | null }, since: number, limit = 200): Promise<StoredAudit[]> {
  const c = conditions();
  c.add("occurred_at >= ?", new Date(since).toISOString());
  if (scope.clientId) c.add("client_id = ?", scope.clientId);
  if (scope.licenseId) c.add("license_id = ?", scope.licenseId);
  c.params.push(limit);
  const rows = await db().query(`SELECT * FROM ca_audit_logs ${c.where} ORDER BY occurred_at DESC LIMIT $${c.params.length}`, c.params);
  return rows.map(toAudit);
}

export async function readClientNames() {
  const rows = await db()`SELECT client_id, company_name FROM ca_client_snapshots`;
  return new Map<string, string>(rows.map((r) => [r.client_id, r.company_name ?? r.client_id]));
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
    client: r.data?.client ?? null,
    // Snapshots saved before finding A was fixed hold the old takesRecordings, so it's derived again.
    tenant: r.data?.tenant ? { ...r.data.tenant, takesRecordings: takesRecordings(r.data.tenant.integrations ?? []) } : null,
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

// ---- Calls, licenses and issues (docs/client-health-plan.md) ----

export type StoredCall = {
  callId: string;
  clientId: string | null;
  licenseId: string | null;
  ingestedAt: string | null;
  // mobile.call.create's recordingStatus: pending_upload, not_recorded or skipped_trial_limit.
  recordingDetail: string | null;
  // mobile.call.create's callType: outgoing, incoming, missed or rejected.
  callType: string | null;
  uploadStartedAt: string | null;
  uploadedAt: string | null;
  verifiedAt: string | null;
  uploadFailedAt: string | null;
  attempts: number;
  firstCalloutAt: string | null;
  lastCalloutAt: string | null;
  firstDeliveredAt: string | null;
  deliveredEvents: string[];
  // The latest callout's CRM outcome, HTTP code, masked label and platform.
  lastStatus: string | null;
  lastHttp: number | null;
  lastLabel: string | null;
  lastPlatform: string | null;
  // 2xx replies beyond the first for the same event and platform.
  duplicateDeliveries: number;
  // From the CRM payloads: the call's length (0 = never connected), whether it has a recording, when
  // it started and the agent number's last 4 digits.
  callSeconds: number | null;
  hasRecording: boolean | null;
  startedAt: string | null;
  agentLast4: string | null;
  // How the license is known: 'ingest' or 'agent_number' (see ca_refresh_calls).
  licenseVia: string | null;
  // mobile.recording.mark-unavailable: the phone found no recording file, and its reasonMessage.
  unavailableAt: string | null;
  unavailableReason: string | null;
};

const isoOrNull = (value: unknown) => (value ? iso(value) : null);

const toCall = (r: Row): StoredCall => ({
  callId: r.call_id,
  clientId: r.client_id,
  licenseId: r.license_id,
  ingestedAt: isoOrNull(r.ingested_at),
  recordingDetail: r.recording_detail,
  callType: r.call_type ?? null,
  uploadStartedAt: isoOrNull(r.upload_started_at),
  uploadedAt: isoOrNull(r.uploaded_at),
  verifiedAt: isoOrNull(r.verified_at),
  uploadFailedAt: isoOrNull(r.upload_failed_at),
  attempts: r.attempts,
  firstCalloutAt: isoOrNull(r.first_callout_at),
  lastCalloutAt: isoOrNull(r.last_callout_at),
  firstDeliveredAt: isoOrNull(r.first_delivered_at),
  deliveredEvents: r.delivered_events ?? [],
  lastStatus: r.last_status,
  lastHttp: r.last_http,
  lastLabel: r.last_label,
  lastPlatform: r.last_platform,
  duplicateDeliveries: r.duplicate_deliveries ?? 0,
  callSeconds: r.call_seconds ?? null,
  hasRecording: r.has_recording ?? null,
  startedAt: isoOrNull(r.started_at),
  agentLast4: r.agent_last4 ?? null,
  licenseVia: r.license_via ?? null,
  unavailableAt: isoOrNull(r.unavailable_at),
  unavailableReason: r.unavailable_reason ?? null,
});

// A call's time is when it was ingested, or its first callout when its ingest log wasn't stored.
export async function readCalls(scope: { clientId?: string | null; licenseId?: string | null }, since: number): Promise<StoredCall[]> {
  const c = conditions();
  c.add("coalesce(ingested_at, first_callout_at) >= ?", new Date(since).toISOString());
  if (scope.clientId) c.add("client_id = ?", scope.clientId);
  if (scope.licenseId) c.add("license_id = ?", scope.licenseId);
  const rows = await db().query(`SELECT * FROM ca_calls ${c.where} ORDER BY coalesce(ingested_at, first_callout_at) DESC`, c.params);
  return rows.map(toCall);
}

export async function readStoredCall(callId: string) {
  const [row] = await db()`SELECT * FROM ca_calls WHERE call_id = ${callId}`;
  return row ? toCall(row) : null;
}

export type StoredLicense = {
  licenseId: string;
  clientId: string;
  memberId: string | null;
  last4: string | null;
  status: string | null;
  isActive: boolean | null;
  isLoggedIn: boolean | null;
  lastLoginLabel: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  firmware: string | null;
  googleDialer: boolean | null;
  appVersion: string | null;
  appVersionCode: number | null;
  recordingEnabled: boolean | null;
  callPolicy: string | null;
  lifetimeCalls: number;
  // When CallAnchor's lifetime call count last went up, as seen on a snapshot.
  callsGrewAt: string | null;
  firstSeenAt: string;
  updatedAt: string;
};

const toLicense = (r: Row): StoredLicense => ({
  licenseId: r.license_id,
  clientId: r.client_id,
  memberId: r.member_id,
  last4: r.number_last4,
  status: r.status,
  isActive: r.is_active,
  isLoggedIn: r.is_logged_in,
  lastLoginLabel: r.last_login_label,
  deviceBrand: r.device_brand,
  deviceModel: r.device_model,
  firmware: r.firmware,
  googleDialer: r.google_dialer,
  appVersion: r.app_version,
  appVersionCode: r.app_version_code,
  recordingEnabled: r.recording_enabled,
  callPolicy: r.call_policy,
  lifetimeCalls: r.lifetime_calls ?? 0,
  callsGrewAt: isoOrNull(r.calls_grew_at),
  firstSeenAt: iso(r.first_seen_at),
  updatedAt: iso(r.updated_at),
});

// Current licenses, for one client or the fleet. Removed ones are left out.
export async function readLicenses(clientId?: string | null): Promise<StoredLicense[]> {
  const rows = clientId
    ? await db()`SELECT * FROM ca_licenses WHERE client_id = ${clientId} AND removed_at IS NULL`
    : await db()`SELECT * FROM ca_licenses WHERE removed_at IS NULL`;
  return rows.map(toLicense);
}

export async function readLicense(licenseId: string) {
  const [row] = await db()`SELECT * FROM ca_licenses WHERE license_id = ${licenseId}`;
  return row ? toLicense(row) : null;
}

export type LicenseChange = { at: string; field: string; oldValue: string | null; newValue: string | null };

export async function readLicenseChanges(scope: { licenseId?: string; clientId?: string | null }, since: number): Promise<(LicenseChange & { licenseId: string })[]> {
  const from = new Date(since).toISOString();
  const rows = scope.licenseId
    ? await db()`SELECT * FROM ca_license_changes WHERE license_id = ${scope.licenseId} AND at >= ${from} ORDER BY at DESC`
    : scope.clientId
      ? await db()`SELECT * FROM ca_license_changes WHERE client_id = ${scope.clientId} AND at >= ${from} ORDER BY at DESC`
      : await db()`SELECT * FROM ca_license_changes WHERE at >= ${from} ORDER BY at DESC`;
  return rows.map((r) => ({ licenseId: r.license_id, at: iso(r.at), field: r.field, oldValue: r.old_value, newValue: r.new_value }));
}

// When the stored license link starts for each client: calls before it have no license.
export async function readLicenseHistoryStart() {
  const rows = await db()`SELECT client_id, min(ingested_at) AS since FROM ca_calls WHERE license_id IS NOT NULL GROUP BY client_id`;
  return new Map<string, string>(rows.map((r) => [r.client_id, iso(r.since)]));
}

// Success reply shapes per client: the label, and when it was first and last seen.
export async function readReplyShapes(clientId: string | null, since: number) {
  const from = new Date(since).toISOString();
  const rows = await db().query(
    `SELECT client_id, label, min(at) AS first_at, max(at) AS last_at, count(*) AS n FROM ca_callout_events
     WHERE at >= $1 ${clientId ? "AND client_id = $2" : ""} AND ${CRM_STATUS_SQL} = 'delivered' GROUP BY 1, 2`,
    clientId ? [from, clientId] : [from],
  );
  return rows.map((r) => ({ clientId: r.client_id as string, label: r.label as string, firstAt: iso(r.first_at), lastAt: iso(r.last_at), count: Number(r.n) }));
}

// `firstAt` is when the data shows the issue began; null for account state, which has no timing.
export type IssueStateInput = { id: string; kind: string; scope: "fleet" | "client" | "license"; clientId: string | null; licenseId: string | null; level: string; firstAt: string | null };

// An issue with no timing in its data (account state) starts a new episode only after this long unseen.
const STATE_EPISODE_GAP = "3 days";

// Records that these issues are open now. An issue starts a new episode only when its data does: its
// first affected item came after the last time it was seen open. Visits don't reset it, so a weekend
// with nobody looking doesn't make a long-running issue look new (QA finding T2). Returns when each
// began and when it last opened, by the clock.
export async function touchIssues(issues: IssueStateInput[]) {
  const seen = new Map<string, { firstSeenAt: string; openedAt: string }>();
  const timed = issues.filter((i) => i.firstAt !== null);
  const untimed = issues.filter((i) => i.firstAt === null);
  const values = (list: IssueStateInput[]) => db()`
    SELECT * FROM unnest(
      ${list.map((i) => i.id)}::text[], ${list.map((i) => i.kind)}::text[], ${list.map((i) => i.scope)}::text[],
      ${list.map((i) => i.clientId)}::text[], ${list.map((i) => i.licenseId)}::text[], ${list.map((i) => i.level)}::text[],
      ${list.map((i) => i.firstAt ?? new Date().toISOString())}::timestamptz[]
    ) AS x(i, k, s, c, l, v, f)`;
  const rows = await Promise.all([
    timed.length
      ? db()`
          INSERT INTO ca_issue_state AS t (issue_id, kind, scope, client_id, license_id, level, first_seen_at, last_seen_at, opened_at)
          SELECT i, k, s, c, l, v, f, now(), now() FROM (${values(timed)}) v
          ON CONFLICT (issue_id) DO UPDATE SET
            level = EXCLUDED.level,
            first_seen_at = CASE WHEN EXCLUDED.first_seen_at > t.last_seen_at THEN EXCLUDED.first_seen_at
                                 ELSE LEAST(t.first_seen_at, EXCLUDED.first_seen_at) END,
            opened_at = CASE WHEN EXCLUDED.first_seen_at > t.last_seen_at THEN now() ELSE coalesce(t.opened_at, t.first_seen_at) END,
            last_seen_at = now()
          RETURNING issue_id, first_seen_at, opened_at`
      : Promise.resolve([]),
    untimed.length
      ? db()`
          INSERT INTO ca_issue_state AS t (issue_id, kind, scope, client_id, license_id, level, first_seen_at, last_seen_at, opened_at)
          SELECT i, k, s, c, l, v, now(), now(), now() FROM (${values(untimed)}) v
          ON CONFLICT (issue_id) DO UPDATE SET
            level = EXCLUDED.level,
            first_seen_at = CASE WHEN t.last_seen_at < now() - ${STATE_EPISODE_GAP}::interval THEN now() ELSE t.first_seen_at END,
            opened_at = CASE WHEN t.last_seen_at < now() - ${STATE_EPISODE_GAP}::interval THEN now() ELSE coalesce(t.opened_at, t.first_seen_at) END,
            last_seen_at = now()
          RETURNING issue_id, first_seen_at, opened_at`
      : Promise.resolve([]),
  ]);
  for (const r of rows.flat()) seen.set(r.issue_id, { firstSeenAt: iso(r.first_seen_at), openedAt: iso(r.opened_at ?? r.first_seen_at) });
  return seen;
}

export async function readIssueState(issueId: string) {
  const [row] = await db()`SELECT * FROM ca_issue_state WHERE issue_id = ${issueId}`;
  return row ? { firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), level: row.level as string } : null;
}

export type ReplySuggestion = { id: string; pattern: string; scope: "platform" | "client"; scopeId: string; category: string; suggestion: string; author: string };

export async function readSuggestions(): Promise<ReplySuggestion[]> {
  const rows = await db()`SELECT * FROM ca_reply_suggestions ORDER BY created_at DESC`;
  return rows.map((r) => ({ id: String(r.id), pattern: r.pattern, scope: r.scope, scopeId: r.scope_id, category: r.category, suggestion: r.suggestion, author: r.author }));
}

// ---- Days, last syncs and open recordings (docs/client-health-qa.md, section 11) ----

// What counts as recorded, uploaded and verified, in SQL. A delivered recording.ready proves all three
// even when the call's logs weren't stored (QA findings R4, R5). isRecorded and friends in issues.ts
// must agree.
const RECORDED_SQL = `(recording_detail = 'pending_upload' OR upload_started_at IS NOT NULL OR uploaded_at IS NOT NULL
  OR upload_failed_at IS NOT NULL OR verified_at IS NOT NULL OR 'recording.ready' = ANY(delivered_events))`;
const VERIFIED_SQL = `(verified_at IS NOT NULL OR 'recording.ready' = ANY(delivered_events))`;
const COMPLETE_SQL = `(first_delivered_at IS NOT NULL AND (NOT ${RECORDED_SQL} OR ${VERIFIED_SQL}))`;
const UPLOADED_SQL = `(uploaded_at IS NOT NULL OR ${VERIFIED_SQL})`;

// One IST day of one license's calls (license null: calls with no known license). The counts let
// issues.ts work out which calls were due at the CRM, the same way CALL_STAGES.due does.
export type DayRow = {
  clientId: string;
  licenseId: string | null;
  day: string;
  calls: number;
  delivered: number;
  failed: number;
  // Not recorded, no callout, older than the server grace: due if the integration takes call.completed.
  noCallout: number;
  // Verified, never reached the CRM, latest callout not failed, older than the grace.
  verifiedUnsent: number;
  recorded: number;
  uploaded: number;
  verified: number;
  synced: number;
};

// One IST day of calls per client and license, counted the way CALL_STAGES counts them. `where`
// narrows ca_calls; `grace` is the SQL for the server-grace cutoff.
const dayRowsSql = (where: string, grace: string) => `
  SELECT client_id, license_id, to_char(coalesce(ingested_at, first_callout_at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
    count(*) AS calls,
    count(*) FILTER (WHERE first_delivered_at IS NOT NULL) AS delivered,
    count(*) FILTER (WHERE first_delivered_at IS NULL AND last_status = 'failed') AS failed,
    count(*) FILTER (WHERE attempts = 0 AND ingested_at IS NOT NULL AND ingested_at < ${grace} AND verified_at IS NULL
      AND coalesce(recording_detail, '') NOT IN ('pending_upload', 'skipped_trial_limit')) AS no_callout,
    count(*) FILTER (WHERE verified_at IS NOT NULL AND verified_at < ${grace} AND first_delivered_at IS NULL AND coalesce(last_status, '') <> 'failed') AS verified_unsent,
    count(*) FILTER (WHERE ${RECORDED_SQL}) AS recorded,
    count(*) FILTER (WHERE ${UPLOADED_SQL}) AS uploaded,
    count(*) FILTER (WHERE ${VERIFIED_SQL}) AS verified,
    count(*) FILTER (WHERE ${VERIFIED_SQL} AND first_delivered_at IS NOT NULL) AS synced
  FROM ca_calls ${where ? `${where} AND` : "WHERE"} client_id IS NOT NULL GROUP BY 1, 2, 3`;

// Days whose calls are all still stored are counted live; older ones come from the saved snapshot.
const LIVE_FROM_SQL = `to_char((now() - interval '${SYNC.retainDays - 1} days') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

// Saves every stored day's counts, so a day keeps its numbers once its calls are pruned. Today's row
// is overwritten by the next save.
export async function saveDaily() {
  await db().query(
    `INSERT INTO ca_daily (client_id, license_key, day, calls, delivered, failed, no_callout, verified_unsent, recorded, uploaded, verified, synced)
     SELECT client_id, coalesce(license_id, ''), day, calls, delivered, failed, no_callout, verified_unsent, recorded, uploaded, verified, synced
     FROM (${dayRowsSql("", "now()")}) d
     ON CONFLICT (client_id, license_key, day) DO UPDATE SET
       calls = EXCLUDED.calls, delivered = EXCLUDED.delivered, failed = EXCLUDED.failed, no_callout = EXCLUDED.no_callout,
       verified_unsent = EXCLUDED.verified_unsent, recorded = EXCLUDED.recorded, uploaded = EXCLUDED.uploaded,
       verified = EXCLUDED.verified, synced = EXCLUDED.synced, saved_at = now()`,
  );
}

export async function readDaily(scope: { clientId?: string | null; licenseId?: string | null }, since: number, serverGraceMs: number): Promise<DayRow[]> {
  const c = conditions();
  c.add("coalesce(ingested_at, first_callout_at) >= ?", new Date(since).toISOString());
  if (scope.clientId) c.add("client_id = ?", scope.clientId);
  if (scope.licenseId) c.add("license_id = ?", scope.licenseId);
  const grace = `$${c.params.push(new Date(Date.now() - serverGraceMs).toISOString())}`;
  const sinceAt = `$${c.params.push(new Date(since).toISOString())}`;
  const saved = [`day < ${LIVE_FROM_SQL}`, `day >= to_char(${sinceAt}::timestamptz AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`];
  if (scope.clientId) saved.push(`client_id = $${c.params.push(scope.clientId)}`);
  if (scope.licenseId) saved.push(`license_key = $${c.params.push(scope.licenseId)}`);
  const rows = await db().query(
    `SELECT * FROM (${dayRowsSql(c.where, grace)}) live WHERE day >= ${LIVE_FROM_SQL}
     UNION ALL
     SELECT client_id, NULLIF(license_key, '') AS license_id, day, calls, delivered, failed, no_callout, verified_unsent, recorded, uploaded, verified, synced
     FROM ca_daily WHERE ${saved.join(" AND ")}`,
    c.params,
  );
  return rows.map((r) => ({
    clientId: r.client_id,
    licenseId: r.license_id,
    day: r.day,
    calls: Number(r.calls),
    delivered: Number(r.delivered),
    failed: Number(r.failed),
    noCallout: Number(r.no_callout),
    verifiedUnsent: Number(r.verified_unsent),
    recorded: Number(r.recorded),
    uploaded: Number(r.uploaded),
    verified: Number(r.verified),
    synced: Number(r.synced),
  }));
}

// The last 2xx, the last call, and the last call that went all the way through: accepted by the CRM,
// with its recording when one was made (`isComplete` in issues.ts).
export type LastSync = { syncAt: string | null; callAt: string | null; completeAt: string | null; completeCallId: string | null };

export type LastSyncs = {
  clients: Map<string, LastSync>;
  licenses: Map<string, LastSync>;
  // Keyed `${clientId}|${platformId}`: the last 2xx and the last callout of each integration.
  platforms: Map<string, { syncAt: string | null; calloutAt: string | null }>;
};

// When each client, license and integration last reached the CRM, back to the start of the store.
export async function readLastSyncs(clientId: string | null): Promise<LastSyncs> {
  const [calls, platforms] = await Promise.all([
    db().query(
      `SELECT client_id, license_id, GROUPING(license_id) AS by_client, max(first_delivered_at) AS sync_at, max(coalesce(ingested_at, first_callout_at)) AS call_at,
         (array_agg(call_id ORDER BY first_delivered_at DESC) FILTER (WHERE ${COMPLETE_SQL}))[1] AS complete_call,
         max(first_delivered_at) FILTER (WHERE ${COMPLETE_SQL}) AS complete_at
       FROM ca_calls WHERE client_id IS NOT NULL ${clientId ? "AND client_id = $1" : ""}
       GROUP BY GROUPING SETS ((client_id), (client_id, license_id))`,
      clientId ? [clientId] : [],
    ),
    db().query(
      `SELECT client_id, platform_id, max(at) FILTER (WHERE ${CRM_STATUS_SQL} = 'delivered') AS sync_at, max(at) AS callout_at
       FROM ca_callout_events ${clientId ? "WHERE client_id = $1" : ""} GROUP BY 1, 2`,
      clientId ? [clientId] : [],
    ),
  ]);
  const result: LastSyncs = { clients: new Map(), licenses: new Map(), platforms: new Map() };
  for (const r of calls) {
    const value = { syncAt: isoOrNull(r.sync_at), callAt: isoOrNull(r.call_at), completeAt: isoOrNull(r.complete_at), completeCallId: r.complete_call ?? null };
    if (Number(r.by_client) === 1) result.clients.set(r.client_id, value);
    else if (r.license_id) result.licenses.set(r.license_id, value);
  }
  for (const r of platforms) result.platforms.set(`${r.client_id}|${r.platform_id}`, { syncAt: isoOrNull(r.sync_at), calloutAt: isoOrNull(r.callout_at) });
  return result;
}

// Calls between `since` and `before` whose recording or callout is still open: never verified, verified
// but never in the CRM, or never sent. Issues keep these flagged until they're fixed, not only for 24
// hours (QA finding R1). The last two only count at clients whose integration expects them, so a
// client without one doesn't return every call.
export async function readOpenCalls(
  scope: { clientId?: string | null },
  since: number,
  before: number,
  clients: { withIntegration: string[]; withCallCompleted: string[] },
): Promise<StoredCall[]> {
  const params: unknown[] = [new Date(since).toISOString(), new Date(before).toISOString(), clients.withIntegration, clients.withCallCompleted];
  if (scope.clientId) params.push(scope.clientId);
  const rows = await db().query(
    `SELECT * FROM ca_calls
     WHERE coalesce(ingested_at, first_callout_at) >= $1 AND coalesce(ingested_at, first_callout_at) < $2
       ${scope.clientId ? "AND client_id = $5" : ""}
       AND (
         (${RECORDED_SQL} AND NOT ${VERIFIED_SQL})
         OR (verified_at IS NOT NULL AND first_delivered_at IS NULL AND client_id = ANY($3::text[]))
         OR (attempts = 0 AND ingested_at IS NOT NULL AND client_id = ANY($4::text[]))
       )
     ORDER BY coalesce(ingested_at, first_callout_at) DESC`,
    params,
  );
  return rows.map(toCall);
}

export type IntegrationChange = { clientId: string; platformId: string; platformName: string | null; at: string; field: string; oldValue: string | null; newValue: string | null };

export async function readIntegrationChanges(clientId: string | null, since: number): Promise<IntegrationChange[]> {
  const from = new Date(since).toISOString();
  const rows = clientId
    ? await db()`SELECT * FROM ca_integration_changes WHERE client_id = ${clientId} AND at >= ${from} ORDER BY at DESC`
    : await db()`SELECT * FROM ca_integration_changes WHERE at >= ${from} ORDER BY at DESC`;
  return rows.map((r) => ({
    clientId: r.client_id,
    platformId: r.platform_id,
    platformName: r.platform_name,
    at: iso(r.at),
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
  }));
}

// When this member last opened a page, and records that they're opening it now.
export async function markVisit(memberId: string, page: string): Promise<string | null> {
  const [before] = await db()`SELECT seen_at FROM ca_member_visits WHERE member_id = ${memberId} AND page = ${page}`;
  await db()`
    INSERT INTO ca_member_visits (member_id, page, seen_at) VALUES (${memberId}, ${page}, now())
    ON CONFLICT (member_id, page) DO UPDATE SET seen_at = EXCLUDED.seen_at
  `;
  return before ? iso(before.seen_at) : null;
}

// ---- Health settings ----

// ---- Client flags ----

// Clients marked internal: our own test and demo accounts, hidden unless asked for (owner, 2026-11-12).
export async function readInternalClients(): Promise<Set<string>> {
  const rows = await db()`SELECT client_id FROM ca_client_flags WHERE internal`;
  return new Set(rows.map((r) => r.client_id as string));
}

export async function setClientInternal(clientId: string, internal: boolean, by: string) {
  await db()`
    INSERT INTO ca_client_flags (client_id, internal, updated_by) VALUES (${clientId}, ${internal}, ${by})
    ON CONFLICT (client_id) DO UPDATE SET internal = EXCLUDED.internal, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
}

export type HealthSetting = { key: string; value: number; updatedBy: string; updatedAt: string };

export async function readHealthSettings(): Promise<HealthSetting[]> {
  const rows = await db()`SELECT * FROM ca_health_settings`;
  return rows.map((r) => ({ key: r.key, value: Number(r.value), updatedBy: r.updated_by, updatedAt: iso(r.updated_at) }));
}

// Saves the changed values and drops the ones set back to their default.
export async function saveHealthSettings(values: Record<string, number>, reset: string[], by: string) {
  const keys = Object.keys(values);
  if (keys.length) {
    await db()`
      INSERT INTO ca_health_settings (key, value, updated_by)
      SELECT * FROM unnest(${keys}::text[], ${keys.map((k) => values[k])}::float8[], ${keys.map(() => by)}::text[])
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
      WHERE ca_health_settings.value <> EXCLUDED.value
    `;
  }
  if (reset.length) await db()`DELETE FROM ca_health_settings WHERE key = ANY(${reset}::text[])`;
}

export type Coverage = {
  hourly: { hour: string; logs: number; callouts: number }[];
  streamErrors: { stream: string; error: string }[];
  snapshotAt: string | null;
  logsSince: string | null;
};

// How complete the stored data is: rows per hour for each stream over the last 24 hours, stream
// errors, and the snapshot's age. Calls with callouts but no ingest log are counted from ca_calls.
export async function readCoverage(clientId: string | null): Promise<Coverage> {
  const [hourly, errors, [meta]] = await Promise.all([
    clientId
      ? db()`
          SELECT h AS hour,
            (SELECT count(*) FROM ca_system_logs WHERE client_id = ${clientId} AND occurred_at >= h AND occurred_at < h + interval '1 hour') AS logs,
            (SELECT count(*) FROM ca_callout_events WHERE client_id = ${clientId} AND at >= h AND at < h + interval '1 hour') AS callouts
          FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h ORDER BY h`
      : db()`
          SELECT h AS hour,
            (SELECT count(*) FROM ca_system_logs WHERE occurred_at >= h AND occurred_at < h + interval '1 hour') AS logs,
            (SELECT count(*) FROM ca_callout_events WHERE at >= h AND at < h + interval '1 hour') AS callouts
          FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h ORDER BY h`,
    db()`SELECT stream, last_error FROM ca_sync_state WHERE last_error IS NOT NULL`,
    clientId
      ? db()`SELECT (SELECT fetched_at FROM ca_client_snapshots WHERE client_id = ${clientId}) AS snapshot_at, (SELECT min(occurred_at) FROM ca_system_logs) AS logs_since`
      : db()`SELECT (SELECT refreshed_at FROM ca_sync_state WHERE stream = 'snapshots') AS snapshot_at, (SELECT min(occurred_at) FROM ca_system_logs) AS logs_since`,
  ]);
  const relevant = (stream: string) => !clientId || stream === "logs" || stream === "snapshots" || stream.endsWith(`:${clientId}`);
  return {
    hourly: hourly.map((r) => ({ hour: iso(r.hour), logs: Number(r.logs), callouts: Number(r.callouts) })),
    streamErrors: errors.filter((r) => relevant(r.stream)).map((r) => ({ stream: r.stream, error: r.last_error })),
    snapshotAt: isoOrNull(meta?.snapshot_at),
    logsSince: isoOrNull(meta?.logs_since),
  };
}

// ---- Find a call by any id along its journey ----

export type IdMatch = { kind: string; callId: string | null; clientId: string | null; licenseId: string | null; at: string | null };

// Every stored call, phone or log an id names: CallAnchor's call id, a CRM request id, a log line's
// id, the upload session, recording file or processing job, or a correlation id; or a phone's license
// id. The CRM's own record id isn't stored (it's read live on the call page), so it can't be found.
export async function findById(id: string): Promise<IdMatch[]> {
  const [calls, callouts, logs, licenses] = await Promise.all([
    db()`SELECT call_id, client_id, license_id, coalesce(ingested_at, first_callout_at) AS at FROM ca_calls WHERE call_id = ${id}`,
    db()`SELECT DISTINCT ON (call_id) call_id, client_id, at FROM ca_callout_events WHERE request_id = ${id} OR id = ${id} ORDER BY call_id, at`,
    db()`SELECT DISTINCT ON (call_id, source) call_id, client_id, occurred_at, source,
           CASE WHEN id = ${id} THEN 'Log line'
                WHEN raw->'metadata'->>'uploadSessionId' = ${id} THEN 'Upload session'
                WHEN raw->'metadata'->>'s3Key' = ${id} THEN 'Recording file'
                WHEN raw->'metadata'->>'jobId' = ${id} THEN 'Processing job'
                ELSE 'Correlation id' END AS kind
         FROM ca_system_logs
         WHERE call_id IS NOT NULL AND (id = ${id} OR raw->'metadata'->>'uploadSessionId' = ${id} OR raw->'metadata'->>'s3Key' = ${id}
           OR raw->'metadata'->>'jobId' = ${id} OR raw->>'correlationId' = ${id})
         ORDER BY call_id, source, occurred_at
         LIMIT 50`,
    db()`SELECT license_id, client_id FROM ca_licenses WHERE license_id = ${id}`,
  ]);
  const matches: IdMatch[] = [
    ...calls.map((r) => ({ kind: "CallAnchor call id", callId: r.call_id, clientId: r.client_id, licenseId: r.license_id, at: isoOrNull(r.at) })),
    ...callouts.map((r) => ({ kind: "CRM request", callId: r.call_id, clientId: r.client_id, licenseId: null, at: isoOrNull(r.at) })),
    ...logs.map((r) => ({ kind: r.kind as string, callId: r.call_id, clientId: r.client_id, licenseId: null, at: isoOrNull(r.occurred_at) })),
    ...licenses.map((r) => ({ kind: "Phone (license)", callId: null, clientId: r.client_id, licenseId: r.license_id, at: null })),
  ];
  // One row per call or phone, keeping the first (most specific) kind.
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = m.callId ? `call|${m.callId}` : `license|${m.licenseId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
