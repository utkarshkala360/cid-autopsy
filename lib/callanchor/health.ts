import "server-only";
import { httpClass } from "@/lib/callanchor/labels";
import {
  applySettings,
  byIssue,
  callProblem,
  callTime,
  clientContext,
  clientIssues,
  finishLicense,
  fleetLicenseContext,
  fleetStall,
  inStage,
  isDelivered,
  isRecorded,
  isVerified,
  licenseHealth,
  perPhoneLicenses,
  platformIssues,
  pulse,
  rollUp,
  RULES,
  stageTitle,
  type CallStage,
  type ClientContext,
  type Issue,
  type LicenseHealth,
  type Pulse,
} from "@/lib/callanchor/issues";
import { getJson, PortalError } from "@/lib/callanchor/portal";
import {
  SYNC,
  optional,
  pullClient,
  pullFleet,
  readCall,
  readCallouts,
  readCalls,
  readCoverage,
  readDaily,
  readHealthSettings,
  readIntegrationChanges,
  readIssueState,
  readLastSyncs,
  readLicense,
  readLicenseChanges,
  readLicenseHistoryStart,
  readLicenses,
  readLogs,
  readOpenCalls,
  readReplyShapes,
  readSnapshots,
  readStoreStatus,
  readStoredCall,
  readSuggestions,
  markVisit,
  saveIntegrations,
  saveLicenses,
  summarizeTenant,
  touchIssues,
  type Aggregate,
  type AnchorLog,
  type License,
  type OneApiStatus,
  type ReplySuggestion,
  type Snapshot,
  type StoredCall,
  type StoredCallout,
  type StoredLog,
  type Tenant,
  type TenantSummary,
} from "@/lib/callanchor/store";

// Client health. Data comes from the store (lib/callanchor/store.ts), brought up to date first, and
// issues from lib/callanchor/issues.ts. Per-client account details are read live. GETs only.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Calls read for issues: today plus a full 7-day baseline before it.
const ASSESS_DAYS = 8;

export const WINDOW_DAYS = [1, 3, 7, 30] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];

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

export type Level = "critical" | "warning" | "healthy" | "idle" | "unknown";
// Where a number leads: a filtered list of the stored items behind it (health/items).
export type Drill = { kind: "syncs" | "calls" | "logs" } & Record<string, string>;

const LEVEL_RANK: Record<Level, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3, idle: 4 };
export const byLevel = (a: Level, b: Level) => LEVEL_RANK[a] - LEVEL_RANK[b];

const groupBy = <T>(rows: T[], key: (row: T) => string | null) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k) groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return groups;
};

const within = (call: StoredCall, now: number, ms: number) => now - Date.parse(callTime(call)!) <= ms;

// ---- Settings ----

// Applies the owner's saved thresholds to RULES. Every loader calls it first.
export async function loadSettings() {
  const saved = await readHealthSettings();
  applySettings(Object.fromEntries(saved.map((s) => [s.key, s.value])));
  return saved;
}

// ---- Assessing clients and licenses ----

export type Seats = {
  // Bought, from CallAnchor's account; null on snapshots saved before 5 Nov.
  purchased: number | null;
  active: number;
  assigned: number;
  loggedIn: number;
  // Active seats by use (see SeatState): calling within the unused threshold, or not.
  calling: number;
  idle: number;
  loggedOut: number;
  unassigned: number;
};

export type Assessment = {
  snapshot: Snapshot;
  ctx: ClientContext;
  // The last 24 hours of calls.
  calls: StoredCall[];
  // Client issues, license issues that weren't rolled up, and rolled-up ones, worst first.
  issues: Issue[];
  licenses: LicenseHealth[];
  level: Level;
  pulse: Pulse;
  seats: Seats;
  // CRM callouts over the last 24 hours.
  callouts: StoredCallout[];
};

function seatsOf(snapshot: Snapshot, licenses: LicenseHealth[]): Seats {
  const active = licenses.filter((h) => h.license.isActive !== false);
  return {
    purchased: snapshot.client?.licenseCount ?? null,
    active: active.length,
    assigned: active.filter((h) => h.license.memberId).length,
    loggedIn: active.filter((h) => h.license.isLoggedIn).length,
    calling: active.filter((h) => h.seat.state === "calling").length,
    idle: active.filter((h) => h.seat.state === "idle").length,
    loggedOut: active.filter((h) => h.seat.state === "loggedOut").length,
    unassigned: active.filter((h) => h.seat.state === "unassigned").length,
  };
}

// Runs the issue engine for one client, or every client when `only` is null. License hints that
// compare across the fleet (app version, device model) always see every license.
async function assess(now: number, only: string | null, live?: { tenant: TenantSummary; status: string; accessSuspended: boolean }) {
  const snapshots = await readSnapshots();
  const tenantOf = (s: Snapshot) => (live && s.clientId === only ? live.tenant : s.tenant);
  const contexts = new Map(snapshots.map((s) => [s.clientId, clientContext(tenantOf(s))]));
  const ids = (test: (ctx: ClientContext) => boolean) => [...contexts].filter(([, ctx]) => test(ctx)).map(([id]) => id);
  const weekSince = now - ASSESS_DAYS * DAY;
  const [licenses, scopedCalls, otherDays, open, rows, lastSyncs, callouts, changes, integrationChanges, starts, shapes] = await Promise.all([
    readLicenses(),
    readCalls({ clientId: only }, weekSince),
    only ? readCalls({}, now - DAY) : Promise.resolve(null),
    readOpenCalls({ clientId: only }, now - RULES.openLookbackDays * DAY, weekSince, {
      withIntegration: ids((ctx) => ctx.takesAny),
      withCallCompleted: ids((ctx) => ctx.takesCallCompleted),
    }),
    readDaily({ clientId: only }, now - 30 * DAY, RULES.serverGraceMs),
    readLastSyncs(only),
    readCallouts(only, now - DAY),
    readLicenseChanges({ clientId: only }, now - 30 * DAY),
    readIntegrationChanges(only, now - 7 * DAY),
    readLicenseHistoryStart(),
    readReplyShapes(only, now - 7 * DAY),
  ]);
  // For one client, other clients' last 24 hours are enough for the fleet-wide license hints.
  const callsByClient = groupBy(otherDays ?? scopedCalls, (c) => c.clientId);
  if (only) callsByClient.set(only, scopedCalls);
  const openByClient = groupBy(open, (c) => c.clientId);
  const rowsByClient = groupBy(rows, (r) => r.clientId);
  const licensesByClient = groupBy(licenses, (l) => l.clientId);
  const changesByClient = groupBy(changes, (c) => licenses.find((l) => l.licenseId === c.licenseId)?.clientId ?? null);
  const calloutsByClient = groupBy(callouts, (e) => e.clientId);
  const integrationChangesByClient = groupBy(integrationChanges, (c) => c.clientId);
  const shapesByClient = groupBy(shapes, (s) => s.clientId);
  const scoped = (id: string) => !only || id === only;

  const prepared = snapshots.map((snapshot) => {
    const isLive = live && snapshot.clientId === only;
    const tenant = tenantOf(snapshot);
    const status = isLive ? live.status : (snapshot.status ?? "unknown");
    const calls = callsByClient.get(snapshot.clientId) ?? [];
    const perPhone = perPhoneLicenses(calls, now);
    const health = licenseHealth(
      {
        clientId: snapshot.clientId,
        status,
        tenant,
        licenses: licensesByClient.get(snapshot.clientId) ?? [],
        calls,
        open: openByClient.get(snapshot.clientId) ?? [],
        rows: rowsByClient.get(snapshot.clientId) ?? [],
        lastSyncs: lastSyncs.licenses,
        clientLastSyncAt: lastSyncs.clients.get(snapshot.clientId)?.syncAt ?? null,
        changes: scoped(snapshot.clientId) ? (changesByClient.get(snapshot.clientId) ?? []) : [],
        historyStart: starts.get(snapshot.clientId) ?? null,
        perPhone,
      },
      now,
    );
    return { snapshot: { ...snapshot, tenant, status }, calls, health, perPhone };
  });
  const fleet = fleetLicenseContext(prepared.flatMap((p) => p.health));

  return prepared
    .filter((p) => scoped(p.snapshot.clientId))
    .map(({ snapshot, calls, health, perPhone }): Assessment => {
      const { clientId, tenant } = snapshot;
      const ctx = clientContext(tenant);
      const finished = health.map((h) => finishLicense(h, fleet, now));
      const rolled = rollUp(clientId, finished, now);
      const clientOpen = openByClient.get(clientId) ?? [];
      const day = calls.filter((c) => within(c, now, DAY));
      const last = lastSyncs.clients.get(clientId);
      const pulseOf = pulse({ rows: rowsByClient.get(clientId) ?? [], calls24h: day, pool: [...calls, ...clientOpen], ctx, now, lastSyncAt: last?.syncAt ?? null, lastCallAt: last?.callAt ?? null });
      const own = clientIssues(
        {
          clientId,
          status: snapshot.status ?? "unknown",
          accessSuspended: live && clientId === only ? live.accessSuspended : (snapshot.client?.accessSuspended ?? undefined),
          tenant,
          oneApi: snapshot.oneApi,
          callsToday: snapshot.metrics?.callsToday ?? 0,
          calls,
          open: clientOpen,
          days: pulseOf.days,
          lastSyncAt: last?.syncAt ?? null,
          callouts: calloutsByClient.get(clientId) ?? [],
          integrationChanges: integrationChangesByClient.get(clientId) ?? [],
          perPhone,
          replyShapes: shapesByClient.get(clientId) ?? [],
        },
        now,
      );
      // A shared license problem is raised once, so its client issue replaces the per-license ones.
      const licenseIssues = rolled.licenses.flatMap((h) => h.issues.filter((i) => !i.rolledUp));
      let issues = [...own, ...rolled.issues, ...licenseIssues].sort(byIssue);
      // An inactive client's issues are kept for reference, but none needs action (QA A2).
      if (snapshot.status === "inactive") issues = issues.map((i) => ({ ...i, level: "info" as const, evidence: ["The client is inactive", ...i.evidence] }));
      const worst = issues[0]?.level;
      const level: Level = !tenant
        ? "unknown"
        : worst === "critical" || worst === "warning"
          ? worst
          : day.length === 0
            ? "idle"
            : "healthy";
      return { snapshot, ctx, calls: day, issues, licenses: rolled.licenses, level, pulse: pulseOf, seats: seatsOf(snapshot, rolled.licenses), callouts: calloutsByClient.get(clientId) ?? [] };
    });
}

// Remembers which issues are open and when each began, and sets `firstAt` to the earlier of that and
// what the data shows. With a visit, marks the issues opened since it.
async function remember(issues: Issue[], lastVisit: string | null = null) {
  const seen = await touchIssues(
    issues.map((i) => ({ id: i.id, kind: i.kind, scope: i.scope, clientId: i.clientId, licenseId: i.licenseId, level: i.level, firstAt: i.trend === "state" ? null : i.firstAt })),
  );
  for (const i of issues) {
    const state = seen.get(i.id);
    if (!state) continue;
    if (!i.firstAt || state.firstSeenAt < i.firstAt) i.firstAt = state.firstSeenAt;
    if (lastVisit && state.openedAt > lastVisit) i.newSinceVisit = true;
  }
}

export const licenseCounts = (licenses: LicenseHealth[]) => ({
  total: licenses.length,
  ok: licenses.filter((h) => h.status === "healthy" || h.status === "idle").length,
  critical: licenses.filter((h) => h.status === "critical").length,
  warning: licenses.filter((h) => h.status === "warning").length,
});

// ---- Data coverage ----

export type CoverageSummary = Awaited<ReturnType<typeof readCoverage>> & { callsWithoutLog: number; callsWithCallouts: number };

function coverage(base: Awaited<ReturnType<typeof readCoverage>>, calls: StoredCall[]): CoverageSummary {
  const logsSince = base.logsSince ? Date.parse(base.logsSince) : Infinity;
  // Only calls inside the stored log window can be missing their ingest log (finding D).
  const inWindow = calls.filter((c) => c.attempts > 0 && c.firstCalloutAt && Date.parse(c.firstCalloutAt) >= logsSince + HOUR);
  return { ...base, callsWithCallouts: inWindow.length, callsWithoutLog: inWindow.filter((c) => c.ingestedAt === null).length };
}

// ---- Fleet ----

export type FleetRow = {
  clientId: string;
  companyName: string;
  status: string;
  level: Level;
  issues: Issue[];
  calls24h: number;
  callsToday: number;
  // Delivered out of due, the one "reached the CRM" share (QA N1). Null when nothing was due.
  reached: number;
  due: number;
  reachedShare: number | null;
  recordingsVerified: number;
  recordingsSynced: number;
  openIssues: number;
  lastActivityAt: string | null;
  lastSyncAt: string | null;
  // Synced days out of days with due calls, last 7 days, and the 7-day strip.
  week: Pulse["week"];
  days: Pulse["days"];
  openDrops: number;
  seats: Seats;
  licenses: ReturnType<typeof licenseCounts>;
  integrations: string[];
  error: string | null;
};

// Failed CRM syncs across clients, titled by what's trusted (platform, HTTP code, persistence) with
// the masked replies underneath as samples.
export type ErrorGroup = { platform: string; http: number | null; calls: number; persistent: number; clients: { id: string; name: string }[]; samples: { label: string; count: number }[] };

function errorGroups(events: StoredCallout[], names: Map<string, string>): ErrorGroup[] {
  const deliveredCalls = new Set(events.filter((e) => e.status === "delivered").map((e) => e.callId));
  const groups = new Map<string, { platform: string; http: number | null; calls: Set<string>; clients: Set<string>; labels: Map<string, number> }>();
  for (const e of events) {
    if (e.status !== "failed") continue;
    const key = `${e.platformId}|${e.httpStatus ?? ""}`;
    const g = groups.get(key) ?? { platform: e.platformId, http: e.httpStatus, calls: new Set(), clients: new Set(), labels: new Map() };
    g.calls.add(e.callId);
    g.clients.add(e.clientId);
    g.labels.set(e.label, (g.labels.get(e.label) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      platform: g.platform,
      http: g.http,
      calls: g.calls.size,
      persistent: [...g.calls].filter((id) => !deliveredCalls.has(id)).length,
      clients: [...g.clients].map((id) => ({ id, name: names.get(id) ?? id })),
      samples: [...g.labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({ label, count })),
    }))
    .sort((a, b) => b.calls - a.calls);
}

export async function loadFleetHealth(cookie: string, memberId: string) {
  const started = Date.now();
  await loadSettings();
  const pull = await pullFleet(cookie);
  const now = Date.now();
  const [assessments, logs, store, cover, lastVisit] = await Promise.all([
    assess(now, null),
    readLogs(null, now - DAY),
    readStoreStatus(null),
    readCoverage(null),
    markVisit(memberId, "fleet"),
  ]);
  const platform = platformIssues(logs, now);
  // Clients that usually call: the denominator for a fleet-wide stall.
  const busy = assessments.filter((a) => a.snapshot.status !== "inactive" && a.pulse.days.slice(-8, -1).reduce((sum, d) => sum + d.calls, 0) / 7 >= RULES.quietMinDailyCalls).length;
  const stall = fleetStall(assessments.flatMap((a) => a.issues.filter((i) => i.kind === "client_quiet")), busy, now);
  await remember([...assessments.flatMap((a) => a.issues), ...platform, ...(stall ? [stall] : [])], lastVisit);

  const rows = assessments.map(({ snapshot, calls, issues, licenses, level, pulse: p, seats }): FleetRow => {
    const lastActivityAt = calls.reduce<string | null>((latest, c) => {
      const at = [c.lastCalloutAt, callTime(c)].filter((t): t is string => !!t).sort().pop() ?? null;
      return at && (!latest || at > latest) ? at : latest;
    }, null);
    return {
      clientId: snapshot.clientId,
      companyName: snapshot.companyName ?? snapshot.clientId,
      status: snapshot.status ?? "unknown",
      level,
      issues,
      calls24h: calls.length,
      callsToday: snapshot.metrics?.callsToday ?? 0,
      reached: p.reached.delivered,
      due: p.reached.due,
      reachedShare: p.reached.share,
      recordingsVerified: calls.filter((c) => inStage("verified", c, clientContext(snapshot.tenant), now)).length,
      recordingsSynced: calls.filter((c) => inStage("synced", c, clientContext(snapshot.tenant), now)).length,
      openIssues: issues.filter((i) => i.level !== "info").length,
      lastActivityAt: lastActivityAt ?? p.lastCallAt ?? snapshot.tenant?.lastCallAt ?? null,
      lastSyncAt: p.lastSyncAt,
      week: p.week,
      days: p.days.slice(-7),
      openDrops: p.openDrops,
      seats,
      licenses: licenseCounts(licenses),
      integrations: snapshot.tenant?.activeIntegrations ?? [],
      error: snapshot.tenant ? null : "CallAnchor didn't return this client's details",
    };
  });
  const names = new Map(rows.map((r) => [r.clientId, r.companyName]));
  const needsAction = [...(stall ? [stall] : []), ...assessments.flatMap((a) => a.issues)]
    .filter((i) => i.level !== "info" && !i.rolledUp)
    .sort(byIssue);
  const working = assessments.filter((a) => a.snapshot.status !== "inactive");
  const allCalls = working.flatMap((a) => a.calls);
  const sum = (pick: (a: Assessment) => number) => working.reduce((total, a) => total + pick(a), 0);

  return {
    rows: rows.sort((a, b) => byLevel(a.level, b.level) || b.openIssues - a.openIssues || b.calls24h - a.calls24h),
    needsAction,
    lastVisit,
    names: Object.fromEntries(names),
    licenseNames: Object.fromEntries(assessments.flatMap((a) => a.licenses.map((h) => [h.license.licenseId, h.license.last4 ?? "????"]))),
    platform,
    errors: errorGroups(assessments.flatMap((a) => a.callouts), names),
    sources: summarizeSources(logs),
    // Totals leave out inactive clients, as the table does by default (QA N9).
    totals: {
      clients: working.length,
      inactive: assessments.length - working.length,
      calls: allCalls.length,
      due: sum((a) => a.pulse.reached.due),
      reached: sum((a) => a.pulse.reached.delivered),
      verified: allCalls.filter((c) => isVerified(c)).length,
      synced: allCalls.filter((c) => isVerified(c) && isDelivered(c)).length,
      openDrops: sum((a) => a.pulse.openDrops),
      callsToday: working.reduce((total, a) => total + (a.snapshot.metrics?.callsToday ?? 0), 0),
      seats: {
        purchased: working.every((a) => a.seats.purchased !== null) ? sum((a) => a.seats.purchased ?? 0) : null,
        active: sum((a) => a.seats.active),
        assigned: sum((a) => a.seats.assigned),
        loggedIn: sum((a) => a.seats.loggedIn),
        calling: sum((a) => a.seats.calling),
        idle: sum((a) => a.seats.idle),
        loggedOut: sum((a) => a.seats.loggedOut),
        unassigned: sum((a) => a.seats.unassigned),
      } satisfies Seats,
    },
    trials: assessments
      .filter((a) => a.snapshot.status === "trial")
      .map((a) => ({
        clientId: a.snapshot.clientId,
        companyName: a.snapshot.companyName ?? a.snapshot.clientId,
        daysLeft: a.snapshot.tenant?.trialDaysRemaining ?? null,
        expired: a.snapshot.tenant?.trialExpired ?? false,
        recorded: a.snapshot.tenant?.recordedCalls ?? 0,
        recordingLimit: a.snapshot.tenant?.recordingLimit ?? null,
        calls7d: a.pulse.days.slice(-7).reduce((total, d) => total + d.calls, 0),
        seats: a.seats,
        neverCalled: a.licenses.filter((h) => h.issues.some((i) => i.kind === "license_never_called")).length,
        integrations: a.snapshot.tenant?.activeIntegrations ?? [],
      }))
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
    coverage: coverage(cover, allCalls),
    pullErrors: [...new Set(pull.errors)],
    store,
    loadedAt: new Date(now).toISOString(),
    tookMs: Date.now() - started,
  };
}

// Every system log source in a window, by severity: what CallAnchor logged.
function summarizeSources(logs: StoredLog[]) {
  const sources = new Map<string, { source: string; severity: string; count: number; lastAt: string; message: string }>();
  for (const log of logs) {
    const key = `${log.severity}|${log.source}`;
    const s = sources.get(key) ?? { source: log.source, severity: log.severity, count: 0, lastAt: log.occurredAt, message: log.message.slice(0, 140) };
    s.count++;
    if (log.occurredAt > s.lastAt) s.lastAt = log.occurredAt;
    sources.set(key, s);
  }
  return [...sources.values()].sort((a, b) => b.count - a.count);
}

// ---- One client ----

// CRM replies grouped by what's trusted: platform, outcome and HTTP code, then whether retries ever
// fixed it. Masked reply text sits underneath as samples of what the CRM said.
export type ReplyGroup = {
  platform: string;
  status: string;
  http: number | null;
  httpClass: string;
  events: number;
  calls: number;
  retriedCalls: number;
  // Of the calls with a failure here, how many reached the CRM in the end.
  recovered: number;
  p50Ms: number | null;
  lastAt: string;
  samples: { label: string; count: number }[];
  eventTypes: string[];
};

function summarizeReplies(events: StoredCallout[]): ReplyGroup[] {
  const deliveredCalls = new Set(events.filter((e) => e.status === "delivered").map((e) => e.callId));
  const attemptsByCall = new Map<string, number>();
  for (const e of events) attemptsByCall.set(e.callId, (attemptsByCall.get(e.callId) ?? 0) + 1);
  type Acc = { platform: string; status: string; http: number | null; events: number; calls: Set<string>; durations: number[]; lastAt: string; labels: Map<string, number>; types: Set<string> };
  const groups = new Map<string, Acc>();
  for (const e of events) {
    const key = `${e.platformId}|${e.status}|${e.httpStatus ?? ""}`;
    const g: Acc = groups.get(key) ?? { platform: e.platformId, status: e.status, http: e.httpStatus, events: 0, calls: new Set(), durations: [], lastAt: e.at, labels: new Map(), types: new Set() };
    g.events++;
    g.calls.add(e.callId);
    if (e.durationMs !== null) g.durations.push(e.durationMs);
    if (e.at > g.lastAt) g.lastAt = e.at;
    g.labels.set(e.label, (g.labels.get(e.label) ?? 0) + 1);
    g.types.add(e.eventType);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const sorted = g.durations.sort((a, b) => a - b);
      return {
        platform: g.platform,
        status: g.status,
        http: g.http,
        httpClass: httpClass(g.http),
        events: g.events,
        calls: g.calls.size,
        retriedCalls: [...g.calls].filter((id) => (attemptsByCall.get(id) ?? 0) > 1).length,
        recovered: g.status === "failed" ? [...g.calls].filter((id) => deliveredCalls.has(id)).length : 0,
        p50Ms: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        lastAt: g.lastAt,
        samples: [...g.labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({ label, count })),
        eventTypes: [...g.types],
      };
    })
    .sort((a, b) => (a.status === "failed" ? 0 : 1) - (b.status === "failed" ? 0 : 1) || b.calls - a.calls);
}

// The call journey for a set of calls: each step's count, and the stage that opens the calls lost there.
// Each step is a subset of the one before, so no bar passes 100% (QA N5).
export type FunnelStep = { label: string; count: number; stage: CallStage; lost?: { count: number; stage: CallStage; label: string } };

export function funnel(calls: StoredCall[], ctx: ClientContext, now: number) {
  const count = (stage: CallStage) => calls.filter((c) => inStage(stage, c, ctx, now)).length;
  const crm: FunnelStep[] = [
    { label: "Calls", count: calls.length, stage: "all", lost: { count: count("notSent"), stage: "notSent", label: "no callout" } },
    { label: "Sent to the CRM", count: count("sent"), stage: "sent", lost: { count: count("notAccepted"), stage: "notAccepted", label: "not accepted" } },
    { label: "Accepted by the CRM", count: count("delivered"), stage: "delivered" },
  ];
  const recording: FunnelStep[] = [
    { label: "Recorded", count: count("recorded"), stage: "recorded", lost: { count: count("notUploaded"), stage: "notUploaded", label: "not uploaded" } },
    { label: "Uploaded", count: count("uploaded"), stage: "uploaded", lost: { count: count("notVerified"), stage: "notVerified", label: "not verified" } },
    { label: "Verified", count: count("verified"), stage: "verified", lost: { count: count("notSynced"), stage: "notSynced", label: "not synced" } },
    { label: "Synced", count: count("synced"), stage: "synced" },
  ];
  const due = count("due");
  const delivered = calls.filter((c) => isDelivered(c) && inStage("due", c, ctx, now)).length;
  return {
    crm,
    recording,
    due,
    reached: delivered,
    reachedShare: due ? Math.round((delivered / due) * 1000) / 10 : null,
    noLog: count("noLog"),
    skipped: count("skipped"),
    notRecorded: count("notRecorded"),
    mislabeled: count("mislabeled"),
  };
}

export async function loadClientHealth(cookie: string, clientId: string, days: WindowDays) {
  const started = Date.now();
  await loadSettings();
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
  const tenant = summarizeTenant(tenantBody, client.status);
  await Promise.all([saveLicenses(clientId, tenantBody.licenses), saveIntegrations(clientId, tenant.integrations)]);
  const now = Date.now();
  const since = now - days * DAY;
  const [[assessment], calls, events, logs, [snapshot], store, cover, suggestions, lastSyncs, integrationChanges] = await Promise.all([
    assess(now, clientId, { tenant, status: client.status, accessSuspended: client.accessSuspended }),
    readCalls({ clientId }, since),
    readCallouts(clientId, since),
    readLogs(clientId, since),
    readSnapshots(clientId),
    readStoreStatus(clientId),
    readCoverage(clientId),
    readSuggestions(),
    readLastSyncs(clientId),
    readIntegrationChanges(clientId, now - 30 * DAY),
  ]);
  if (!assessment) throw new PortalError(404, "Client not stored yet");
  await remember(assessment.issues);

  // Hourly buckets for one day, daily otherwise, split by HTTP class.
  const bucketMs = days === 1 ? HOUR : DAY;
  const bucketCount = Math.ceil((now - since) / bucketMs);
  const firstBucket = now - bucketCount * bucketMs;
  const trend = Array.from({ length: bucketCount }, (_, i) => ({ start: new Date(firstBucket + i * bucketMs).toISOString(), delivered: 0, rejected: 0, unreachable: 0, other: 0 }));
  for (const event of events) {
    const bucket = trend[Math.floor((Date.parse(event.at) - firstBucket) / bucketMs)];
    if (!bucket) continue;
    const cls = httpClass(event.httpStatus);
    if (event.status === "delivered") bucket.delivered++;
    else if (event.status !== "failed") continue;
    else if (cls === "4xx") bucket.rejected++;
    else if (cls === "5xx" || cls === "no response") bucket.unreachable++;
    else bucket.other++;
  }

  // Names are read live and never stored.
  const agents = Object.fromEntries(tenantBody.licenses.map((l: License) => [l.id, l.assignedTo?.name ?? null]));
  // Each integration with when it last reached its CRM, its last callout, and its changes.
  const integrations = tenant.integrations.map((i) => ({
    ...i,
    lastSyncAt: lastSyncs.platforms.get(`${clientId}|${i.platformId}`)?.syncAt ?? null,
    lastCalloutAt: lastSyncs.platforms.get(`${clientId}|${i.platformId}`)?.calloutAt ?? null,
    changes: integrationChanges.filter((c) => c.platformId === i.platformId),
  }));

  return {
    client,
    level: assessment.level,
    issues: assessment.issues,
    licenses: assessment.licenses,
    licenseTotals: licenseCounts(assessment.licenses),
    historyStart: assessment.licenses.map((h) => h.baselineSince).filter((t): t is string => !!t).sort()[0] ?? null,
    agents,
    tenant,
    oneApi,
    contacts: contacts?.stats ?? null,
    audit: audit?.items ?? [],
    lifetime: (snapshot?.aggregate ?? null) as Aggregate | null,
    pulse: assessment.pulse,
    seats: assessment.seats,
    integrations,
    integrationChanges,
    funnel: funnel(calls, assessment.ctx, now),
    callCount: calls.length,
    replies: summarizeReplies(events),
    suggestions: suggestions.filter((s) => s.scope === "client" ? s.scopeId === clientId : events.some((e) => e.platformId === s.scopeId)),
    sources: summarizeSources(logs),
    trend,
    trendHourly: days === 1,
    windowLabel: days === 1 ? "the last 24 hours" : `the last ${days} days`,
    since: new Date(since).toISOString(),
    coverage: coverage(cover, assessment.calls),
    pullErrors: [...new Set(pull.errors)],
    store,
    loadedAt: new Date(now).toISOString(),
    tookMs: Date.now() - started,
  };
}

// ---- Licenses ----

export type FleetLicense = LicenseHealth & { companyName: string };

// Every license fleet-wide with its status, from the store.
export async function loadFleetLicenses() {
  await loadSettings();
  const now = Date.now();
  const assessments = await assess(now, null);
  const licenses: FleetLicense[] = assessments.flatMap((a) => a.licenses.map((h) => ({ ...h, companyName: a.snapshot.companyName ?? a.snapshot.clientId })));
  return { licenses, loadedAt: new Date(now).toISOString() };
}

// ---- Seats ----

export type SeatRow = { license: LicenseHealth["license"]; seat: LicenseHealth["seat"]; lastCallAt: string | null; lastSyncAt: string | null; status: LicenseHealth["status"] };

// Every client's seats from the store, by use: purchased, active, assigned, logged in and calling, with
// each seat that isn't being used and since when (owner, 2026-11-05).
export async function loadSeats() {
  await loadSettings();
  const now = Date.now();
  const assessments = await assess(now, null);
  const clients = assessments
    .filter((a) => a.seats.active > 0 || (a.seats.purchased ?? 0) > 0)
    .map((a) => ({
      clientId: a.snapshot.clientId,
      companyName: a.snapshot.companyName ?? a.snapshot.clientId,
      status: a.snapshot.status ?? "unknown",
      seats: a.seats,
      rows: a.licenses.map((h): SeatRow => ({ license: h.license, seat: h.seat, lastCallAt: h.lastCallAt, lastSyncAt: h.pulse.lastSyncAt, status: h.status })),
    }));
  return { clients, unusedAfterMs: RULES.seatUnusedMs, loadedAt: new Date(now).toISOString() };
}

const LICENSE_FIELD_LABELS: Record<string, string> = {
  member_id: "Agent",
  status: "Assignment",
  is_active: "Active",
  is_logged_in: "Logged in",
  last_login_label: "Last login",
  device_brand: "Device brand",
  device_model: "Device model",
  firmware: "Firmware",
  app_version: "App version",
  recording_enabled: "Recording",
  call_policy: "Call capture policy",
};

// One license: its status and issues, its calls against its 7-day baseline, and its change history.
// The agent's name is read live when a CallAnchor session is available.
export async function loadLicense(licenseId: string, cookie: string | null) {
  await loadSettings();
  const now = Date.now();
  const stored = await readLicense(licenseId);
  if (!stored) return null;
  const [[assessment], calls, changes, tenant] = await Promise.all([
    assess(now, stored.clientId),
    readCalls({ licenseId }, now - ASSESS_DAYS * DAY),
    readLicenseChanges({ licenseId }, now - SYNC.retainDays * DAY),
    cookie ? optional(getJson<Tenant>(cookie, `/api/clients/${stored.clientId}/tenant`)) : Promise.resolve(null),
  ]);
  const health = assessment?.licenses.find((h) => h.license.licenseId === licenseId) ?? null;
  const ctx = assessment?.ctx ?? clientContext(null);
  const day = calls.filter((c) => within(c, now, DAY));
  // Calls per hour today against the average for that hour over the previous 7 days.
  const hourly = Array.from({ length: 24 }, (_, i) => ({ start: new Date(now - (24 - i) * HOUR).toISOString(), calls: 0, baseline: 0 }));
  for (const c of calls) {
    const age = now - Date.parse(callTime(c)!);
    const slot = 23 - (Math.floor(age / HOUR) % 24);
    if (age <= DAY) hourly[slot].calls++;
    else hourly[slot].baseline += 1 / 7;
  }
  const live = tenant?.licenses.find((l) => l.id === licenseId);
  return {
    license: stored,
    companyName: assessment?.snapshot.companyName ?? stored.clientId,
    agent: live?.assignedTo?.name ?? null,
    health,
    funnel: funnel(day, ctx, now),
    hourly,
    calls: day.length,
    // Agents' names aren't stored, so a reassignment names only the current agent, read live (QA L10).
    changes: changes.map((c, i) => ({
      ...c,
      label: LICENSE_FIELD_LABELS[c.field] ?? c.field,
      ...(c.field === "member_id"
        ? {
            oldValue: c.oldValue ? "an earlier agent" : "nobody",
            newValue: !c.newValue ? "nobody" : i === changes.findIndex((x) => x.field === "member_id") && live?.assignedTo?.name ? live.assignedTo.name : "a different agent",
          }
        : {}),
    })),
    loadedAt: new Date(now).toISOString(),
  };
}

// ---- One issue ----

export const ISSUE_ID = /^[a-z_0-9]{1,60}\.[\w-]{1,100}$/;

// What to check, by kind of issue. Kinds not listed get the generic line.
const CHECKLISTS: Record<string, string[]> = {
  crm_auth: ["Reconnect the integration or refresh its token", "Check the CRM user is active and has API access", "Open one call's CRM request to see the exact rejection"],
  crm_rejecting_all: ["Open one failed call's CRM request and read the reply", "Ask the client whether their webhook or CRM changed today", "Retries won't fix a 4xx: the data or webhook must change"],
  crm_rejecting: ["Group the failures by reply sample to find the commonest cause", "Check whether one license or agent dominates", "Fix the data or the webhook; retries won't help a 4xx"],
  crm_unreachable: ["Check the webhook URL is reachable from outside", "Ask the client whether their server or CRM was down", "Look for 5xx replies with an error page"],
  callout_missing: ["Check the integration is active and subscribed to call.completed", "Compare with CallAnchor's portal for one affected call", "Raise with CallAnchor if the integration looks right"],
  trial_skipped: ["Raise the trial's recording limit or convert the client", "Tell the client recordings are paused"],
  recordings_stuck: ["Open a call to see where the upload stopped", "Check the phone's network and storage", "Raise upload-failed lines with CallAnchor"],
  recordings_waiting: ["Check whether the phones are online", "Check background data and battery restrictions on the phones"],
  recordings_unsynced: ["Check the integration takes recording.ready or call.completed", "Open a call to see whether a callout was sent", "If none was sent after upload, it may be the upload race (open question 11)"],
  client_quiet: ["Check whether the client is calling today in CallAnchor's portal", "Check the data coverage line: our pull may be behind", "Ask whether the team is on leave"],
  late_sync: ["Open the slowest calls to see which step was slow", "Late recordings usually mean the phone was offline"],
  reply_format: ["Ask the client whether their webhook code changed", "Compare old and new reply samples"],
  license_not_recording: ["Check the phone's recording permission and dialer", "Compare with another phone of the same model", "Check the app version"],
  license_stuck_on_phone: ["Check whether the phone is online", "Check battery optimisation and background data for the app", "Check free storage on the phone"],
  license_not_capturing: ["Check the agent is logged in and using the phone", "Check call capture settings and the default dialer"],
  license_never_called: ["Check the phone's default dialer and call capture policy", "Confirm the agent actually uses this number"],
  license_crm_rejects: ["Check the agent's user mapping in the CRM", "Open a failed call and compare its payload with a successful one"],
  license_no_sync: ["Open one of the phone's calls and read the CRM's reply", "Check the agent's user mapping in the CRM", "Compare its payload with a call from another phone that synced"],
  license_no_calls: ["Ask whether the agent is working on this phone", "Check the phone's default dialer and call capture policy"],
  crm_inconsistent: ["Open the day strip's bad days to see which calls failed", "Check whether failures follow one phone or one integration"],
  crm_below_usual: ["Open the calls that didn't reach the CRM", "Check whether one phone or integration explains the drop"],
  crm_duplicates: ["Open a call to see the repeated 2xx replies", "Check the CRM for duplicate records", "Ask the client to return a record id in the reply, so CallAnchor stops retrying"],
  integration_off: ["Ask the client whether switching it off was intended", "If not, switch it back on in CallAnchor"],
  account_no_integration: ["Ask whether the client expects calls in a CRM", "Set up the integration in CallAnchor"],
  platform_stall: ["Check the data coverage line: our pull may be behind", "Check CallAnchor's own portal for today's calls", "Raise with CallAnchor if their portal shows no calls either"],
};
const CHECKLIST_PREFIXES: [string, string[]][] = [
  ["integration_failing_", ["Open the failed syncs for this integration", "Compare with the integration that succeeds for the same calls", "Check the integration's endpoint and credentials"]],
  ["account_health_check_", ["Run the integration's health check in CallAnchor", "Reconnect the integration if it fails"]],
];
export const checklistFor = (kind: string) =>
  CHECKLISTS[kind] ?? CHECKLIST_PREFIXES.find(([prefix]) => kind.startsWith(prefix))?.[1] ?? ["Open the affected items and compare them with a healthy one"];

export async function loadIssue(issueId: string) {
  await loadSettings();
  const now = Date.now();
  const [kind, scopeId] = issueId.split(".");
  const license = kind.startsWith("license_") ? await readLicense(scopeId) : null;
  const clientId = scopeId === "fleet" ? null : (license?.clientId ?? scopeId);
  const stall = kind === "platform_stall";
  const [assessments, logs, state, suggestions] = await Promise.all([
    clientId || stall ? assess(now, clientId) : Promise.resolve([] as Assessment[]),
    clientId || stall ? Promise.resolve([] as StoredLog[]) : readLogs(null, now - DAY),
    readIssueState(issueId),
    readSuggestions(),
  ]);
  const assessment = clientId ? (assessments[0] ?? null) : null;
  const fleetIssues = () => {
    if (!stall) return platformIssues(logs, now);
    const busy = assessments.filter((a) => a.snapshot.status !== "inactive" && a.pulse.days.slice(-8, -1).reduce((sum, d) => sum + d.calls, 0) / 7 >= RULES.quietMinDailyCalls).length;
    const found = fleetStall(assessments.flatMap((a) => a.issues.filter((i) => i.kind === "client_quiet")), busy, now);
    return found ? [found] : [];
  };
  // Rolled-up license issues are still on their license, so look there too.
  const issue = (clientId ? [...(assessment?.issues ?? []), ...(assessment?.licenses.flatMap((h) => h.issues) ?? [])] : fleetIssues()).find((i) => i.id === issueId) ?? null;
  if (issue && state && state.firstSeenAt < (issue.firstAt ?? "~")) issue.firstAt = state.firstSeenAt;
  const matching = (suggestions as ReplySuggestion[]).filter(
    (s) =>
      (s.scope === "client" ? s.scopeId === clientId : true) &&
      (issue?.samples ?? []).some((sample) => sample.toLowerCase().includes(s.pattern.toLowerCase())),
  );
  return {
    issue,
    state,
    clientId,
    companyName: assessment?.snapshot.companyName ?? clientId,
    license,
    checklist: checklistFor(kind),
    suggestions: matching,
    loadedAt: new Date(now).toISOString(),
  };
}

// ---- Calls behind an issue or funnel step ----

export const ITEMS_PER_PAGE = 100;

// `licenseIds` narrows to several phones, for an issue shared by some of a client's phones.
export async function loadCallItems(scope: { clientId?: string; licenseId?: string; licenseIds?: string[] }, stage: CallStage, days: WindowDays, page: number) {
  await loadSettings();
  const now = Date.now();
  const [calls, snapshots, licenses] = await Promise.all([
    readCalls({ clientId: scope.clientId, licenseId: scope.licenseId }, now - days * DAY),
    readSnapshots(scope.clientId),
    readLicenses(scope.clientId),
  ]);
  const contexts = new Map(snapshots.map((s) => [s.clientId, clientContext(s.tenant)]));
  const last4 = new Map(licenses.map((l) => [l.licenseId, l.last4]));
  const none = clientContext(null);
  const phones = scope.licenseIds?.length ? new Set(scope.licenseIds) : null;
  const matching = calls.filter((c) => (!phones || phones.has(c.licenseId ?? "")) && inStage(stage, c, contexts.get(c.clientId ?? "") ?? none, now));
  const items = matching.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((c) => ({
    ...c,
    problem: callProblem(c, contexts.get(c.clientId ?? "") ?? none, now),
    last4: c.licenseId ? (last4.get(c.licenseId) ?? null) : null,
  }));
  return { items, total: matching.length, title: stageTitle(stage), last4: Object.fromEntries(last4), loadedAt: new Date(now).toISOString() };
}

// ---- One call ----

export type AnchorResult = { requestId: string; log: AnchorLog | null; error: string | null };

const REQUEST_ID = /^[\w-]{1,100}$/;

export type JourneyStep = { label: string; at: string | null; state: "done" | "failed" | "missing" | "skipped" | "pending" };

// Ingested → Uploaded → Verified → Sent → Accepted, with what was expected at each step. A call with no
// integration to send it to shows Sent and Accepted as not expected, not "not yet" forever (QA N7).
function journey(call: StoredCall | null, callouts: StoredCallout[], ctx: ClientContext): JourneyStep[] {
  const recorded = call ? isRecorded(call) : false;
  const expected = ctx.takesAny || callouts.length > 0;
  const firstSent = callouts[0]?.at ?? null;
  const accepted = callouts.find((e) => e.status === "delivered")?.at ?? null;
  const failed = callouts.length > 0 && !accepted && callouts[callouts.length - 1].status === "failed";
  const recordingStep = (at: string | null | undefined, failedAt?: string | null): JourneyStep["state"] =>
    !recorded ? "skipped" : at ? "done" : failedAt ? "failed" : "pending";
  return [
    { label: "Ingested", at: call?.ingestedAt ?? null, state: call?.ingestedAt ? "done" : "missing" },
    { label: "Uploaded", at: call?.uploadedAt ?? call?.uploadFailedAt ?? null, state: recordingStep(call?.uploadedAt, call?.uploadFailedAt) },
    { label: "Verified", at: call?.verifiedAt ?? null, state: recordingStep(call?.verifiedAt) },
    { label: "Sent", at: firstSent, state: firstSent ? "done" : expected ? "pending" : "skipped" },
    { label: "Accepted", at: accepted, state: accepted ? "done" : failed ? "failed" : expected ? "pending" : "skipped" },
  ];
}

// One call's stored history, where it stands, and, with a CallAnchor cookie, each CRM request read
// live: the payload sent and every reply. Payloads aren't stored.
export async function loadCall(callId: string, cookie: string | null) {
  await loadSettings();
  const now = Date.now();
  const [{ callouts, logs }, call] = await Promise.all([readCall(callId), readStoredCall(callId)]);
  const clientId = call?.clientId ?? logs.find((l) => l.clientId)?.clientId ?? callouts[0]?.clientId ?? null;
  const [[snapshot], license] = await Promise.all([clientId ? readSnapshots(clientId) : Promise.resolve([]), call?.licenseId ? readLicense(call.licenseId) : Promise.resolve(null)]);
  const ctx = clientContext(snapshot?.tenant ?? null);
  const requestIds = [...new Set(callouts.map((e) => e.requestId).filter((id): id is string => !!id && REQUEST_ID.test(id)))];
  const requests: AnchorResult[] =
    cookie && clientId
      ? await Promise.all(
          requestIds.map((requestId) =>
            getJson<AnchorLog>(cookie, `/api/clients/${clientId}/anchor-logs/${requestId}`).then(
              (log) => ({ requestId, log, error: null }),
              (error: unknown) => ({ requestId, log: null, error: error instanceof PortalError ? `HTTP ${error.status}` : "no response" }),
            ),
          ),
        )
      : [];
  return {
    clientId,
    companyName: snapshot?.companyName ?? clientId,
    takesRecordings: snapshot?.tenant ? ctx.takesRecordings : null,
    call,
    license,
    journey: journey(call, callouts, ctx),
    hasIntegration: snapshot?.tenant ? ctx.hasIntegration : null,
    callouts,
    logs,
    problem: call ? callProblem(call, ctx, now) : null,
    requests,
    missingRequestIds: callouts.filter((e) => !e.requestId).length,
    loadedAt: new Date(now).toISOString(),
  };
}
