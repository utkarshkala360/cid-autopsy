import "server-only";
import { httpClass } from "@/lib/callanchor/labels";
import {
  applySettings,
  byIssue,
  callProblem,
  CALL_STAGES,
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
  lastCompleteOf,
  journeySummary,
  JOURNEY_STEPS,
  journeyStop,
  isComplete,
  type JourneySummary,
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
  readAudit,
  readCall,
  readCallouts,
  readCalls,
  readCoverage,
  readDaily,
  readHealthSettings,
  readIntegrationChanges,
  readInternalClients,
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

export const WINDOW_DAYS = [1, 3, 7, 15] as const;
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

// ---- Internal clients ----

// Clients marked internal, and which of them to hide: all of them unless "Show internal" is ticked.
export type InternalScope = { internal: Set<string>; hidden: Set<string> };
async function internalScope(show: boolean): Promise<InternalScope> {
  const internal = await readInternalClients();
  return { internal, hidden: show ? new Set() : internal };
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
      const pulseOf = pulse({ rows: rowsByClient.get(clientId) ?? [], calls24h: day, pool: [...calls, ...clientOpen], ctx, now, lastSyncAt: last?.syncAt ?? null, lastCallAt: last?.callAt ?? null, lastComplete: lastCompleteOf(last) });
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
  lastComplete: Pulse["lastComplete"];
  // Where the last 24 hours' calls stopped, by journey step.
  journey: JourneySummary;
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

export async function loadFleetHealth(cookie: string, memberId: string, showInternal = false) {
  const started = Date.now();
  await loadSettings();
  const pull = await pullFleet(cookie);
  const now = Date.now();
  const [everyClient, everyLog, store, cover, lastVisit, scope] = await Promise.all([
    assess(now, null),
    readLogs(null, now - DAY),
    readStoreStatus(null),
    readCoverage(null),
    markVisit(memberId, "fleet"),
    internalScope(showInternal),
  ]);
  const assessments = everyClient.filter((a) => !scope.hidden.has(a.snapshot.clientId));
  const logs = everyLog.filter((l) => !l.clientId || !scope.hidden.has(l.clientId));
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
      lastComplete: p.lastComplete,
      journey: p.journey,
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
    internal: [...scope.internal],
    hiddenInternal: everyClient.length - assessments.length,
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
  const [[assessment], calls, events, logs, [snapshot], store, cover, suggestions, lastSyncs, integrationChanges, internal] = await Promise.all([
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
    readInternalClients(),
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
    internal: internal.has(clientId),
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
    journey: journeySummary(calls, assessment.ctx, now),
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
export async function loadFleetLicenses(showInternal = false) {
  await loadSettings();
  const now = Date.now();
  const [everyClient, scope] = await Promise.all([assess(now, null), internalScope(showInternal)]);
  const assessments = everyClient.filter((a) => !scope.hidden.has(a.snapshot.clientId));
  const licenses: FleetLicense[] = assessments.flatMap((a) => a.licenses.map((h) => ({ ...h, companyName: a.snapshot.companyName ?? a.snapshot.clientId })));
  return { licenses, hiddenInternal: everyClient.length - assessments.length, loadedAt: new Date(now).toISOString() };
}

// ---- Overview: clients, their phones and their seats side by side ----

export type OverviewRow = {
  clientId: string;
  companyName: string;
  status: string;
  level: Level;
  openIssues: number;
  criticalIssues: number;
  calls24h: number;
  lastComplete: Pulse["lastComplete"];
  licenses: ReturnType<typeof licenseCounts>;
  seats: Seats;
};

// Every client with its health, phones and seats in one row, from the store, so the three views can be
// read together and each opens the other two (owner, 2026-11-13).
export async function loadOverview(showInternal = false) {
  await loadSettings();
  const now = Date.now();
  const [everyClient, scope] = await Promise.all([assess(now, null), internalScope(showInternal)]);
  const assessments = everyClient.filter((a) => !scope.hidden.has(a.snapshot.clientId));
  const rows: OverviewRow[] = assessments
    .map((a) => {
      const open = a.issues.filter((i) => i.level !== "info");
      return {
        clientId: a.snapshot.clientId,
        companyName: a.snapshot.companyName ?? a.snapshot.clientId,
        status: a.snapshot.status ?? "unknown",
        level: a.level,
        openIssues: open.length,
        criticalIssues: open.filter((i) => i.level === "critical").length,
        calls24h: a.calls.length,
        lastComplete: a.pulse.lastComplete,
        licenses: licenseCounts(a.licenses),
        seats: a.seats,
      };
    })
    .sort((a, b) => byLevel(a.level, b.level) || b.criticalIssues - a.criticalIssues || b.openIssues - a.openIssues || a.companyName.localeCompare(b.companyName));
  return { rows, hiddenInternal: everyClient.length - assessments.length, loadedAt: new Date(now).toISOString() };
}

// The numbers in a client's header, on every page under it: health, calls, CRM reach, licenses and
// seats, from the store. Null before the client's first pull.
export async function loadClientSummary(clientId: string) {
  await loadSettings();
  const now = Date.now();
  const [a] = await assess(now, clientId);
  if (!a) return null;
  const open = a.issues.filter((i) => i.level !== "info");
  return {
    level: a.level,
    calls24h: a.calls.length,
    reached: a.pulse.reached,
    lastComplete: a.pulse.lastComplete,
    lastSyncAt: a.pulse.lastSyncAt,
    openIssues: open.length,
    criticalIssues: open.filter((i) => i.level === "critical").length,
    licenses: licenseCounts(a.licenses),
    seats: a.seats,
    hasIntegration: a.ctx.hasIntegration,
    loadedAt: new Date(now).toISOString(),
  };
}

// ---- Seats ----

export type SeatRow = { license: LicenseHealth["license"]; seat: LicenseHealth["seat"]; lastCallAt: string | null; lastSyncAt: string | null; status: LicenseHealth["status"] };

// Every client's seats from the store, by use: purchased, active, assigned, logged in and calling, with
// each seat that isn't being used and since when (owner, 2026-11-05).
export async function loadSeats(showInternal = false) {
  await loadSettings();
  const now = Date.now();
  const [everyClient, scope] = await Promise.all([assess(now, null), internalScope(showInternal)]);
  const assessments = everyClient.filter((a) => !scope.hidden.has(a.snapshot.clientId));
  const clients = assessments
    .filter((a) => a.seats.active > 0 || (a.seats.purchased ?? 0) > 0)
    .map((a) => ({
      clientId: a.snapshot.clientId,
      companyName: a.snapshot.companyName ?? a.snapshot.clientId,
      status: a.snapshot.status ?? "unknown",
      seats: a.seats,
      rows: a.licenses.map((h): SeatRow => ({ license: h.license, seat: h.seat, lastCallAt: h.lastCallAt, lastSyncAt: h.pulse.lastSyncAt, status: h.status })),
    }));
  return { clients, hiddenInternal: everyClient.length - assessments.length, unusedAfterMs: RULES.seatUnusedMs, loadedAt: new Date(now).toISOString() };
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
  const [[assessment], calls, changes, tenant, portal] = await Promise.all([
    assess(now, stored.clientId),
    readCalls({ licenseId }, now - ASSESS_DAYS * DAY),
    readLicenseChanges({ licenseId }, now - SYNC.snapshotDays * DAY),
    cookie ? optional(getJson<Tenant>(cookie, `/api/clients/${stored.clientId}/tenant`)) : Promise.resolve(null),
    readAudit({ licenseId }, now - SYNC.snapshotDays * DAY),
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
    journey: journeySummary(day, ctx, now),
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
    // Portal events naming this license: settings changes, activation, mobile logins and logouts.
    portal,
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
  license_stuck_on_phone: ["Open the calls: \"Phone couldn't save the recording\" means check microphone permission and that call recording is on in the default dialer", "Check whether the phone is online", "Check battery optimisation and background data for the app", "Check free storage on the phone"],
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
// Across all clients, internal ones are left out unless `showInternal`; a client or phone asked for
// by id is always shown.
export async function loadCallItems(
  scope: { clientId?: string; licenseId?: string; licenseIds?: string[]; showInternal?: boolean },
  stage: CallStage,
  days: WindowDays,
  page: number,
) {
  await loadSettings();
  const now = Date.now();
  const narrowed = Boolean(scope.clientId || scope.licenseId);
  const [calls, snapshots, licenses, internal] = await Promise.all([
    readCalls({ clientId: scope.clientId, licenseId: scope.licenseId }, now - days * DAY),
    readSnapshots(scope.clientId),
    readLicenses(scope.clientId),
    internalScope(narrowed || Boolean(scope.showInternal)),
  ]);
  const contexts = new Map(snapshots.map((s) => [s.clientId, clientContext(s.tenant)]));
  const last4 = new Map(licenses.map((l) => [l.licenseId, l.last4]));
  const none = clientContext(null);
  const phones = scope.licenseIds?.length ? new Set(scope.licenseIds) : null;
  const scoped = calls.filter((c) => !internal.hidden.has(c.clientId ?? "") && (!phones || phones.has(c.licenseId ?? "")));
  const matching = scoped.filter((c) => inStage(stage, c, contexts.get(c.clientId ?? "") ?? none, now));
  // Every stage's count in the same scope and window, for the filter panel; the same tests as the rows.
  const counts = Object.fromEntries((Object.keys(CALL_STAGES) as CallStage[]).map((s) => [s, 0])) as Record<CallStage, number>;
  for (const c of scoped) {
    const ctx = contexts.get(c.clientId ?? "") ?? none;
    for (const s of Object.keys(counts) as CallStage[]) if (inStage(s, c, ctx, now)) counts[s]++;
  }
  const items = matching.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((c) => ({
    ...c,
    problem: callProblem(c, contexts.get(c.clientId ?? "") ?? none, now),
    last4: c.licenseId ? (last4.get(c.licenseId) ?? null) : null,
  }));
  return { items, total: matching.length, counts, title: stageTitle(stage), last4: Object.fromEntries(last4), loadedAt: new Date(now).toISOString() };
}

// ---- One call ----

export type AnchorResult = { requestId: string; log: AnchorLog | null; error: string | null };

const REQUEST_ID = /^[\w-]{1,100}$/;

// A reference id along the journey: what it is, its value, and where it opens, if anywhere.
export type JourneyId = { label: string; value: string | null; href?: string; note?: string };
export type JourneyStep = {
  key: (typeof JOURNEY_STEPS)[number]["key"];
  label: string;
  at: string | null;
  // done; stopped (broke here); waiting (inside its grace); skipped (not needed for this call);
  // unknown (we hold no record of the step).
  state: "done" | "stopped" | "waiting" | "skipped" | "unknown";
  // One plain sentence on what happened at this step.
  note: string;
  ids: JourneyId[];
};

const metaOf = (log: StoredLog | undefined) => (log?.raw?.metadata && typeof log.raw.metadata === "object" ? (log.raw.metadata as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null);

// Phone → app → recording uploaded → sent to the CRM → accepted, in plain words, with every id that
// links the step to the next: the phone (license), CallAnchor's call record, the upload session and
// recording file, the CRM request and the CRM's own record id.
function journey(call: StoredCall | null, callouts: StoredCallout[], logs: StoredLog[], requests: AnchorResult[], ctx: ClientContext, now: number, license: { licenseId: string; last4: string | null } | null): JourneyStep[] {
  const by = (source: string) => logs.find((l) => l.source === source);
  const ingest = by("mobile.call.create");
  const upload = by("mobile.recording.upload-complete") ?? by("mobile.recording.upload-init") ?? by("mobile.recording.upload-failed");
  const job = by("mobile.recording.job-processed") ?? by("mobile.recording.job-failed");
  const sync = logs.find((l) => l.source === "custom-webhook-sync" && metaOf(l).integrationId);
  const stop = call ? journeyStop(call, ctx, now) : null;
  const problem = call ? callProblem(call, ctx, now) : null;
  const recorded = call ? isRecorded(call) : false;
  const expected = ctx.takesAny || callouts.length > 0;
  const accepted = callouts.find((e) => e.status === "delivered") ?? null;
  const lastCallout = callouts.at(-1) ?? null;
  const attempts = requests.flatMap((r) => r.log?.events ?? []);
  const crmRecords = [...new Set(attempts.map((a) => a.externalRecordId).filter((id): id is string => !!id))];
  const requestIds = [...new Set(callouts.map((e) => e.requestId).filter((id): id is string => !!id))];
  const platforms = [...new Set(callouts.map((e) => e.platformId))];
  const length = call?.callSeconds;

  const phone: JourneyStep = {
    key: "phone",
    label: "Call made on the phone",
    at: call?.startedAt ?? call?.ingestedAt ?? null,
    state: call ? "done" : "unknown",
    note: call
      ? [
          call.callType ? `${call.callType[0].toUpperCase()}${call.callType.slice(1)} call` : "A call",
          length === null || length === undefined ? null : length === 0 ? "that didn't connect" : `of ${length} s`,
          license?.last4 ? `on phone …${license.last4}` : call.agentLast4 ? `by agent number …${call.agentLast4}` : null,
        ].filter(Boolean).join(" ") + "."
      : "No record of this call is stored.",
    ids: [
      { label: "Phone (license)", value: license?.licenseId ?? null, href: license ? licensePath(license.licenseId) : undefined, note: license ? undefined : "phone not known" },
      { label: "Phone's own call id", value: text(metaOf(ingest).externalCallId), note: "the app doesn't send it yet" },
    ],
  };

  const app: JourneyStep = {
    key: "app",
    label: "Picked up by the app",
    at: call?.ingestedAt ?? null,
    state: call?.ingestedAt ? "done" : "unknown",
    note: call?.ingestedAt
      ? "The CallAnchor app sent the call to CallAnchor."
      : "Not in our stored logs. CallAnchor keeps them about 3 days, so this call came in before we stored it, or the log was missed.",
    ids: [
      { label: "CallAnchor call id", value: call?.callId ?? callouts[0]?.callId ?? null },
      { label: "Ingest log", value: ingest?.id ?? null },
    ],
  };

  const uploadIds: JourneyId[] = [
    { label: "Upload session", value: text(metaOf(upload).uploadSessionId) },
    { label: "Recording file", value: text(metaOf(upload).s3Key) },
    { label: "Processing job", value: text(metaOf(job).jobId) },
  ];
  const uploadStep: JourneyStep = (() => {
    const base = { key: "upload" as const, label: "Recording uploaded", ids: uploadIds };
    if (!call) return { ...base, at: null, state: "unknown" as const, note: "Not known." };
    if (stop === "upload") return { ...base, at: call.uploadFailedAt ?? call.unavailableAt ?? call.uploadStartedAt ?? null, state: "stopped" as const, note: `${problem ?? "The recording didn't arrive"}.` };
    if (isVerified(call)) return { ...base, at: call.verifiedAt ?? call.uploadedAt ?? null, state: "done" as const, note: "The recording reached CallAnchor and was checked." };
    if (recorded) return { ...base, at: call.uploadedAt ?? call.uploadStartedAt ?? null, state: "waiting" as const, note: call.uploadedAt ? "Uploaded, being checked." : "Waiting for the phone to upload it." };
    if (call.recordingDetail === "skipped_trial_limit") return { ...base, at: null, state: "skipped" as const, note: "Not recorded: the trial's recording limit was reached." };
    if (inStage("notConnected", call, ctx, now)) return { ...base, at: null, state: "skipped" as const, note: "The call didn't connect, so there was nothing to record." };
    return { ...base, at: null, state: "skipped" as const, note: "No recording was made on the phone for this call." };
  })();

  const sent: JourneyStep = {
    key: "sent",
    label: "Sent to the CRM",
    at: callouts[0]?.at ?? null,
    state: callouts.length ? "done" : stop === "sent" ? "stopped" : !expected ? "skipped" : "waiting",
    note: callouts.length
      ? `Sent to ${platforms.join(", ")}${callouts.length > 1 ? `, ${callouts.length} attempts` : ""}.`
      : stop === "sent"
        ? "CallAnchor never sent it to the CRM."
        : !expected
          ? "This client has no CRM integration, so nothing is sent."
          : stop === "upload"
            ? "Waits for the recording."
            : "Not sent yet.",
    ids: [
      ...requestIds.map((id, i) => ({ label: requestIds.length > 1 ? `CRM request ${i + 1}` : "CRM request", value: id, href: `#request-${id}` })),
      ...(requestIds.length ? [] : [{ label: "CRM request", value: null }]),
      { label: "Integration", value: text(metaOf(sync).integrationId) ?? platforms[0] ?? null },
    ],
  };

  const recordingSent = call?.deliveredEvents.includes("recording.ready") ?? false;
  const crm: JourneyStep = {
    key: "crm",
    label: "Accepted by the CRM",
    at: accepted?.at ?? null,
    state: accepted ? "done" : stop === "crm" ? "stopped" : !expected ? "skipped" : "waiting",
    note: accepted
      ? recordingSent
        ? "The CRM accepted the call with its recording."
        : recorded
          ? "The CRM accepted the call details; the recording hasn't reached it yet."
          : "The CRM accepted the call."
      : stop === "crm"
        ? `The CRM refused it${lastCallout?.httpStatus ? ` (HTTP ${lastCallout.httpStatus})` : lastCallout ? " (no response)" : ""}${lastCallout?.label ? `: ${lastCallout.label}` : ""}.`
        : !expected
          ? "No CRM to accept it."
          : "Not accepted yet.",
    ids: [
      ...crmRecords.map((id) => ({ label: "CRM record", value: id })),
      ...(crmRecords.length ? [] : [{ label: "CRM record", value: null, note: requests.length ? "the CRM didn't return one" : "read live when CallAnchor is connected" }]),
    ],
  };
  return [phone, app, uploadStep, sent, crm];
}

const licensePath = (licenseId: string) => `/dashboard/call_anchor/health/licenses/${encodeURIComponent(licenseId)}`;

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
    journey: journey(call, callouts, logs, requests, ctx, now, license ? { licenseId: license.licenseId, last4: license.last4 } : null),
    complete: call ? isComplete(call, ctx) : false,
    stop: call ? journeyStop(call, ctx, now) : null,
    hasIntegration: snapshot?.tenant ? ctx.hasIntegration : null,
    callouts,
    logs,
    problem: call ? callProblem(call, ctx, now) : null,
    requests,
    missingRequestIds: callouts.filter((e) => !e.requestId).length,
    loadedAt: new Date(now).toISOString(),
  };
}
