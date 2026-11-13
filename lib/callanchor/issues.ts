import "server-only";
import { isAuthFailure } from "@/lib/callanchor/labels";
export { MODULES, issueModule, type IssueModule } from "@/lib/callanchor/modules";
import type {
  DayRow,
  LastSync,
  IntegrationChange,
  LicenseChange,
  OneApiStatus,
  StoredCall,
  StoredCallout,
  StoredLicense,
  StoredLog,
  TenantSummary,
} from "@/lib/callanchor/store";

// Turns stored calls, licenses and snapshots into issues: one problem of one kind, for one license,
// one client or the fleet. Severity comes only from CallAnchor and HTTP signals; CRM reply text is
// evidence (owner, 2026-11-04). Rules are from docs/client-health-plan.md, sections 5 and 6, as
// revised by docs/client-health-qa.md.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Starting values. Those in SETTINGS can be changed on the health Settings tab and are applied with
// applySettings before each load; PORTAL_SOP.md records what the owner agreed.
export const RULES = {
  // A step younger than its grace may still be on its way. The phone's upload can wait for a network;
  // steps on CallAnchor's servers take seconds (verify: 9 s at p90 on 5 Nov), so they get far less.
  phoneGraceMs: 30 * MINUTE,
  serverGraceMs: 5 * MINUTE,
  lateSyncMs: 15 * MINUTE,
  criticalSuccessRate: 80,
  warningSuccessRate: 95,
  minCallsForRate: 5,
  // A failure rate alone is Critical only with at least this many failed calls; with fewer it's a
  // Warning, never dropped, so no small client is left out (owner, 2026-11-13).
  criticalMinFailures: 5,
  rejectAllWindowMs: 2 * HOUR,
  rejectAllMinCalls: 5,
  unreachableRun: 3,
  criticalMissing: 3,
  criticalStuck: 3,
  lateWarningCalls: 5,
  // Recordings and calls that never reached the CRM stay flagged this far back, not only for 24
  // hours. It matches the items page's longest window, so a count and its rows agree.
  openLookbackDays: 15, // calls are kept 15 days (owner, 2026-11-13)
  duplicateDays: 7,
  // Time is plain elapsed time, judged day by day: no working-hours filter (owner, 2026-11-05).
  // A client is quiet when it usually calls but nothing arrived for this long.
  quietMs: DAY,
  quietMinDailyCalls: 5,
  // A day counts as synced when at least this share of its due calls reached the CRM.
  syncedDayRate: 80,
  // Synced days out of active days below this, over the last 7 days, is inconsistent.
  consistencyMin: 0.8,
  consistencyMinDays: 3,
  // A fall this many points below the last 7 days' sync rate is flagged, whatever the fixed lines say.
  baselineDropPoints: 15,
  // Licenses
  baselineDays: 7,
  // A phone's usual calls a day, judged against the longest of these windows it has fully seen: its
  // first full day, then 3 days, then 7 (owner, 2026-11-13: no week-long wait). Ascending.
  baselineWindows: [1, 3, 7],
  licenseMinDailyCalls: 3,
  // A phone that usually makes licenseMinDailyCalls a day and has gone silent this long.
  licenseQuietMs: DAY,
  licenseQuietCriticalMs: 2 * DAY,
  // A logged-in phone that has called before but not for this long, whatever its usual volume.
  noCallWarningMs: 3 * DAY,
  // A seat counts as unused on the Seats tab after this long without a call (or logged out, or unassigned).
  seatUnusedMs: DAY,
  // A phone whose calls stopped reaching the CRM while the client's other phones still sync.
  noSyncMinCalls: 3,
  noSyncWarningMs: 2 * HOUR,
  noSyncCriticalMs: 12 * HOUR,
  notRecordingMinCalls: 5,
  rejectGapPoints: 30,
  churnChanges: 4,
  // A license problem shared by this many licenses (and most of the client's) is one client issue.
  rollupMinLicenses: 3,
  rollupShare: 0.5,
  trialWarningDays: 3,
  staleHealthCheckHours: 48,
  trendRecentMs: 3 * HOUR,
  trendBeforeMs: 24 * HOUR,
  // Most busy clients going quiet at once is one CallAnchor problem, not many client ones.
  stallMinClients: 3,
  stallShare: 0.5,
};

const DEFAULT_RULES = { ...RULES };

// The thresholds the owner can change, in the unit the Settings tab shows. `rule` is the RULES key.
export const SETTINGS = [
  { key: "noSyncWarningHours", rule: "noSyncWarningMs", unit: HOUR, label: "Phone not syncing: warning after", suffix: "hours", min: 0.5, max: 168, group: "Phones" },
  { key: "noSyncCriticalHours", rule: "noSyncCriticalMs", unit: HOUR, label: "Phone not syncing: critical after", suffix: "hours", min: 1, max: 336, group: "Phones" },
  { key: "phoneSilentDays", rule: "licenseQuietMs", unit: DAY, label: "Busy phone silent: warning after", suffix: "days", min: 0.25, max: 30, group: "Phones" },
  { key: "phoneSilentCriticalDays", rule: "licenseQuietCriticalMs", unit: DAY, label: "Busy phone silent: critical after", suffix: "days", min: 0.5, max: 60, group: "Phones" },
  { key: "noCallDays", rule: "noCallWarningMs", unit: DAY, label: "Any logged-in phone with no call: warning after", suffix: "days", min: 0.5, max: 60, group: "Phones" },
  { key: "seatUnusedDays", rule: "seatUnusedMs", unit: DAY, label: "Seat counts as unused after", suffix: "days", min: 0.25, max: 60, group: "Seats" },
  { key: "quietDays", rule: "quietMs", unit: DAY, label: "Busy client with no calls: warning after", suffix: "days", min: 0.25, max: 30, group: "Clients" },
  { key: "warningSuccessRate", rule: "warningSuccessRate", unit: 1, label: "CRM success: warning below", suffix: "%", min: 1, max: 100, group: "CRM" },
  { key: "criticalSuccessRate", rule: "criticalSuccessRate", unit: 1, label: "CRM success: critical below", suffix: "%", min: 1, max: 100, group: "CRM" },
  { key: "criticalMinFailures", rule: "criticalMinFailures", unit: 1, label: "Critical needs at least", suffix: "failed calls (fewer: warning)", min: 1, max: 1000, group: "CRM" },
  { key: "syncedDayRate", rule: "syncedDayRate", unit: 1, label: "A day counts as synced at", suffix: "% of due calls", min: 1, max: 100, group: "CRM" },
  { key: "lateSyncMinutes", rule: "lateSyncMs", unit: MINUTE, label: "Sync is late after", suffix: "minutes", min: 1, max: 1440, group: "CRM" },
  { key: "phoneGraceMinutes", rule: "phoneGraceMs", unit: MINUTE, label: "Grace for the phone's upload", suffix: "minutes", min: 1, max: 1440, group: "Recordings" },
  { key: "serverGraceMinutes", rule: "serverGraceMs", unit: MINUTE, label: "Grace for CallAnchor's server steps", suffix: "minutes", min: 1, max: 240, group: "Recordings" },
] as const satisfies readonly { key: string; rule: keyof typeof RULES; unit: number; label: string; suffix: string; min: number; max: number; group: string }[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

// A setting's current value in its unit, and its default.
export const settingValue = (s: (typeof SETTINGS)[number]) => (RULES[s.rule] as number) / s.unit;
export const settingDefault = (s: (typeof SETTINGS)[number]) => (DEFAULT_RULES[s.rule] as number) / s.unit;

// Resets RULES to the defaults, then applies saved values that are in range. Settings are fleet-wide,
// so every request applying the same saved values is safe.
export function applySettings(saved: Record<string, number>) {
  Object.assign(RULES, DEFAULT_RULES);
  for (const s of SETTINGS) {
    const value = saved[s.key];
    if (typeof value === "number" && Number.isFinite(value) && value >= s.min && value <= s.max) (RULES as Record<string, unknown>)[s.rule] = value * s.unit;
  }
}

export type IssueLevel = "critical" | "warning" | "info";
export type IssueScope = "fleet" | "client" | "license";
// "state" is an account or seat condition, which has no timeline.
export type Trend = "new" | "ongoing" | "fading" | "state";

// Where an issue's rows are: its calls (a stage, see callStage), or stored syncs or logs. `window` is
// the items page's window in days, when it isn't 1.
export type IssueDrill = { kind: "calls" | "syncs" | "logs" } & Record<string, string>;

export type Issue = {
  id: string;
  kind: string;
  scope: IssueScope;
  clientId: string | null;
  licenseId: string | null;
  level: IssueLevel;
  title: string;
  // Unique calls affected, and how that reads ("312 calls not in the CRM").
  impact: number;
  impactText: string | null;
  firstAt: string | null;
  lastAt: string | null;
  trend: Trend;
  // Affected calls per hour over the last 24 hours, oldest first.
  hourly: number[];
  evidence: string[];
  // Up to 3 masked CRM replies, shown as what the CRM said. Never used for severity.
  samples: string[];
  drill: IssueDrill | null;
  // A license issue that most of the client's licenses share is raised once at client level instead.
  rolledUp?: boolean;
  // Opened since the member's last visit to the fleet page.
  newSinceVisit?: boolean;
};

const LEVEL_RANK: Record<IssueLevel, number> = { critical: 0, warning: 1, info: 2 };
export const byIssue = (a: Issue, b: Issue) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.impact - a.impact;

const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

// ---- Time ----

const IST_OFFSET_MS = 5.5 * HOUR;
const istLabelFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const istLabel = (iso: string) => `${istLabelFormat.format(new Date(iso))} IST`;
// The IST date of a moment, as YYYY-MM-DD.
export const istDay = (at: number) => new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);

export const durationText = (ms: number) =>
  ms >= 2 * DAY ? `${Math.round(ms / DAY)} days` : ms >= 2 * HOUR ? `${Math.round(ms / HOUR)} hours` : ms >= 2 * MINUTE ? `${Math.round(ms / MINUTE)} minutes` : `${Math.round(ms / 1000)} seconds`;
const ageText = durationText;

// ---- One call ----

export const callTime = (call: StoredCall) => call.ingestedAt ?? call.firstCalloutAt;
const ageOf = (call: StoredCall, now: number) => now - Date.parse(callTime(call)!);
const older = (at: string | null, now: number, ms: number) => at !== null && now - Date.parse(at) > ms;

// A 2xx from the CRM, for any event, is a call that reached it (owner, 2026-11-04). recording.ready is
// sent for a call that connected and was recorded; call.completed for a missed incoming or rejected
// outgoing call. Either one is the call's sync (owner, 2026-11-05).
export const isDelivered = (call: StoredCall) => call.firstDeliveredAt !== null;
// Its latest callout failed and none ever reached the CRM.
export const isFailed = (call: StoredCall) => !isDelivered(call) && call.lastStatus === "failed";
const is4xx = (call: StoredCall) => call.lastHttp !== null && call.lastHttp >= 400 && call.lastHttp < 500;

// The recording chain. A delivered recording.ready proves the recording was made, uploaded and
// verified, even when its logs weren't stored (QA R5), and an upload proves a recording that
// CallAnchor marked not_recorded (R4). RECORDED_SQL and friends in store.ts must agree.
const sentRecording = (c: StoredCall) => c.deliveredEvents.includes("recording.ready");
export const isVerified = (c: StoredCall) => c.verifiedAt !== null || sentRecording(c);
export const isUploaded = (c: StoredCall) => c.uploadedAt !== null || isVerified(c);
export const isRecorded = (c: StoredCall) =>
  c.recordingDetail === "pending_upload" || c.uploadStartedAt !== null || c.uploadFailedAt !== null || isUploaded(c);
// A call that never connected, so had nothing to record: its payload says 0 seconds (owner,
// 2026-11-05), or it was missed or rejected. Without a payload length, a call synced only as
// call.completed, which CallAnchor sends for a missed incoming or rejected outgoing call, counts too.
// Not a recording failure.
export const isUnconnected = (c: StoredCall) =>
  !isRecorded(c) &&
  (c.callSeconds !== null
    ? c.callSeconds === 0
    : c.callType === "missed" || c.callType === "rejected" || c.deliveredEvents.includes("call.completed"));
// When the call was ready to go to the CRM: after verification for a recording, else on ingest.
const readyAt = (c: StoredCall) => (c.verifiedAt && isRecorded(c) ? c.verifiedAt : c.ingestedAt);

export type ClientContext = { takesRecordings: boolean; takesCallCompleted: boolean; takesAny: boolean; hasIntegration: boolean };

// Tests other stages build on.
const isMissing = (c: StoredCall, ctx: ClientContext, now: number) =>
  ctx.takesCallCompleted && c.attempts === 0 && older(c.ingestedAt, now, RULES.serverGraceMs) && c.verifiedAt === null &&
  c.recordingDetail !== "pending_upload" && c.recordingDetail !== "skipped_trial_limit";
const isUnsynced = (c: StoredCall, ctx: ClientContext, now: number) => ctx.takesAny && older(c.verifiedAt, now, RULES.serverGraceMs) && !isDelivered(c);
const isDue = (c: StoredCall, ctx: ClientContext, now: number) => isDelivered(c) || isFailed(c) || isMissing(c, ctx, now) || isUnsynced(c, ctx, now);
const isWaiting = (c: StoredCall, now: number) =>
  c.recordingDetail === "pending_upload" && !c.uploadStartedAt && !isUploaded(c) && !c.uploadFailedAt && older(c.ingestedAt, now, RULES.phoneGraceMs);

// The calls behind each issue and funnel step. The items page lists calls with the same tests, so a
// count and its rows always agree.
export const CALL_STAGES = {
  all: { title: "All calls", test: () => true },
  sent: { title: "Calls with a CRM callout", test: (c) => c.attempts > 0 },
  notSent: { title: "Calls with no CRM callout", test: (c) => c.attempts === 0 },
  delivered: { title: "Calls that reached the CRM", test: isDelivered },
  notAccepted: { title: "Calls sent but not accepted by the CRM", test: (c) => c.attempts > 0 && !isDelivered(c) },
  // Calls the CRM should have by now: it answered, or the integration expects them and the grace has
  // passed. "Reached the CRM" is delivered out of due, everywhere (QA N1).
  due: {
    title: "Calls due at the CRM",
    test: isDue,
  },
  notReached: { title: "Calls due at the CRM that didn't reach it", test: (c, ctx, now) => !isDelivered(c) && isDue(c, ctx, now) },
  failed: { title: "Calls whose CRM sync failed", test: isFailed },
  rejected: { title: "Calls the CRM rejected (HTTP 4xx)", test: (c) => isFailed(c) && is4xx(c) && !isAuthFailure(c.lastHttp) },
  auth: { title: "Calls rejected for CRM sign-in (HTTP 401 or 403)", test: (c) => isFailed(c) && isAuthFailure(c.lastHttp) },
  unreachable: { title: "Calls where the CRM didn't respond or returned 5xx", test: (c) => isFailed(c) && (c.lastHttp === null || c.lastHttp >= 500) },
  missing: {
    title: "Calls with no CRM callout {serverGrace} after they came in",
    test: isMissing,
  },
  skipped: { title: "Calls skipped for the trial recording limit", test: (c) => c.recordingDetail === "skipped_trial_limit" },
  recorded: { title: "Calls recorded", test: isRecorded },
  notConnected: { title: "Calls that didn't connect (missed, rejected or unanswered): nothing to record", test: isUnconnected },
  notRecorded: {
    title: "Calls not recorded that may have connected",
    test: (c) =>
      (c.recordingDetail === "not_recorded" || (c.hasRecording === false && c.recordingDetail !== "skipped_trial_limit")) &&
      !isRecorded(c) && !isUnconnected(c),
  },
  mislabeled: { title: "Calls CallAnchor marked not recorded, whose recording uploaded", test: (c) => c.recordingDetail === "not_recorded" && isRecorded(c) },
  uploaded: { title: "Recordings uploaded", test: isUploaded },
  notUploaded: { title: "Recordings not uploaded", test: (c) => isRecorded(c) && !isUploaded(c) },
  verified: { title: "Recordings verified", test: isVerified },
  notVerified: { title: "Recordings uploaded, not verified", test: (c) => isUploaded(c) && !isVerified(c) },
  synced: { title: "Recordings synced to the CRM", test: (c) => isVerified(c) && isDelivered(c) },
  notSynced: { title: "Recordings verified, not synced to the CRM", test: (c) => isVerified(c) && !isDelivered(c) },
  stuck: { title: "Recordings stuck or failed after the upload began", test: (c, _ctx, now) => stuckStage(c, now) !== null },
  waiting: {
    title: "Recordings the phone hasn't uploaded after {phoneGrace}",
    test: (c, _ctx, now) => isWaiting(c, now),
  },
  // Still on the phone: never uploaded, or an upload the phone began but didn't finish (QA N4).
  onPhone: {
    title: "Recordings still on the phone",
    test: (c, _ctx, now) => isWaiting(c, now) || stuckStage(c, now) === STUCK_ON_PHONE,
  },
  unsynced: {
    title: "Verified recordings not synced to the CRM",
    test: isUnsynced,
  },
  // Every open drop along the recording chain, as the pulse counts them.
  openDrop: {
    title: "Recordings still open: on the phone, stuck after upload, or not synced",
    test: (c, ctx, now) => isWaiting(c, now) || stuckStage(c, now) !== null || isUnsynced(c, ctx, now),
  },
  uploadFailed: { title: "Recordings that failed to upload", test: (c) => c.uploadFailedAt !== null && !isVerified(c) },
  // Late from when the call was ready to send, so the phone's upload wait doesn't count (QA R7).
  late: {
    title: "Calls that reached the CRM more than {late} after they were ready",
    test: (c) => {
      const ready = readyAt(c);
      return ready !== null && c.firstDeliveredAt !== null && Date.parse(c.firstDeliveredAt) - Date.parse(ready) > RULES.lateSyncMs;
    },
  },
  duplicate: { title: "Calls the CRM accepted more than once for the same event", test: (c) => c.duplicateDeliveries > 0 },
  noLog: { title: "Calls with CRM callouts but no stored ingest log", test: (c) => c.attempts > 0 && c.ingestedAt === null },
  // The journey: phone → app → recording uploaded → sent to the CRM → accepted. Each call stops at most
  // once, at the first step that broke (see journeyStop); the roll-ups count with these same tests.
  stopUpload: { title: "Calls stopped at the recording upload", test: (c, ctx, now) => journeyStop(c, ctx, now) === "upload" },
  stopSent: { title: "Calls stopped before being sent to the CRM", test: (c, ctx, now) => journeyStop(c, ctx, now) === "sent" },
  stopCrm: { title: "Calls the CRM didn't accept", test: (c, ctx, now) => journeyStop(c, ctx, now) === "crm" },
  complete: { title: "Calls that went all the way through", test: (c, ctx) => isComplete(c, ctx) },
  moving: { title: "Calls still on their way", test: (c, ctx, now) => !isComplete(c, ctx) && journeyStop(c, ctx, now) === null },
} satisfies Record<string, { title: string; test: (call: StoredCall, ctx: ClientContext, now: number) => boolean }>;

export type CallStage = keyof typeof CALL_STAGES;
// A stage's title with the current thresholds filled in.
export const stageTitle = (stage: CallStage) =>
  CALL_STAGES[stage].title
    .replace("{serverGrace}", durationText(RULES.serverGraceMs))
    .replace("{phoneGrace}", durationText(RULES.phoneGraceMs))
    .replace("{late}", durationText(RULES.lateSyncMs));
export const isCallStage = (value: string | undefined): value is CallStage => !!value && Object.hasOwn(CALL_STAGES, value);
export function inStage(stage: CallStage, call: StoredCall, ctx: ClientContext, now: number): boolean {
  return (CALL_STAGES[stage].test as (call: StoredCall, ctx: ClientContext, now: number) => boolean)(call, ctx, now);
}

const STUCK_ON_PHONE = "Upload started, not finished";

// Where a recording stopped after its upload began, if it did.
export function stuckStage(c: StoredCall, now: number): string | null {
  if (isVerified(c)) return null;
  if (c.uploadFailedAt) return "Upload failed";
  if (older(c.uploadedAt, now, RULES.serverGraceMs)) return "Uploaded, not verified";
  if (!c.uploadedAt && older(c.uploadStartedAt, now, RULES.phoneGraceMs)) return STUCK_ON_PHONE;
  return null;
}

// ---- The journey, in plain steps ----

// The steps a call passes, in the words the support team uses. "phone" and "app" never stop a call:
// a call we know about was made and picked up. A connected call with no recording still goes through;
// the call page notes it on the upload step.
export const JOURNEY_STEPS = [
  { key: "phone", label: "Call made on the phone" },
  { key: "app", label: "Picked up by the app" },
  { key: "upload", label: "Recording uploaded" },
  { key: "sent", label: "Sent to the CRM" },
  { key: "crm", label: "Accepted by the CRM" },
] as const;
export type JourneyKey = (typeof JOURNEY_STEPS)[number]["key"];
export type JourneyStop = Extract<JourneyKey, "upload" | "sent" | "crm">;
export const STOP_STAGE: Record<JourneyStop, CallStage> = { upload: "stopUpload", sent: "stopSent", crm: "stopCrm" };

const uploadBroken = (c: StoredCall, now: number) => isWaiting(c, now) || stuckStage(c, now) !== null || (c.unavailableAt !== null && !isUploaded(c));

// The first step where the call broke, or null if nothing broke (yet). Waiting inside a grace period
// isn't broken. `readLastSyncs` in store.ts finds the last complete call the same way.
export function journeyStop(c: StoredCall, ctx: ClientContext, now: number): JourneyStop | null {
  if (uploadBroken(c, now)) return "upload";
  if (isDelivered(c) || !isDue(c, ctx, now)) return null;
  return c.attempts === 0 ? "sent" : "crm";
}

// All the way through: the CRM accepted it, with its recording when one was made. A client with no
// integration ends at the recording.
export const isComplete = (c: StoredCall, ctx: ClientContext) =>
  (!isRecorded(c) || isVerified(c)) && (ctx.takesAny ? isDelivered(c) : true);

export type JourneySummary = { calls: number; complete: number; moving: number; stops: Record<JourneyStop, number>; recorded: number; picked: number; sent: number };

export const emptyJourney = (): JourneySummary => ({ calls: 0, complete: 0, moving: 0, stops: { upload: 0, sent: 0, crm: 0 }, recorded: 0, picked: 0, sent: 0 });

// Adds one call to a summary, judged by its own client's context, so a summary can span clients (a
// device model's licenses).
export function addToJourney(out: JourneySummary, c: StoredCall, ctx: ClientContext, now: number) {
  out.calls++;
  const stop = journeyStop(c, ctx, now);
  if (stop) out.stops[stop]++;
  else if (isComplete(c, ctx)) out.complete++;
  else out.moving++;
  if (isRecorded(c)) out.recorded++;
  if (c.ingestedAt) out.picked++;
  if (c.attempts > 0) out.sent++;
}

export function journeySummary(calls: StoredCall[], ctx: ClientContext, now: number): JourneySummary {
  const out = emptyJourney();
  for (const c of calls) addToJourney(out, c, ctx, now);
  return out;
}

// The one place a call stops, for the call page and recording lists.
export function callProblem(c: StoredCall, ctx: ClientContext, now: number): string | null {
  const stuck = stuckStage(c, now);
  if (stuck) return stuck;
  // The phone said there's no recording file, so waiting won't help (audit note 1).
  if (c.unavailableAt && !isUploaded(c)) return `Phone couldn't save the recording${c.unavailableReason ? `: ${c.unavailableReason}` : ""}`;
  if (inStage("waiting", c, ctx, now)) return "Phone hasn't uploaded the recording";
  if (inStage("unsynced", c, ctx, now)) return "Verified, not synced to the CRM";
  if (inStage("missing", c, ctx, now)) return "No CRM callout was sent";
  if (inStage("auth", c, ctx, now)) return "CRM rejected the sign-in";
  if (inStage("failed", c, ctx, now)) return "CRM sync failed";
  if (inStage("skipped", c, ctx, now)) return "Skipped for the trial recording limit";
  if (inStage("duplicate", c, ctx, now)) return "CRM accepted it more than once";
  return null;
}

export function clientContext(tenant: TenantSummary | null): ClientContext {
  const active = (tenant?.integrations ?? []).filter((i) => i.active);
  const takesRecordings = tenant?.takesRecordings ?? false;
  // An integration that lists no events gets them all (finding A).
  const takesCallCompleted = active.some((i) => i.eventTypes.length === 0 || i.eventTypes.includes("call.completed"));
  return { takesRecordings, takesCallCompleted, takesAny: takesRecordings || takesCallCompleted, hasIntegration: active.length > 0 };
}

// ---- Days and consistency (QA section 11) ----

// synced: at least syncedDayRate% of due calls reached the CRM. partial: some did. failed: none did.
// quiet: calls, but none due (no integration, or none old enough yet). none: no calls.
export type DayState = "none" | "quiet" | "synced" | "partial" | "failed";
export type Day = { day: string; calls: number; due: number; delivered: number; state: DayState; marks: string[] };
export type Consistency = { synced: number; active: number };

// Which of a day's calls were due at the CRM, the same way CALL_STAGES.due counts them.
export const dueOf = (row: Pick<DayRow, "delivered" | "failed" | "noCallout" | "verifiedUnsent">, ctx: ClientContext) =>
  row.delivered + row.failed + (ctx.takesCallCompleted ? row.noCallout : 0) + (ctx.takesAny ? row.verifiedUnsent : 0);

// The last `count` IST days, oldest first, from day rows for one client or license. `marks` adds
// notes to a day, such as an app update (QA L11).
export function dayStrip(rows: DayRow[], ctx: ClientContext, now: number, count: number, marks: Map<string, string[]> = new Map()): Day[] {
  const byDay = new Map<string, { calls: number; due: number; delivered: number }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { calls: 0, due: 0, delivered: 0 };
    d.calls += r.calls;
    d.due += dueOf(r, ctx);
    d.delivered += r.delivered;
    byDay.set(r.day, d);
  }
  return Array.from({ length: count }, (_, i) => {
    const day = istDay(now - (count - 1 - i) * DAY);
    const d = byDay.get(day) ?? { calls: 0, due: 0, delivered: 0 };
    const rate = share(d.delivered, d.due);
    const state: DayState = d.calls === 0 ? "none" : d.due === 0 ? "quiet" : rate! >= RULES.syncedDayRate ? "synced" : d.delivered > 0 ? "partial" : "failed";
    return { day, ...d, state, marks: marks.get(day) ?? [] };
  });
}

export const consistency = (days: Day[]): Consistency => ({
  synced: days.filter((d) => d.state === "synced").length,
  active: days.filter((d) => d.state === "synced" || d.state === "partial" || d.state === "failed").length,
});

const dayRate = (days: Day[]) => {
  const due = days.reduce((sum, d) => sum + d.due, 0);
  return { due, rate: share(days.reduce((sum, d) => sum + d.delivered, 0), due) };
};

// How many days in a row, back from today, fell short of a synced day, and when that run began.
// Days without due calls don't break the run (QA T1: a client at 0% for six days isn't new today).
function shortfall(days: Day[]) {
  let start: string | null = null;
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const { state, day } = days[i];
    if (state === "synced") break;
    if (state === "partial" || state === "failed") {
      start = day;
      count++;
    }
  }
  return { count, startAt: start ? new Date(Date.parse(`${start}T00:00:00Z`) - IST_OFFSET_MS).toISOString() : null };
}

// One shape at every level (QA section 11): when it last reached the CRM, how consistently, and how
// far its recordings get.
export type Pulse = {
  lastSyncAt: string | null;
  // The last call that went all the way through, phone to CRM (with its recording when made).
  lastComplete: { at: string; callId: string } | null;
  // Where the last 24 hours' calls stopped, by journey step.
  journey: JourneySummary;
  lastCallAt: string | null;
  // The last 30 days, oldest first.
  days: Day[];
  week: Consistency;
  month: Consistency;
  // The last 24 hours: due calls, and how many reached the CRM.
  reached: { delivered: number; due: number; share: number | null };
  // The last 7 days, from the day rows.
  chain: { recorded: number; uploaded: number; verified: number; synced: number };
  // Recordings still open across the lookback: on the phone, stuck after upload, or not synced.
  openDrops: number;
};

export const lastCompleteOf = (last: LastSync | undefined): Pulse["lastComplete"] =>
  last?.completeAt && last.completeCallId ? { at: last.completeAt, callId: last.completeCallId } : null;

export function pulse(input: { rows: DayRow[]; calls24h: StoredCall[]; pool: StoredCall[]; ctx: ClientContext; now: number; lastSyncAt: string | null; lastCallAt: string | null; lastComplete?: Pulse["lastComplete"]; marks?: Map<string, string[]> }): Pulse {
  const { ctx, now } = input;
  const days = dayStrip(input.rows, ctx, now, 30, input.marks);
  const due = input.calls24h.filter((c) => inStage("due", c, ctx, now));
  const delivered = due.filter(isDelivered).length;
  const weekDays = new Set(days.slice(-7).map((d) => d.day));
  const chain = { recorded: 0, uploaded: 0, verified: 0, synced: 0 };
  for (const r of input.rows) {
    if (!weekDays.has(r.day)) continue;
    chain.recorded += r.recorded;
    chain.uploaded += r.uploaded;
    chain.verified += r.verified;
    chain.synced += r.synced;
  }
  return {
    lastSyncAt: input.lastSyncAt,
    lastComplete: input.lastComplete ?? null,
    journey: journeySummary(input.calls24h, ctx, now),
    lastCallAt: input.lastCallAt,
    days,
    week: consistency(days.slice(-7)),
    month: consistency(days),
    reached: { delivered, due: due.length, share: share(delivered, due.length) },
    chain,
    openDrops: input.pool.filter((c) => inStage("openDrop", c, ctx, now)).length,
  };
}

// ---- Shared pieces of an issue ----

// Hourly counts over the last 24 hours, first/last seen, and whether it's new, ongoing or fading.
function timing(times: (string | null)[], now: number) {
  const valid = times.filter((t): t is string => !!t).sort();
  const hourly = new Array<number>(24).fill(0);
  let recent = 0;
  let before = 0;
  for (const t of valid) {
    const age = now - Date.parse(t);
    const bucket = 23 - Math.floor(age / HOUR);
    if (bucket >= 0 && bucket < 24) hourly[bucket]++;
    if (age <= RULES.trendRecentMs) recent++;
    else if (age <= RULES.trendRecentMs + RULES.trendBeforeMs) before++;
  }
  const trend: Trend = valid.length === 0 ? "state" : recent > 0 && before === 0 ? "new" : recent === 0 && before > 0 ? "fading" : "ongoing";
  return { hourly, trend, firstAt: valid[0] ?? null, lastAt: valid[valid.length - 1] ?? null };
}

// The commonest masked replies among these calls, as evidence only.
function samples(calls: StoredCall[]) {
  const counts = new Map<string, number>();
  for (const c of calls) if (c.lastLabel) counts.set(c.lastLabel, (counts.get(c.lastLabel) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => `${label} (${n(count, "call")})`);
}

const httpCodes = (calls: StoredCall[]) => {
  const counts = new Map<string, number>();
  for (const c of calls) {
    const code = c.lastHttp === null ? "no response" : `HTTP ${c.lastHttp}`;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code}: ${n(count, "call")}`).join(" · ");
};

// "165 recordings still on the phone, 116 of them older than 24 hours".
function openText(calls: StoredCall[], now: number, one: string, what: string) {
  const old = calls.filter((c) => ageOf(c, now) > DAY).length;
  return `${n(calls.length, one)} ${what}${old ? `, ${old.toLocaleString("en-IN")} older than 24 hours` : ""}`;
}

type Scope = { scope: IssueScope; clientId: string | null; licenseId: string | null };
// The affected calls set the impact and timing; `times` replaces them for issues without calls.
type IssueExtra = Partial<Pick<Issue, "impact" | "impactText" | "evidence" | "samples" | "drill" | "firstAt">> & { calls?: StoredCall[]; times?: (string | null)[] };

function issue(scope: Scope, kind: string, level: IssueLevel, title: string, now: number, extra: IssueExtra = {}): Issue {
  const calls = extra.calls ?? [];
  const t = timing(extra.times ?? calls.map(callTime), now);
  return {
    id: `${kind}.${scope.licenseId ?? scope.clientId ?? "fleet"}`,
    kind,
    ...scope,
    level,
    title,
    impact: extra.impact ?? calls.length,
    impactText: extra.impactText ?? null,
    ...t,
    // An earlier start the data shows outside the 24 hours, such as a run of bad days.
    firstAt: extra.firstAt && (!t.firstAt || extra.firstAt < t.firstAt) ? extra.firstAt : t.firstAt,
    evidence: extra.evidence ?? [],
    samples: extra.samples ?? [],
    drill: extra.drill ?? null,
  };
}

const lastSyncText = (at: string | null, now: number) =>
  at ? `Last call that reached the CRM: ${istLabel(at)} (${ageText(now - Date.parse(at))} ago)` : "No stored call has ever reached the CRM";

// Platform ids are cuids, but an issue id must stay within ISSUE_ID.
const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 36);

// ---- Client issues (section 5) ----

export type ClientInput = {
  clientId: string;
  status: string;
  accessSuspended?: boolean;
  tenant: TenantSummary | null;
  oneApi: OneApiStatus | null;
  callsToday: number;
  // At least the last 8 days, so the 7-day baseline has a full week before today.
  calls: StoredCall[];
  // Older calls still open in the recording chain or never sent, back to openLookbackDays.
  open: StoredCall[];
  days: Day[];
  lastSyncAt: string | null;
  // CRM callouts over the last 24 hours, for checking each integration on its own.
  callouts: StoredCallout[];
  integrationChanges: IntegrationChange[];
  // Licenses whose phone-side drops are raised on the license, so the client doesn't count them twice.
  perPhone: Set<string>;
  // Success reply shapes over the last 7 days.
  replyShapes: { label: string; firstAt: string; count: number }[];
};

const CRM_KINDS = new Set(["crm_auth", "crm_rejecting_all", "crm_rejecting", "crm_unreachable", "callout_missing"]);

export function clientIssues(input: ClientInput, now: number): Issue[] {
  const { clientId, tenant } = input;
  const scope: Scope = { scope: "client", clientId, licenseId: null };
  const ctx = clientContext(tenant);
  const day = input.calls.filter((c) => ageOf(c, now) <= DAY);
  // Open drops stay flagged until they're fixed (QA R1).
  const pool = [...input.calls.filter((c) => ageOf(c, now) <= RULES.openLookbackDays * DAY), ...input.open];
  const stage = (s: CallStage, list = day) => list.filter((c) => inStage(s, c, ctx, now));
  const drill = (s: CallStage, window = 1): IssueDrill => ({ kind: "calls", stage: s, ...(window > 1 ? { window: String(window) } : {}) });
  const issues: Issue[] = [];
  const add = (kind: string, level: IssueLevel, title: string, extra?: IssueExtra) => issues.push(issue(scope, kind, level, title, now, extra));
  const lastSync = lastSyncText(input.lastSyncAt, now);
  // A run of bad days before today means the problem is older than the 24 hours (QA T1).
  const run = shortfall(input.days);
  const runText = run.count > 1 ? `Under ${RULES.syncedDayRate}% of due calls reached the CRM on each of the last ${n(run.count, "day")} with calls` : null;
  const crm = (extra: IssueExtra): IssueExtra => ({
    ...extra,
    firstAt: run.count > 1 ? run.startAt : null,
    evidence: [...(extra.evidence ?? []), ...(runText ? [runText] : []), lastSync],
  });

  // CRM outcomes, per call: one call can have many attempts.
  const due = stage("due");
  const delivered = due.filter(isDelivered);
  const failed = stage("failed");
  const auth = stage("auth");
  const rejected = stage("rejected");
  const unreachable = stage("unreachable");
  const settled = delivered.length + failed.length;
  const reachedRate = share(delivered.length, due.length);
  const retried = failed.filter((c) => c.attempts > 1).length;
  const reachedText = `${n(delivered.length, "call")} of ${n(due.length, "due call")} reached the CRM (${reachedRate ?? "—"}%)`;

  if (auth.length > 0) {
    add("crm_auth", "critical", "CRM is rejecting the sign-in", crm({
      calls: auth,
      impactText: `${n(auth.length, "call")} not in the CRM`,
      evidence: [httpCodes(auth), "HTTP 401 and 403 mean the CRM refused the credentials: reconnect the integration or fix the token"],
      samples: samples(auth),
      drill: drill("auth"),
    }));
  }

  const recent = day.filter((c) => c.lastCalloutAt && now - Date.parse(c.lastCalloutAt) <= RULES.rejectAllWindowMs && (isDelivered(c) || isFailed(c)));
  // Sign-in failures alone are crm_auth's, so this needs some other 4xx (QA N3).
  const rejectingAll = rejected.length > 0 && recent.length >= RULES.rejectAllMinCalls && recent.every((c) => isFailed(c) && is4xx(c));
  const persistent = `${n(retried, "call")} retried; retries don't fix a 4xx, so the data or the webhook needs fixing`;
  // Severity and evidence both use the share of settled calls rejected with a 4xx (QA N2).
  const rejectedShare = share(rejected.length, settled) ?? 100;
  const rejectedText = `${n(rejected.length, "call")} of ${n(settled, "settled call")} rejected with HTTP 4xx (${rejectedShare}%)`;
  if (rejectingAll) {
    add("crm_rejecting_all", "critical", "CRM is rejecting every call", crm({
      calls: rejected,
      impactText: `${n(rejected.length, "call")} not in the CRM`,
      evidence: [`All ${n(recent.length, "call")} answered in the last 2 hours ended in HTTP 4xx`, httpCodes(rejected), persistent],
      samples: samples(rejected),
      drill: drill("rejected"),
    }));
  } else if (rejected.length > 0) {
    const kept = 100 - rejectedShare;
    const level: IssueLevel | null =
      settled < RULES.minCallsForRate
        ? "warning"
        : kept < RULES.criticalSuccessRate
          ? rejected.length >= RULES.criticalMinFailures
            ? "critical"
            : "warning"
          : kept < RULES.warningSuccessRate
            ? "warning"
            : null;
    if (level) {
      add("crm_rejecting", level, "CRM is rejecting calls", crm({
        calls: rejected,
        impactText: `${n(rejected.length, "call")} not in the CRM`,
        evidence: [rejectedText, reachedText, httpCodes(rejected), persistent],
        samples: samples(rejected),
        drill: drill("rejected"),
      }));
    }
  }

  if (unreachable.length > 0) {
    // The longest run of consecutive calls, by their latest callout, that got no response or a 5xx.
    const ordered = day.filter((c) => isDelivered(c) || isFailed(c)).sort((a, b) => (a.lastCalloutAt ?? "").localeCompare(b.lastCalloutAt ?? ""));
    let streak = 0;
    let longest = 0;
    for (const c of ordered) {
      streak = isFailed(c) && (c.lastHttp === null || c.lastHttp >= 500) ? streak + 1 : 0;
      longest = Math.max(longest, streak);
    }
    add("crm_unreachable", longest >= RULES.unreachableRun ? "critical" : "warning", "CRM isn't responding", crm({
      calls: unreachable,
      impactText: `${n(unreachable.length, "call")} not in the CRM`,
      evidence: [httpCodes(unreachable), `Longest run in a row: ${n(longest, "call")}`, "Fast refusals, not timeouts, are typical here (finding G)"],
      samples: samples(unreachable),
      drill: drill("unreachable"),
    }));
  }

  const missing = stage("missing", pool);
  if (missing.length > 0) {
    add("callout_missing", missing.length >= RULES.criticalMissing ? "critical" : "warning", "Calls never sent to the CRM", crm({
      calls: missing,
      impactText: openText(missing, now, "call", "not in the CRM"),
      evidence: [
        `Came in more than ${RULES.serverGraceMs / MINUTE} minutes ago with an integration that takes call.completed, and CallAnchor sent no callout`,
        `Integrations: ${tenant?.activeIntegrations.join(", ") || "none"}`,
        "Stays flagged until a callout reaches the CRM, back to 15 days",
      ],
      drill: drill("missing", RULES.openLookbackDays),
    }));
  }

  const skipped = stage("skipped");
  if (skipped.length > 0) {
    add("trial_skipped", ctx.hasIntegration ? "critical" : "warning", "Calls skipped for the trial recording limit", {
      calls: skipped,
      impactText: `${n(skipped.length, "call")} not recorded`,
      evidence: [`CallAnchor marked them skipped_trial_limit${tenant?.recordingLimit ? `; the limit is ${tenant.recordingLimit} recordings` : ""}`],
      drill: drill("skipped"),
    });
  }

  // The recording chain: recorded → uploaded → verified → synced, each drop open until it's fixed.
  const stuck = stage("stuck", pool).filter((c) => stuckStage(c, now) !== STUCK_ON_PHONE || !input.perPhone.has(c.licenseId ?? ""));
  if (stuck.length > 0) {
    const stages = new Map<string, number>();
    for (const c of stuck) stages.set(stuckStage(c, now)!, (stages.get(stuckStage(c, now)!) ?? 0) + 1);
    add("recordings_stuck", stuck.length >= RULES.criticalStuck ? "critical" : "warning", "Recordings stuck after the upload began", {
      calls: stuck,
      impactText: openText(stuck, now, "recording", "not in the CRM"),
      evidence: [
        ...[...stages.entries()].map(([s, count]) => `${s}: ${n(count, "call")}`),
        `Verifying takes seconds, so an upload unverified after ${RULES.serverGraceMs / MINUTE} minutes is stuck on CallAnchor's side`,
      ],
      drill: drill("stuck", RULES.openLookbackDays),
    });
  }
  const waiting = stage("waiting", pool).filter((c) => !input.perPhone.has(c.licenseId ?? ""));
  if (waiting.length > 0) {
    // Critical while recent ones could still upload: a phone that's held them over a day but under a week.
    const overdue = waiting.filter((c) => ageOf(c, now) > DAY && ageOf(c, now) <= 7 * DAY).length;
    add("recordings_waiting", overdue >= RULES.criticalStuck ? "critical" : "warning", "Phones haven't uploaded recordings", {
      calls: waiting,
      impactText: openText(waiting, now, "recording", "still on the phone"),
      evidence: [
        `Came in more than ${RULES.phoneGraceMs / MINUTE} minutes ago and the upload never started. Often the phone is offline`,
        ...(input.perPhone.size ? ["Phones with their own issue for this are counted there, not here"] : []),
      ],
      drill: drill("waiting", RULES.openLookbackDays),
    });
  }
  const unsynced = stage("unsynced", pool);
  if (unsynced.length > 0) {
    add("recordings_unsynced", unsynced.length >= RULES.criticalStuck ? "critical" : "warning", "Verified recordings not synced to the CRM", {
      calls: unsynced,
      impactText: openText(unsynced, now, "recording", "not in the CRM"),
      evidence: [
        `Verified more than ${RULES.serverGraceMs / MINUTE} minutes ago; neither call.completed nor recording.ready reached the CRM`,
        `${n(unsynced.filter((c) => c.attempts === 0).length, "call")} got no callout at all`,
        lastSync,
      ],
      samples: samples(unsynced),
      drill: drill("unsynced", RULES.openLookbackDays),
    });
  }
  const mislabeled = stage("mislabeled");
  if (mislabeled.length > 0) {
    add("recording_mislabeled", "info", "CallAnchor marked recorded calls as not recorded", {
      calls: mislabeled,
      impactText: `${n(mislabeled.length, "call")} marked not_recorded with an uploaded recording`,
      evidence: ["Their recording uploaded, so they're counted as recorded here. CallAnchor's own counts will differ"],
      drill: drill("mislabeled"),
    });
  }

  const late = stage("late");
  if (late.length > 0) {
    const slowest = Math.max(...late.map((c) => Date.parse(c.firstDeliveredAt!) - Date.parse(readyAt(c)!)));
    add("late_sync", late.length >= RULES.lateWarningCalls ? "warning" : "info", "Calls reaching the CRM late", {
      calls: late,
      impactText: `${n(late.length, "call")} more than ${RULES.lateSyncMs / MINUTE} minutes late`,
      evidence: [`Slowest: ${ageText(slowest)} from ready to the CRM`, "Measured from when the call was ready to send: on ingest, or once its recording was verified"],
      drill: drill("late"),
    });
  }

  const duplicates = stage("duplicate", input.calls.filter((c) => ageOf(c, now) <= RULES.duplicateDays * DAY));
  if (duplicates.length > 0) {
    add("crm_duplicates", "warning", "CRM accepted the same call more than once", {
      calls: duplicates,
      impactText: `${n(duplicates.length, "call")} in the last ${RULES.duplicateDays} days`,
      evidence: [
        `${n(duplicates.reduce((sum, c) => sum + c.duplicateDeliveries, 0), "extra 2xx reply", "extra 2xx replies")} for an event the CRM had already accepted`,
        "CallAnchor retries a 2xx when the reply has no record id, so the CRM may hold duplicate records",
      ],
      drill: drill("duplicate", RULES.duplicateDays),
    });
  }

  // Against its own history: fewer calls reaching the CRM than in the last 7 days (QA T3).
  const before = dayRate(input.days.slice(-8, -1));
  if (
    reachedRate !== null && before.rate !== null && due.length >= RULES.minCallsForRate && before.due >= 3 * RULES.minCallsForRate &&
    before.rate - reachedRate >= RULES.baselineDropPoints && !issues.some((i) => CRM_KINDS.has(i.kind) && i.level === "critical")
  ) {
    add("crm_below_usual", "warning", "Fewer calls reaching the CRM than usual", {
      calls: stage("notReached"),
      impactText: `${n(due.length - delivered.length, "due call")} not in the CRM`,
      evidence: [reachedText, `${before.rate}% over the previous 7 days`, lastSync],
      drill: drill("notReached"),
    });
  }

  // Consistency: a client that syncs on some days and not others (QA L4).
  const week = consistency(input.days.slice(-7));
  if (week.active >= RULES.consistencyMinDays && week.synced / week.active < RULES.consistencyMin) {
    add("crm_inconsistent", "warning", `CRM sync on only ${week.synced} of ${n(week.active, "day")} with calls`, {
      impact: 0,
      times: [],
      evidence: [
        `A day counts as synced when at least ${RULES.syncedDayRate}% of its due calls reached the CRM`,
        `Last 30 days: ${consistency(input.days).synced} of ${consistency(input.days).active}`,
      ],
      drill: drill("notReached", 7),
    });
  }

  // Quiet: a client that usually calls has had nothing for a while.
  if (input.status !== "inactive") {
    const week = input.calls.filter((c) => ageOf(c, now) > DAY && ageOf(c, now) <= (RULES.baselineDays + 1) * DAY);
    const perDay = week.length / RULES.baselineDays;
    const last = input.calls.reduce<number>((latest, c) => Math.max(latest, Date.parse(c.lastCalloutAt ?? callTime(c)!), Date.parse(callTime(c)!)), 0);
    const silent = now - (last || now - 7 * DAY);
    if (perDay >= RULES.quietMinDailyCalls && silent > RULES.quietMs) {
      add("client_quiet", "warning", "Client has gone quiet", {
        impactText: null,
        times: [],
        evidence: [
          last ? `No calls or callouts stored for ${ageText(silent)}, since ${istLabel(new Date(last).toISOString())}` : "No calls or callouts stored this week",
          `Usually about ${Math.round(perDay)} calls a day over the last 7 days`,
          "If CallAnchor shows calls today, our pull is behind instead: check the data coverage line",
        ],
        drill: { kind: "calls", stage: "all" },
      });
    }
  }

  // A success reply in a shape not seen before usually means someone edited the webhook (finding I).
  const weekAgo = now - 7 * DAY;
  const olderShapes = input.replyShapes.filter((s) => Date.parse(s.firstAt) < now - DAY && Date.parse(s.firstAt) >= weekAgo);
  const fresh = input.replyShapes.filter((s) => Date.parse(s.firstAt) >= now - DAY);
  if (olderShapes.length > 0 && fresh.length > 0) {
    add("reply_format", "info", "CRM's success reply changed shape", {
      impact: 0,
      times: fresh.map((s) => s.firstAt),
      evidence: ["A new success reply shape appeared in the last 24 hours. The webhook code may have changed"],
      samples: fresh.slice(0, 3).map((s) => `New: ${s.label} (${n(s.count, "reply", "replies")})`),
      drill: { kind: "syncs", status: "delivered" },
    });
  }

  issues.push(...integrationIssues(input, day, now));
  issues.push(...accountIssues(input, now));
  return issues;
}

// Each integration on its own: switched off, failing while another succeeds, or stale (QA I1, I2, I5).
function integrationIssues(input: ClientInput, day: StoredCall[], now: number): Issue[] {
  const { tenant, clientId } = input;
  if (!tenant || input.status === "inactive") return [];
  const scope: Scope = { scope: "client", clientId, licenseId: null };
  const issues: Issue[] = [];
  const calling = input.callsToday > 0 || day.length > 0;
  const active = tenant.integrations.filter((i) => i.active);

  const offs = input.integrationChanges.filter((c) => (c.field === "active" && c.oldValue === "true" && c.newValue === "false") || (c.field === "removed" && c.oldValue === "true"));
  if (offs.length > 0 && calling) {
    const latest = offs[0];
    const callsSince = day.filter((c) => callTime(c)! >= latest.at).length;
    issues.push(
      issue(scope, "integration_off", active.length === 0 ? "critical" : "warning", active.length === 0 ? "CRM integration switched off" : "One CRM integration switched off", now, {
        impact: callsSince,
        impactText: callsSince ? `${n(callsSince, "call")} since, with nowhere to go` : null,
        times: offs.map((c) => c.at),
        evidence: [
          ...offs.map((c) => `${c.platformName ?? c.platformId} ${c.field === "removed" ? "removed" : "switched off"} at ${istLabel(c.at)}`),
          active.length === 0 ? "With no active integration, no call is sent to a CRM and the missing-callout checks stay silent" : `Still active: ${tenant.activeIntegrations.join(", ")}`,
        ],
        drill: { kind: "calls", stage: "all" },
      }),
    );
  } else if (active.length === 0 && calling) {
    issues.push(
      issue(scope, "account_no_integration", input.status === "active" ? "warning" : "info", "No active CRM integration", now, {
        impact: day.length,
        impactText: day.length ? `${n(day.length, "call")} in 24 hours with nowhere to go` : null,
        times: [],
        evidence: ["Calls come in but nothing is set up to receive them, so the missing-callout and unsynced checks can't run"],
        drill: { kind: "calls", stage: "all" },
      }),
    );
  }

  // One CRM's failures can hide behind another's success, so each is checked alone when there are two.
  if (active.length >= 2) {
    const byPlatform = new Map<string, Map<string, { delivered: boolean; last: StoredCallout }>>();
    for (const e of input.callouts) {
      const calls = byPlatform.get(e.platformId) ?? new Map();
      const c = calls.get(e.callId) ?? { delivered: false, last: e };
      if (e.status === "delivered") c.delivered = true;
      if (e.at > c.last.at || (e.at === c.last.at && e.attempt > c.last.attempt)) c.last = e;
      calls.set(e.callId, c);
      byPlatform.set(e.platformId, calls);
    }
    for (const [platformId, calls] of byPlatform) {
      const outcomes = [...calls.values()];
      const deliveredCount = outcomes.filter((c) => c.delivered).length;
      const failedCount = outcomes.filter((c) => !c.delivered && c.last.status === "failed").length;
      const rate = share(deliveredCount, deliveredCount + failedCount);
      // Few calls still warn when one failed, so a small client isn't left out (owner, 2026-11-13).
      if (rate === null || rate >= RULES.warningSuccessRate || failedCount === 0) continue;
      const level: IssueLevel = deliveredCount + failedCount >= RULES.minCallsForRate && rate < RULES.criticalSuccessRate && failedCount >= RULES.criticalMinFailures ? "critical" : "warning";
      const name = tenant.integrations.find((i) => i.platformId === platformId)?.platformName ?? platformId;
      issues.push(
        issue(scope, `integration_failing_${slug(platformId)}`, level, `${name} is failing calls`, now, {
          impact: failedCount,
          impactText: `${n(failedCount, "call")} not in ${name}`,
          times: outcomes.filter((c) => !c.delivered && c.last.status === "failed").map((c) => c.last.at),
          evidence: [`${n(deliveredCount, "call")} of ${n(deliveredCount + failedCount, "settled call")} reached ${name} (${rate}%)`, `The client has ${active.length} active integrations; each is checked on its own`],
          drill: { kind: "syncs", status: "failed", platform: platformId },
        }),
      );
    }
  }

  for (const i of active) {
    if (i.lastHealthCheck && now - Date.parse(i.lastHealthCheck) > RULES.staleHealthCheckHours * HOUR) {
      issues.push(
        issue(scope, `account_health_check_${slug(i.platformId)}`, calling ? "warning" : "info", `${i.platformName} health check older than ${RULES.staleHealthCheckHours} hours`, now, {
          impact: 0,
          times: [],
          evidence: [`Last health check ${istLabel(i.lastHealthCheck)}`, ...(calling ? ["Calls are flowing, so a broken connection would lose them"] : [])],
        }),
      );
    }
  }
  return issues;
}

// Limits, trial, license cap, storage and OneAPI. Silent for inactive clients (finding J).
function accountIssues(input: ClientInput, now: number): Issue[] {
  const { tenant, oneApi, clientId } = input;
  if (input.status === "inactive") return [];
  const scope: Scope = { scope: "client", clientId, licenseId: null };
  const issues: Issue[] = [];
  const add = (kind: string, level: IssueLevel, title: string, evidence: string[] = []) =>
    issues.push(issue(scope, kind, level, title, now, { impact: 0, times: [], evidence }));
  const calling = input.callsToday > 0 || input.calls.some((c) => ageOf(c, now) <= DAY);

  if (tenant) {
    if (tenant.recordingAtLimit) {
      add("account_recording_limit", calling ? "critical" : "warning", "Recording limit reached", [
        tenant.recordingLimit === null
          ? `${n(tenant.recordedCalls, "call")} recorded. CallAnchor reports the limit reached but shows no limit`
          : `${n(tenant.recordedCalls, "call")} recorded of a ${tenant.recordingLimit.toLocaleString("en-IN")}-recording limit`,
        calling ? "The client is still calling, so new calls aren't recorded" : "No calls in the last 24 hours",
      ]);
    }
    if (tenant.trialExpired) add("account_trial_expired", "warning", "Trial expired");
    else if (tenant.trialDaysRemaining !== null && tenant.trialDaysRemaining <= RULES.trialWarningDays) {
      add("account_trial_ending", "warning", `Trial ends in ${n(tenant.trialDaysRemaining, "day")}`);
    }
    if (tenant.licenseOverBy > 0) add("account_license_cap", "warning", `${n(tenant.licenseOverBy, "license")} over the contract cap`);
    if (tenant.storageError) add("account_storage", "warning", "Storage error", [tenant.storageError]);
    if (tenant.migrationFailed > 0) add("account_migration", "warning", `${n(tenant.migrationFailed, "recording")} failed to migrate storage`);
  }
  if (oneApi && !oneApi.linked) add("account_oneapi", "warning", "Not linked to OneAPI");
  else if (oneApi?.backfillRecommended) add("account_oneapi_backfill", "info", "OneAPI backfill recommended");
  if (input.accessSuspended) add("account_suspended", "info", "Access suspended");
  return issues;
}

// ---- Fleet-wide CallAnchor faults ----

// `match` and `drill` must select the same log lines, so a count and its rows agree (QA P2).
export const PLATFORM_FAULTS = [
  {
    kind: "platform_s3_purge",
    title: "CallAnchor isn't deleting recordings from S3 after they sync",
    match: (l: StoredLog) => (l.source === "platform-recording-cleanup" || l.source.startsWith("platform-recording-cleanup.")) && l.message.startsWith("Failed"),
    drill: { kind: "logs", source: "platform-recording-cleanup", starts: "Failed" },
  },
  {
    kind: "platform_normalize",
    title: "Recording normalize-cleanup errors",
    match: (l: StoredLog) => (l.source === "mobile.recording.normalize-cleanup" || l.source.startsWith("mobile.recording.normalize-cleanup.")) && l.severity !== "info",
    drill: { kind: "logs", source: "mobile.recording.normalize-cleanup", problems: "1" },
  },
  {
    kind: "platform_retention",
    title: "Data retention purge errors",
    match: (l: StoredLog) => (l.source === "internal.calls.data-retention-purge" || l.source.startsWith("internal.calls.data-retention-purge.")) && l.severity !== "info",
    drill: { kind: "logs", source: "internal.calls.data-retention-purge", problems: "1" },
  },
] as const;

export function platformIssues(logs: StoredLog[], now: number, windowText = "24 hours"): Issue[] {
  return PLATFORM_FAULTS.flatMap((fault) => {
    const hits = logs.filter(fault.match);
    if (hits.length === 0) return [];
    return [
      issue({ scope: "fleet", clientId: null, licenseId: null }, fault.kind, "info", fault.title, now, {
        impact: 0,
        impactText: `${n(hits.length, "log line")} in ${windowText}`,
        times: hits.map((l) => l.occurredAt),
        evidence: [`${n(new Set(hits.map((l) => l.clientId)).size, "client")} affected. A CallAnchor fault, not the client's`],
        drill: { ...fault.drill },
      }),
    ];
  });
}

// Most clients that usually call going quiet together is CallAnchor (or our pull) stalling, so it's
// raised once for the fleet and the client issues are marked rolled up (QA P1).
export function fleetStall(quiet: Issue[], busyClients: number, now: number): Issue | null {
  if (quiet.length < RULES.stallMinClients || quiet.length / Math.max(1, busyClients) < RULES.stallShare) return null;
  for (const i of quiet) i.rolledUp = true;
  return issue({ scope: "fleet", clientId: null, licenseId: null }, "platform_stall", "critical", "Calls stopped arriving across most clients", now, {
    impact: 0,
    impactText: `${quiet.length} of ${n(busyClients, "busy client")} quiet`,
    times: [],
    evidence: [
      `${quiet.length} clients that usually make ${RULES.quietMinDailyCalls} or more calls a day have sent nothing for ${durationText(RULES.quietMs)} or more`,
      "Usually CallAnchor itself, or our pull falling behind: check the data coverage line first",
    ],
  });
}

// ---- Licenses (section 6) ----

export type LicenseStatus = "critical" | "warning" | "healthy" | "idle";

// How a seat is used. calling: a call within seatUnusedMs. idle: logged in, no call for longer.
// `since` is when it entered that state, when known: the logout, unassignment or last call.
export type SeatState = "calling" | "idle" | "loggedOut" | "unassigned" | "inactive";
export type Seat = { state: SeatState; since: string | null };

export type LicenseHealth = {
  license: StoredLicense;
  status: LicenseStatus;
  issues: Issue[];
  // Baseline rules need a full day of license-linked calls first, from the last agent change.
  learning: boolean;
  baselineSince: string | null;
  // The window its usual calls a day come from: 1, 3 or 7 days; null in its first day.
  windowDays: number | null;
  // The baseline restarted because the phone was given to another agent.
  newAgent: boolean;
  calls24h: number;
  perDay: number | null;
  recorded24h: number;
  uploaded24h: number;
  // The later of its last linked call and the last rise in CallAnchor's lifetime count.
  lastCallAt: string | null;
  pulse: Pulse;
  seat: Seat;
};

export type FleetLicenseContext = {
  // The app version code most logged-in licenses run.
  commonAppCode: number | null;
  // Device models where some license is not recording or has recordings stuck on the phone.
  riskyModels: Map<string, Set<string>>;
};

export type LicenseInput = {
  clientId: string;
  status: string;
  tenant: TenantSummary | null;
  licenses: StoredLicense[];
  calls: StoredCall[];
  open: StoredCall[];
  rows: DayRow[];
  lastSyncs: Map<string, LastSync>;
  clientLastSyncAt: string | null;
  // The last 30 days.
  changes: (LicenseChange & { licenseId: string })[];
  historyStart: string | null;
  perPhone: Set<string>;
};

// Licenses whose issues are judged on their own: when two or more of a client's phones made calls in
// the last 7 days. With one phone, the client's issues already describe it, so rules that would
// repeat them stay at client level (QA L2).
export function perPhoneLicenses(calls: StoredCall[], now: number) {
  const phones = new Set(calls.filter((c) => c.licenseId && ageOf(c, now) <= 7 * DAY).map((c) => c.licenseId!));
  return phones.size >= 2 ? phones : new Set<string>();
}

const MARKED_FIELDS: Record<string, string> = { app_version: "App updated", device_model: "Device changed", member_id: "Agent changed", recording_enabled: "Recording setting changed" };

// Each license's issues and status, before the fleet-wide hints (outdated app, device risk).
export function licenseHealth(input: LicenseInput, now: number): LicenseHealth[] {
  const ctx = clientContext(input.tenant);
  const byLicense = new Map<string, StoredCall[]>();
  for (const c of [...input.calls, ...input.open]) if (c.licenseId) byLicense.set(c.licenseId, [...(byLicense.get(c.licenseId) ?? []), c]);
  const rowsByLicense = new Map<string, DayRow[]>();
  for (const r of input.rows) if (r.licenseId) rowsByLicense.set(r.licenseId, [...(rowsByLicense.get(r.licenseId) ?? []), r]);
  const clientDay = input.calls.filter((c) => c.licenseId && ageOf(c, now) <= DAY);
  const clientActive = input.status !== "inactive";

  return input.licenses.map((license) => {
    const scope: Scope = { scope: "license", clientId: input.clientId, licenseId: license.licenseId };
    const pool = byLicense.get(license.licenseId) ?? [];
    const recent = pool.filter((c) => ageOf(c, now) <= (RULES.baselineDays + 1) * DAY);
    const calls = recent.filter((c) => ageOf(c, now) <= DAY);
    const peers = clientDay.filter((c) => c.licenseId !== license.licenseId);
    const stage = (s: CallStage, list = calls) => list.filter((c) => inStage(s, c, ctx, now));
    const drill = (s: CallStage, window = 1): IssueDrill => ({ kind: "calls", stage: s, ...(window > 1 ? { window: String(window) } : {}) });
    const issues: Issue[] = [];
    const add = (kind: string, level: IssueLevel, title: string, extra?: IssueExtra) => issues.push(issue(scope, kind, level, title, now, extra));
    const own = input.changes.filter((c) => c.licenseId === license.licenseId);
    const perPhone = input.perPhone.has(license.licenseId);

    // A new agent starts a new baseline: the old agent's calls say nothing about the new one (QA L10).
    const reassigned = own.find((c) => c.field === "member_id")?.at ?? null;
    const baselineSince = [input.historyStart, reassigned].filter((t): t is string => !!t).sort().pop() ?? null;
    const seenMs = baselineSince ? now - Date.parse(baselineSince) : 0;
    const windowDays = [...RULES.baselineWindows].reverse().find((d) => seenMs >= d * DAY) ?? null;
    const learning = windowDays === null;
    const perDay = windowDays === null ? null : recent.filter((c) => ageOf(c, now) <= windowDays * DAY).length / windowDays;
    const week = recent.filter((c) => ageOf(c, now) > DAY && (!baselineSince || callTime(c)! >= baselineSince));
    const linked = input.lastSyncs.get(license.licenseId);
    const lastCallAt = [linked?.callAt, license.callsGrewAt].filter((t): t is string => !!t).sort().pop() ?? null;
    const lastSyncAt = linked?.syncAt ?? null;
    const loggedIn = license.isLoggedIn && license.isActive !== false;
    const marks = new Map<string, string[]>();
    for (const c of own) {
      const label = MARKED_FIELDS[c.field];
      if (label) marks.set(istDay(Date.parse(c.at)), [...new Set([...(marks.get(istDay(Date.parse(c.at))) ?? []), label])]);
    }
    const health = pulse({ rows: rowsByLicense.get(license.licenseId) ?? [], calls24h: calls, pool, ctx, now, lastSyncAt, lastCallAt, lastComplete: lastCompleteOf(linked), marks });

    // Not capturing, against its own history and absolute limits; other phones are only a hint (QA L2, L8).
    const silent = now - Date.parse(lastCallAt ?? license.firstSeenAt);
    const peersCalling = peers.some((c) => ageOf(c, now) <= RULES.licenseQuietMs);
    const peerHint = peers.length ? (peersCalling ? "Other phones at this client are calling" : "Other phones at this client are quiet too") : null;
    if (loggedIn && clientActive) {
      if (license.lifetimeCalls === 0) {
        add("license_never_called", "warning", "Logged in but has never made a call", {
          impact: 0,
          times: [],
          evidence: ["CallAnchor's lifetime call count for this license is 0. Check the phone's dialer and call capture settings"],
        });
      } else if (perDay !== null && perDay >= RULES.licenseMinDailyCalls && silent > RULES.licenseQuietMs) {
        add("license_not_capturing", silent > RULES.licenseQuietCriticalMs ? "critical" : "warning", "Phone has stopped capturing calls", {
          impact: 0,
          times: [],
          evidence: [`Usually about ${Math.round(perDay)} calls a day over ${windowDays === 1 ? "its last day" : `its last ${windowDays} days`}; none for ${ageText(silent)}`, ...(peerHint ? [peerHint] : [])],
          drill: drill("all", 7),
        });
      } else if (silent > RULES.noCallWarningMs) {
        add("license_no_calls", "warning", `No call in ${ageText(silent)}`, {
          impact: 0,
          times: [],
          evidence: [
            lastCallAt ? `Last call seen ${istLabel(lastCallAt)}` : `No call seen since the store began tracking this phone, ${istLabel(license.firstSeenAt)}`,
            "Logged in, and has made calls before",
            ...(peerHint ? [peerHint] : []),
          ],
        });
      }
    }

    // Not recording: most connected calls come in not_recorded although recording is on, this phone
    // usually records, or other phones at the client do. Calls that didn't connect count nowhere.
    const connected = (list: StoredCall[]) => list.filter((c) => !isUnconnected(c));
    const [answered, answeredWeek, answeredPeers] = [connected(calls), connected(week), connected(peers)];
    const notRecorded = stage("notRecorded");
    const peerRecorded = answeredPeers.filter(isRecorded).length;
    const peersRecord = answeredPeers.length >= RULES.notRecordingMinCalls && peerRecorded / answeredPeers.length >= 0.5;
    const usuallyRecords = answeredWeek.length >= RULES.notRecordingMinCalls && answeredWeek.filter(isRecorded).length / answeredWeek.length >= 0.5;
    if (answered.length >= RULES.notRecordingMinCalls && notRecorded.length / answered.length > 0.5 && (license.recordingEnabled === true || usuallyRecords || peersRecord)) {
      add("license_not_recording", "critical", "Phone isn't recording calls", {
        calls: notRecorded,
        impactText: `${n(notRecorded.length, "call")} of ${answered.length} that may have connected not recorded`,
        evidence: [
          license.recordingEnabled === true
            ? "Recording is on for this license"
            : usuallyRecords
              ? "This phone recorded most of its connected calls over the last 7 days"
              : `Other phones at this client record ${Math.round((peerRecorded / answeredPeers.length) * 100)}% of their connected calls`,
          `Device: ${[license.deviceBrand, license.deviceModel].filter(Boolean).join(" ") || "unknown"} · app ${license.appVersion ?? "unknown"}`,
        ],
        drill: drill("notRecorded"),
      });
    }

    // Recordings still on the phone, open until uploaded. With one phone, the client's issue covers them.
    const onPhone = stage("onPhone", pool);
    if (perPhone && onPhone.length > 0) {
      add("license_stuck_on_phone", onPhone.length >= RULES.criticalStuck ? "critical" : "warning", "Recordings stuck on the phone", {
        calls: onPhone,
        impactText: openText(onPhone, now, "recording", "not uploaded"),
        evidence: [
          "The phone may be offline, low on storage or restricted in the background",
          stage("verified", peers).length > 0 ? "Other phones at this client upload fine" : "Other phones at this client haven't uploaded either",
        ],
        drill: drill("onPhone", RULES.openLookbackDays),
      });
    }
    const uploadFailed = stage("uploadFailed", pool);
    if (uploadFailed.length > 0) {
      add("license_upload_errors", "warning", "Recording uploads failing", {
        calls: uploadFailed,
        impactText: openText(uploadFailed, now, "recording", "failed to upload"),
        drill: drill("uploadFailed", RULES.openLookbackDays),
      });
    }

    if (perPhone) {
      // This phone's calls stopped reaching the CRM while the client's other phones still sync (QA L3).
      const since = pool.filter((c) => ageOf(c, now) <= 7 * DAY && !isDelivered(c) && inStage("due", c, ctx, now) && (!lastSyncAt || callTime(c)! > lastSyncAt));
      const others = input.clientLastSyncAt && (!lastSyncAt || input.clientLastSyncAt > lastSyncAt);
      const stalled = since.length ? now - Date.parse(since.map(callTime).sort()[0]!) : 0;
      if (others && since.length >= RULES.noSyncMinCalls && stalled > RULES.noSyncWarningMs) {
        // The count is every due call of the week not in the CRM, so it matches the rows it opens.
        const unreached = stage("notReached", pool.filter((c) => ageOf(c, now) <= 7 * DAY));
        add("license_no_sync", stalled > RULES.noSyncCriticalMs ? "critical" : "warning", lastSyncAt ? `No CRM sync since ${istLabel(lastSyncAt)}` : "Calls have never reached the CRM", {
          calls: unreached,
          impactText: `${n(unreached.length, "due call")} not in the CRM in 7 days`,
          evidence: [
            `None of this phone's due calls reached the CRM for ${ageText(stalled)}, while other phones at this client still sync`,
            "Usually the agent's mapping in the CRM, or this phone's data",
            httpCodes(since.filter(isFailed)) || "No CRM reply: the callouts weren't sent",
          ],
          samples: samples(since),
          drill: drill("notReached", 7),
        });
      }

      // CRM rejects this license far more than its peers: points at agent mapping or data.
      const settled = calls.filter((c) => isDelivered(c) || isFailed(c));
      const failed = settled.filter(isFailed);
      const peerSettled = peers.filter((c) => isDelivered(c) || isFailed(c));
      const peerFailed = peerSettled.filter(isFailed);
      if (settled.length >= RULES.minCallsForRate && peerSettled.length >= RULES.minCallsForRate && !issues.some((i) => i.kind === "license_no_sync")) {
        const rate = (failed.length / settled.length) * 100;
        const peerRate = (peerFailed.length / peerSettled.length) * 100;
        if (rate - peerRate >= RULES.rejectGapPoints) {
          add("license_crm_rejects", "warning", "CRM rejects this phone's calls", {
            calls: failed,
            impactText: `${n(failed.length, "call")} not in the CRM`,
            evidence: [`${Math.round(rate)}% of its calls failed against ${Math.round(peerRate)}% for other phones`, httpCodes(failed), "Usually the agent's mapping in the CRM, not the webhook"],
            samples: samples(failed),
            drill: drill("failed"),
          });
        }
      }

      // Against its own past: a slow decline, and syncing on some days but not others (QA L4, L5).
      const before = dayRate(health.days.slice(-8, -1));
      const today = health.reached;
      if (
        today.share !== null && before.rate !== null && today.due >= RULES.minCallsForRate && before.due >= 3 * RULES.minCallsForRate &&
        before.rate - today.share >= RULES.baselineDropPoints && !issues.some((i) => i.kind === "license_no_sync" || i.kind === "license_crm_rejects")
      ) {
        add("license_below_usual", "warning", "Fewer of this phone's calls reaching the CRM than usual", {
          calls: stage("notReached"),
          impactText: `${n(today.due - today.delivered, "due call")} not in the CRM`,
          evidence: [`${today.share}% of ${n(today.due, "due call")} in 24 hours, against ${before.rate}% over the previous 7 days`],
          drill: drill("notReached"),
        });
      }
      if (health.week.active >= RULES.consistencyMinDays && health.week.synced / health.week.active < RULES.consistencyMin) {
        add("license_inconsistent", "warning", `CRM sync on only ${health.week.synced} of ${n(health.week.active, "day")} with calls`, {
          impact: 0,
          times: [],
          evidence: [`A day counts as synced when at least ${RULES.syncedDayRate}% of its due calls reached the CRM`, `Last 30 days: ${health.month.synced} of ${health.month.active}`],
          drill: drill("notReached", 7),
        });
      }
    }

    const late = stage("late");
    if (late.length > 0) {
      add("license_late_syncs", late.length >= RULES.lateWarningCalls ? "warning" : "info", "Calls reach the CRM late", {
        calls: late,
        impactText: `${n(late.length, "call")} more than ${RULES.lateSyncMs / MINUTE} minutes late`,
        evidence: ["Measured from when the call was ready to send"],
        drill: drill("late"),
      });
    }

    // Seat use lives on the Seats tab, not among the issues (owner, 2026-11-05).
    const loggedOutAt = own.find((c) => c.field === "is_logged_in" && c.newValue === "false")?.at ?? null;
    const seat: Seat =
      license.isActive === false
        ? { state: "inactive", since: null }
        : !license.memberId
          ? { state: "unassigned", since: own.find((c) => c.field === "member_id" && !c.newValue)?.at ?? null }
          : !license.isLoggedIn
            ? { state: "loggedOut", since: loggedOutAt }
            : lastCallAt && now - Date.parse(lastCallAt) <= RULES.seatUnusedMs
              ? { state: "calling", since: lastCallAt }
              : { state: "idle", since: lastCallAt };

    const churn = own.filter((c) => (c.field === "is_logged_in" || c.field === "device_model") && now - Date.parse(c.at) <= 7 * DAY);
    if (churn.length >= RULES.churnChanges) {
      add("license_login_churn", "info", "Frequent logouts or device switches", {
        impact: 0,
        times: churn.map((c) => c.at),
        evidence: [`${n(churn.length, "login or device change")} in 7 days`],
      });
    }

    return {
      license,
      status: "healthy",
      issues,
      learning,
      windowDays,
      baselineSince,
      newAgent: reassigned !== null && reassigned === baselineSince,
      calls24h: calls.length,
      perDay,
      recorded24h: stage("recorded").length,
      uploaded24h: stage("uploaded").length,
      lastCallAt,
      pulse: health,
      seat,
    };
  });
}

// Fleet-wide hints, which need every license first: an outdated app and risky device models.
export function fleetLicenseContext(all: LicenseHealth[]): FleetLicenseContext {
  const codes = new Map<number, number>();
  const riskyModels = new Map<string, Set<string>>();
  for (const h of all) {
    if (h.license.isLoggedIn && h.license.appVersionCode !== null) codes.set(h.license.appVersionCode, (codes.get(h.license.appVersionCode) ?? 0) + 1);
    if (h.license.deviceModel && h.issues.some((i) => i.kind === "license_not_recording" || i.kind === "license_stuck_on_phone")) {
      riskyModels.set(h.license.deviceModel, (riskyModels.get(h.license.deviceModel) ?? new Set()).add(h.license.licenseId));
    }
  }
  const common = [...codes.entries()].sort((a, b) => b[1] - a[1])[0];
  return { commonAppCode: common ? common[0] : null, riskyModels };
}

export function finishLicense(h: LicenseHealth, fleet: FleetLicenseContext, now: number): LicenseHealth {
  const { license } = h;
  const scope: Scope = { scope: "license", clientId: license.clientId, licenseId: license.licenseId };
  const issues = [...h.issues];
  if (license.isLoggedIn && fleet.commonAppCode !== null && license.appVersionCode !== null && license.appVersionCode < fleet.commonAppCode) {
    issues.push(issue(scope, "license_outdated_app", "info", "Older app version than most phones", now, { impact: 0, times: [], evidence: [`Runs ${license.appVersion}`] }));
  }
  const others = license.deviceModel ? [...(fleet.riskyModels.get(license.deviceModel) ?? [])].filter((id) => id !== license.licenseId) : [];
  if (others.length > 0) {
    issues.push(
      issue(scope, "license_device_risk", "info", "Device model with known problems", now, {
        impact: 0,
        times: [],
        evidence: [`${n(others.length, "other phone")} on ${license.deviceBrand ?? ""} ${license.deviceModel} ${others.length === 1 ? "is" : "are"} not recording or stuck`],
      }),
    );
  }
  issues.sort(byIssue);
  // Notes don't change the status: a phone with only notes is healthy or idle (QA L13).
  const worst = issues.find((i) => i.level !== "info")?.level as "critical" | "warning" | undefined;
  const calling = h.calls24h > 0 || (h.lastCallAt !== null && now - Date.parse(h.lastCallAt) <= DAY);
  const status: LicenseStatus = worst ?? (license.isLoggedIn && calling ? "healthy" : "idle");
  return { ...h, issues, status };
}

// When most of a client's licenses share a problem, the cause is likely shared, so it's raised once as
// a client issue and the license issues are marked rolled up. Its rows are the affected phones' only.
export function rollUp(clientId: string, licenses: LicenseHealth[], now: number): { issues: Issue[]; licenses: LicenseHealth[] } {
  const relevant = licenses.filter((h) => h.license.isLoggedIn).length || licenses.length;
  const byKind = new Map<string, Issue[]>();
  for (const h of licenses) for (const i of h.issues) if (i.level !== "info") byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const shared = new Set<string>();
  const issues: Issue[] = [];
  for (const [kind, list] of byKind) {
    if (list.length < RULES.rollupMinLicenses || list.length / relevant < RULES.rollupShare) continue;
    shared.add(kind);
    const worst = [...list].sort(byIssue)[0];
    const impact = list.reduce((sum, i) => sum + i.impact, 0);
    const base = issue({ scope: "client", clientId, licenseId: null }, kind, worst.level, `${worst.title}: ${list.length} of ${licenses.length} phones`, now, {
      impact,
      times: [],
      evidence: [`${list.length} of ${licenses.length} licenses show this, so the cause is likely shared: the webhook, an account limit or a settings change`, ...worst.evidence],
      samples: worst.samples,
      drill: worst.drill && { ...worst.drill, licenses: list.map((i) => i.licenseId!).join(",") },
    });
    const hourly = base.hourly.map((_, h) => list.reduce((sum, i) => sum + i.hourly[h], 0));
    const firsts = list.map((i) => i.firstAt).filter((t): t is string => !!t).sort();
    const lasts = list.map((i) => i.lastAt).filter((t): t is string => !!t).sort();
    const trends = new Set(list.map((i) => i.trend));
    issues.push({
      ...base,
      hourly,
      firstAt: firsts[0] ?? null,
      lastAt: lasts[lasts.length - 1] ?? null,
      trend: trends.size === 1 ? worst.trend : trends.has("new") && !trends.has("ongoing") ? "new" : "ongoing",
      impactText: worst.impactText && `${n(impact, "call")} across ${list.length} phones`,
    });
  }
  return {
    issues,
    licenses: licenses.map((h) => (h.issues.some((i) => shared.has(i.kind)) ? { ...h, issues: h.issues.map((i) => (shared.has(i.kind) ? { ...i, rolledUp: true } : i)) } : h)),
  };
}
