import "server-only";
import { isAuthFailure } from "@/lib/callanchor/labels";
import { getJson } from "@/lib/callanchor/portal";
import {
  optional,
  pullClient,
  pullFleet,
  readCallouts,
  readLogs,
  readSnapshots,
  readStoreStatus,
  summarizeTenant,
  type Aggregate,
  type License,
  type OneApiStatus,
  type Snapshot,
  type StoredCallout,
  type StoredLog,
  type Tenant,
  type TenantSummary,
} from "@/lib/callanchor/store";

// Client health. Events come from the store (lib/callanchor/store.ts), brought up to date first;
// per-client details on the client page are read live. GETs only.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const GRACE_MS = 30 * 60_000; // a recording younger than this may still be on its way

export const WINDOW_DAYS = [1, 3, 7, 30] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];

// Starting values, to be tuned with the owner. PORTAL_SOP.md records what was agreed.
export const THRESHOLDS = {
  criticalSuccessRate: 80,
  warningSuccessRate: 95,
  minEventsForRate: 5,
  criticalStuckRecordings: 3,
  trialWarningDays: 3,
  staleHealthCheckHours: 48,
};

type Client = { id: string; companyName: string; plan: string; status: string; accessSuspended: boolean; licenseCount: number };

export type ContactStats = {
  totalCalls: number;
  uniqueContacts: number;
  incoming: number;
  outgoing: number;
  missed: number;
  rejected: number;
  answerRate?: number;
};

export type AuditLog = {
  id: string;
  actorDisplayName?: string | null;
  action: string;
  resourceType: string;
  occurredAt: string;
};

// ---- Summaries ----

export type Outcome = {
  status: string;
  platform: string;
  httpStatus: number | null;
  label: string;
  count: number;
  lastAt: string;
  eventTypes: string[];
};

export type SyncSummary = ReturnType<typeof summarizeSync>;

export function summarizeSync(events: StoredCallout[]) {
  const outcomes = new Map<string, Outcome>();
  const byEvent: Record<string, { delivered: number; failed: number }> = {};
  const syncedRecordingIds = new Set<string>();
  const durations: number[] = [];
  let delivered = 0;
  let failed = 0;
  let authFailures = 0;
  let lastDeliveredAt: string | null = null;
  let lastFailedAt: string | null = null;

  for (const event of events) {
    const ok = event.status === "delivered";
    const bad = event.status === "failed";
    const type = (byEvent[event.eventType] ??= { delivered: 0, failed: 0 });
    if (ok) {
      delivered++;
      type.delivered++;
      if (event.eventType === "recording.ready") syncedRecordingIds.add(event.callId);
      if (!lastDeliveredAt || event.at > lastDeliveredAt) lastDeliveredAt = event.at;
    }
    if (bad) {
      failed++;
      type.failed++;
      if (!lastFailedAt || event.at > lastFailedAt) lastFailedAt = event.at;
      if (isAuthFailure(event.httpStatus, event.label)) authFailures++;
    }
    if (event.durationMs !== null) durations.push(event.durationMs);

    const key = [event.status, event.platformId, event.httpStatus ?? "", event.label].join("|");
    const outcome = outcomes.get(key) ?? {
      status: event.status,
      platform: event.platformId,
      httpStatus: event.httpStatus,
      label: event.label,
      count: 0,
      lastAt: event.at,
      eventTypes: [],
    };
    outcome.count++;
    if (event.at > outcome.lastAt) outcome.lastAt = event.at;
    if (!outcome.eventTypes.includes(event.eventType)) outcome.eventTypes.push(event.eventType);
    outcomes.set(key, outcome);
  }

  durations.sort((a, b) => a - b);
  const percentile = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor(p * durations.length))] : null);
  const settled = delivered + failed;
  const failures = events.filter((e) => e.status === "failed").sort((a, b) => b.at.localeCompare(a.at));
  const topError = [...outcomes.values()].filter((o) => o.status === "failed").sort((a, b) => b.count - a.count)[0];

  return {
    events: events.length,
    delivered,
    failed,
    inFlight: events.length - settled,
    successRate: settled ? Math.round((delivered / settled) * 1000) / 10 : null,
    recordingsSynced: byEvent["recording.ready"]?.delivered ?? 0,
    recordingsFailed: byEvent["recording.ready"]?.failed ?? 0,
    retried: events.filter((e) => e.attempt > 1).length,
    byEvent,
    authFailures,
    lastDeliveredAt,
    lastFailedAt,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    topError: topError ? { label: topError.label, count: topError.count } : null,
    outcomes: [...outcomes.values()].sort((a, b) => b.count - a.count),
    recentFailures: failures.slice(0, 25),
    syncedRecordingIds,
  };
}

export type StuckRecording = { callId: string; stage: string; since: string };
export type PipelineSummary = ReturnType<typeof summarizePipeline>;

// Follows each call through the system log: ingested, upload started, uploaded, verified, synced.
// `syncedRecordingIds` is null when no active integration takes recording.ready.
export function summarizePipeline(logs: StoredLog[], syncedRecordingIds: Set<string> | null, now: number) {
  type Call = { expectingAt?: string; startedAt?: string; completedAt?: string; verifiedAt?: string; failedAt?: string };
  const calls = new Map<string, Call>();
  const track = (id: string | null) => {
    if (!id) return {} as Call;
    let call = calls.get(id);
    if (!call) calls.set(id, (call = {}));
    return call;
  };
  const sources = new Map<string, { source: string; category: string; severity: string; count: number; lastAt: string; message: string }>();
  const counts = {
    callsIngested: 0,
    expectingRecording: 0,
    notRecorded: 0,
    uploadsStarted: 0,
    uploadsCompleted: 0,
    uploadsVerified: 0,
    uploadsFailed: 0,
    webhookDelivered: 0,
    webhookFailed: 0,
    purged: 0,
    purgeFailed: 0,
  };
  let oldestAt: string | null = null;

  for (const log of logs) {
    if (!oldestAt || log.occurredAt < oldestAt) oldestAt = log.occurredAt;
    const key = `${log.severity}|${log.source}`;
    const source = sources.get(key) ?? {
      source: log.source,
      category: log.category,
      severity: log.severity,
      count: 0,
      lastAt: log.occurredAt,
      message: log.message.slice(0, 140),
    };
    source.count++;
    if (log.occurredAt > source.lastAt) source.lastAt = log.occurredAt;
    sources.set(key, source);

    switch (log.source) {
      case "mobile.call.create":
        counts.callsIngested++;
        if (log.detail === "pending_upload") {
          counts.expectingRecording++;
          track(log.resourceId).expectingAt = log.occurredAt;
        } else if (log.detail === "not_recorded") {
          counts.notRecorded++;
        }
        break;
      case "mobile.recording.upload-init":
        counts.uploadsStarted++;
        track(log.resourceId).startedAt = log.occurredAt;
        break;
      case "mobile.recording.upload-complete":
        counts.uploadsCompleted++;
        track(log.resourceId).completedAt = log.occurredAt;
        break;
      case "mobile.recording.job-processed":
        counts.uploadsVerified++;
        track(log.resourceId).verifiedAt = log.occurredAt;
        break;
      case "mobile.recording.upload-failed":
        counts.uploadsFailed++;
        track(log.resourceId).failedAt = log.occurredAt;
        break;
      case "custom-webhook-sync":
        if (log.detail === "delivered") counts.webhookDelivered++;
        else counts.webhookFailed++;
        break;
      default:
        if (log.source.startsWith("platform-recording-cleanup")) {
          if (log.message.startsWith("Failed")) counts.purgeFailed++;
          else counts.purged++;
        }
    }
  }

  // `waiting` is the phone not uploading yet (often offline); `stuck` broke after the upload began.
  const waiting: StuckRecording[] = [];
  const stuck: StuckRecording[] = [];
  const unsynced: StuckRecording[] = [];
  const old = (at: string) => now - Date.parse(at) > GRACE_MS;
  for (const [callId, call] of calls) {
    if (call.failedAt && !call.verifiedAt) stuck.push({ callId, stage: "Upload failed", since: call.failedAt });
    else if (call.verifiedAt) {
      if (syncedRecordingIds && !syncedRecordingIds.has(callId) && old(call.verifiedAt)) {
        unsynced.push({ callId, stage: "Uploaded, not synced to the CRM", since: call.verifiedAt });
      }
    } else if (call.completedAt) {
      if (old(call.completedAt)) stuck.push({ callId, stage: "Uploaded, not verified", since: call.completedAt });
    } else if (call.startedAt) {
      if (old(call.startedAt)) stuck.push({ callId, stage: "Upload started, not finished", since: call.startedAt });
    } else if (call.expectingAt && old(call.expectingAt)) {
      waiting.push({ callId, stage: "Phone hasn't uploaded the recording", since: call.expectingAt });
    }
  }
  const newestFirst = (a: StuckRecording, b: StuckRecording) => b.since.localeCompare(a.since);

  return {
    ...counts,
    logCount: logs.length,
    oldestAt,
    waiting: waiting.sort(newestFirst),
    stuck: stuck.sort(newestFirst),
    unsynced: unsynced.sort(newestFirst),
    sources: [...sources.values()].sort((a, b) => b.count - a.count),
  };
}

// ---- Scoring ----

export type Level = "critical" | "warning" | "healthy" | "idle" | "unknown";
export type Flag = { level: "critical" | "warning" | "info"; text: string };

const LEVEL_RANK: Record<Level, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3, idle: 4 };
export const byLevel = (a: Level, b: Level) => LEVEL_RANK[a] - LEVEL_RANK[b];

function evaluate(input: {
  windowLabel: string;
  status: string;
  accessSuspended?: boolean;
  sync: SyncSummary;
  pipeline: PipelineSummary;
  tenant: TenantSummary | null;
  oneApi: OneApiStatus | null;
  callsRecently: number;
}): { level: Level; flags: Flag[] } {
  const { sync, pipeline, tenant, oneApi, windowLabel } = input;
  const flags: Flag[] = [];
  const add = (level: Flag["level"], text: string) => flags.push({ level, text });
  const settled = sync.delivered + sync.failed;
  const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

  if (sync.authFailures > 0) add("critical", `CRM sign-in failing: ${n(sync.authFailures, "sync")} rejected for credentials in ${windowLabel}`);
  if (sync.successRate !== null && settled >= THRESHOLDS.minEventsForRate) {
    const failedShare = Math.round((100 - sync.successRate) * 10) / 10;
    if (sync.successRate < THRESHOLDS.criticalSuccessRate) add("critical", `${failedShare}% of CRM syncs failed (${sync.failed} of ${settled}) in ${windowLabel}`);
    else if (sync.successRate < THRESHOLDS.warningSuccessRate) add("warning", `${failedShare}% of CRM syncs failed (${sync.failed} of ${settled}) in ${windowLabel}`);
  } else if (sync.failed > 0) {
    add("warning", `${n(sync.failed, "CRM sync")} failed in ${windowLabel}`);
  }
  if (tenant && tenant.activeIntegrations.length > 0 && input.callsRecently > 0 && sync.delivered === 0) {
    add("critical", `${n(input.callsRecently, "call")} came in during ${windowLabel} but nothing reached the CRM`);
  }
  if (pipeline.stuck.length > 0) {
    add(pipeline.stuck.length >= THRESHOLDS.criticalStuckRecordings ? "critical" : "warning", `${n(pipeline.stuck.length, "recording")} stuck or failed after the upload began`);
  }
  if (pipeline.waiting.length > 0) add("warning", `${n(pipeline.waiting.length, "recording")} not uploaded by the phone after 30 minutes`);
  if (pipeline.unsynced.length > 0) add("warning", `${n(pipeline.unsynced.length, "uploaded recording")} not synced to the CRM`);
  // A platform-wide CallAnchor fault, so it's shown once on the fleet page and only noted here.
  if (pipeline.purgeFailed > 0) add("info", `${n(pipeline.purgeFailed, "recording")} not deleted from CallAnchor's S3 after syncing`);
  if (tenant) {
    // A limit hurts a client that is still calling, and may explain why a trial went quiet.
    if (tenant.recordingAtLimit) {
      add(input.callsRecently > 0 ? "critical" : input.status === "inactive" ? "info" : "warning", "Recording limit reached");
    }
    if (tenant.trialExpired) add("warning", "Trial expired");
    else if (tenant.trialDaysRemaining !== null && tenant.trialDaysRemaining <= THRESHOLDS.trialWarningDays) {
      add("warning", `Trial ends in ${n(tenant.trialDaysRemaining, "day")}`);
    }
    if (tenant.licenseOverBy > 0) add("warning", `${n(tenant.licenseOverBy, "license")} over the contract cap`);
    if (tenant.storageError) add("warning", `Storage error: ${tenant.storageError}`);
    if (tenant.migrationFailed > 0) add("warning", `${n(tenant.migrationFailed, "recording")} failed to migrate storage`);
    if (tenant.activeIntegrations.length === 0 && input.callsRecently > 0) add("info", "No active CRM integration");
    if (tenant.loggedInNoCalls > 0) add("info", `${n(tenant.loggedInNoCalls, "logged-in license")} never made a call`);
    for (const i of tenant.integrations) {
      if (i.active && i.lastHealthCheck && Date.now() - Date.parse(i.lastHealthCheck) > THRESHOLDS.staleHealthCheckHours * HOUR) {
        add("info", `${i.platformName} health check older than ${THRESHOLDS.staleHealthCheckHours} hours`);
      }
    }
  }
  if (oneApi && !oneApi.linked) add("warning", "Not linked to OneAPI");
  else if (oneApi?.backfillRecommended) add("info", "OneAPI backfill recommended");
  if (input.accessSuspended) add("info", "Access suspended");

  const rank = { critical: 0, warning: 1, info: 2 };
  flags.sort((a, b) => rank[a.level] - rank[b.level]);
  const level: Level = flags.some((f) => f.level === "critical")
    ? "critical"
    : flags.some((f) => f.level === "warning")
      ? "warning"
      : sync.events === 0 && input.callsRecently === 0
        ? "idle"
        : "healthy";
  return { level, flags };
}

const groupBy = <T>(rows: T[], key: (row: T) => string | null) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k) groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
};

// ---- Consolidated view ----

export type FleetRow = {
  clientId: string;
  companyName: string;
  status: string;
  level: Level;
  flags: Flag[];
  error: string | null;
  totalCalls: number;
  callsToday: number;
  callsIngested: number;
  expectingRecording: number;
  uploadsVerified: number;
  stuckRecordings: number;
  waitingRecordings: number;
  unsyncedRecordings: number;
  purgeFailed: number;
  syncEvents: number;
  syncDelivered: number;
  syncFailed: number;
  successRate: number | null;
  recordingsSynced: number;
  lifetimeSuccessRate: number | null;
  lifetimeEvents: number;
  pendingRecordings: number | null;
  lastCallAt: string | null;
  lastDeliveredAt: string | null;
  topError: { label: string; count: number } | null;
  integrations: string[];
  licenses: string;
};

function fleetRow(snapshot: Snapshot, events: StoredCallout[], logs: StoredLog[], now: number): FleetRow {
  const { tenant, metrics, aggregate } = snapshot;
  const status = snapshot.status ?? "unknown";
  const sync = summarizeSync(events);
  const pipeline = summarizePipeline(logs, tenant?.takesRecordings ? sync.syncedRecordingIds : null, now);
  const { level, flags } = evaluate({
    windowLabel: "the last 24 hours",
    status,
    sync,
    pipeline,
    tenant,
    oneApi: snapshot.oneApi,
    callsRecently: Math.max(pipeline.callsIngested, metrics?.callsToday ?? 0),
  });
  return {
    clientId: snapshot.clientId,
    companyName: snapshot.companyName ?? snapshot.clientId,
    status,
    level: tenant ? level : "unknown",
    flags,
    error: tenant ? null : "CallAnchor didn't return this client's details",
    totalCalls: metrics?.totalCalls ?? 0,
    callsToday: metrics?.callsToday ?? 0,
    callsIngested: pipeline.callsIngested,
    expectingRecording: pipeline.expectingRecording,
    uploadsVerified: pipeline.uploadsVerified,
    stuckRecordings: pipeline.stuck.length,
    waitingRecordings: pipeline.waiting.length,
    unsyncedRecordings: pipeline.unsynced.length,
    purgeFailed: pipeline.purgeFailed,
    syncEvents: sync.events,
    syncDelivered: sync.delivered,
    syncFailed: sync.failed,
    successRate: sync.successRate,
    recordingsSynced: sync.recordingsSynced,
    lifetimeSuccessRate: aggregate?.total ? aggregate.successRate : null,
    lifetimeEvents: aggregate?.total ?? 0,
    pendingRecordings: tenant?.pendingRecordings ?? null,
    lastCallAt: tenant?.lastCallAt ?? null,
    lastDeliveredAt: sync.lastDeliveredAt,
    topError: sync.topError,
    integrations: tenant?.activeIntegrations ?? [],
    licenses: tenant ? `${tenant.loggedIn}/${tenant.licenses}` : `${metrics?.totalLicenses ?? 0}`,
  };
}

export async function loadFleetHealth(cookie: string) {
  const started = Date.now();
  const pull = await pullFleet(cookie);
  const now = Date.now();
  const since = now - DAY;
  const [snapshots, events, logs, store] = await Promise.all([readSnapshots(), readCallouts(null, since), readLogs(null, since), readStoreStatus(null)]);
  const eventsByClient = groupBy(events, (e) => e.clientId);
  const logsByClient = groupBy(logs, (l) => l.clientId);

  const rows = snapshots.map((s) => fleetRow(s, eventsByClient.get(s.clientId) ?? [], logsByClient.get(s.clientId) ?? [], now));

  // Fleet-wide view of failures: which errors hit how many clients.
  const names = new Map(rows.map((r) => [r.clientId, r.companyName]));
  const errors = new Map<string, { platform: string; label: string; count: number; clients: string[] }>();
  for (const event of events) {
    if (event.status !== "failed") continue;
    const key = `${event.platformId}|${event.label}`;
    const entry = errors.get(key) ?? { platform: event.platformId, label: event.label, count: 0, clients: [] };
    entry.count++;
    const name = names.get(event.clientId) ?? event.clientId;
    if (!entry.clients.includes(name)) entry.clients.push(name);
    errors.set(key, entry);
  }

  return {
    rows: rows.sort((a, b) => byLevel(a.level, b.level) || b.syncFailed - a.syncFailed || b.callsToday - a.callsToday),
    errors: [...errors.values()].sort((a, b) => b.count - a.count),
    pipelineTotals: summarizePipeline(logs, null, now),
    pullErrors: [...new Set(pull.errors)],
    store,
    loadedAt: new Date(now).toISOString(),
    tookMs: Date.now() - started,
  };
}

// ---- One client ----

export async function loadClientHealth(cookie: string, clientId: string, days: WindowDays) {
  const started = Date.now();
  const base = `/api/clients/${clientId}`;
  // Account details are small and change, so they're read live; events come from the store.
  const [client, tenantBody, oneApi, contacts, audit, pull] = await Promise.all([
    getJson<Client>(cookie, base),
    getJson<Tenant>(cookie, `${base}/tenant`),
    optional(getJson<OneApiStatus>(cookie, `${base}/oneapi/status`)),
    optional(getJson<{ stats: ContactStats }>(cookie, `${base}/call-contacts?page=1&limit=1`)),
    optional(getJson<{ items: AuditLog[] }>(cookie, `/api/support/audit-logs?page=1&limit=25&clientId=${clientId}`)),
    pullClient(cookie, clientId),
  ]);
  const now = Date.now();
  const since = now - days * DAY;
  const [events, logs, [snapshot], store] = await Promise.all([
    readCallouts(clientId, since),
    readLogs(clientId, since),
    readSnapshots(clientId),
    readStoreStatus(clientId),
  ]);

  const tenant = summarizeTenant(tenantBody, client.status);
  const sync = summarizeSync(events);
  const pipeline = summarizePipeline(logs, tenant.takesRecordings ? sync.syncedRecordingIds : null, now);
  const windowLabel = days === 1 ? "the last 24 hours" : `the last ${days} days`;
  const { level, flags } = evaluate({
    windowLabel,
    status: client.status,
    accessSuspended: client.accessSuspended,
    sync,
    pipeline,
    tenant,
    oneApi,
    callsRecently: pipeline.callsIngested,
  });

  // Hourly buckets for one day, daily otherwise.
  const bucketMs = days === 1 ? HOUR : DAY;
  const bucketCount = Math.ceil((now - since) / bucketMs);
  const firstBucket = now - bucketCount * bucketMs;
  const trend = Array.from({ length: bucketCount }, (_, i) => ({ start: new Date(firstBucket + i * bucketMs).toISOString(), delivered: 0, failed: 0 }));
  for (const event of events) {
    const bucket = trend[Math.floor((Date.parse(event.at) - firstBucket) / bucketMs)];
    if (!bucket) continue;
    if (event.status === "delivered") bucket.delivered++;
    else if (event.status === "failed") bucket.failed++;
  }

  return {
    client,
    level,
    flags,
    tenant,
    licenses: tenantBody.licenses as License[],
    oneApi,
    contacts: contacts?.stats ?? null,
    audit: audit?.items ?? [],
    lifetime: (snapshot?.aggregate ?? null) as Aggregate | null,
    sync,
    pipeline,
    trend,
    trendHourly: days === 1,
    windowLabel,
    since: new Date(since).toISOString(),
    pullErrors: [...new Set(pull.errors)],
    store,
    loadedAt: new Date(now).toISOString(),
    tookMs: Date.now() - started,
  };
}
