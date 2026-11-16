import type { Drill, Level } from "@/lib/callanchor/health";
import type { DayState, IssueLevel, LicenseStatus, Trend } from "@/lib/callanchor/issues";

// Times show in IST, the zone CallAnchor's own labels use.
const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const hour = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

export const formatTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const formatDay = (iso: string) => day.format(new Date(iso));
export const formatHour = (iso: string) => hour.format(new Date(iso));
export const int = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

export function ago(iso: string | null | undefined, now: number) {
  if (!iso) return "never";
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// Status colours always come with an icon and a word, never colour alone.
export const LEVELS: Record<Level, { label: string; icon: string; className: string }> = {
  critical: { label: "Critical", icon: "✕", className: "bg-red-50 text-red-700 ring-red-200" },
  warning: { label: "Warning", icon: "!", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  healthy: { label: "Healthy", icon: "✓", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  idle: { label: "Idle", icon: "–", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  unknown: { label: "Unknown", icon: "?", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const FLAG_TEXT = { critical: "text-red-700", warning: "text-amber-800", info: "text-slate-600" } as const;

export const ISSUE_LEVELS: Record<IssueLevel, { label: string; icon: string; className: string; card: string }> = {
  critical: { label: "Critical", icon: "✕", className: LEVELS.critical.className, card: "border-red-200 border-l-red-600" },
  warning: { label: "Warning", icon: "!", className: LEVELS.warning.className, card: "border-amber-200 border-l-amber-500" },
  info: { label: "Info", icon: "i", className: "bg-sky-50 text-sky-800 ring-sky-200", card: "border-slate-200 border-l-sky-500" },
};

export const LICENSE_STATUSES: Record<LicenseStatus, { label: string; icon: string; className: string }> = {
  critical: { ...LEVELS.critical },
  warning: { ...LEVELS.warning },
  healthy: { ...LEVELS.healthy },
  idle: { ...LEVELS.idle },
};

export const STATUS_RANK: Record<LicenseStatus, number> = { critical: 0, warning: 1, healthy: 2, idle: 3 };

export const TRENDS: Record<Trend, string> = { new: "New", ongoing: "Ongoing", fading: "Fading", state: "Current state" };

// One day of CRM sync, as a cell of a day strip. Each state has its own icon and word too.
export const DAY_STATES: Record<DayState, { label: string; icon: string; className: string }> = {
  synced: { label: "Synced", icon: "✓", className: "bg-emerald-600 text-white" },
  partial: { label: "Partly synced", icon: "!", className: "bg-amber-400 text-amber-950" },
  failed: { label: "Nothing synced", icon: "✕", className: "bg-red-600 text-white" },
  quiet: { label: "Calls, none due at the CRM", icon: "·", className: "bg-slate-200 text-slate-500" },
  none: { label: "No calls", icon: "", className: "bg-slate-100 text-slate-300" },
};

// How long ago, as "since 3 Nov, 09:40 (5 h ago)".
export const since = (iso: string | null | undefined, now: number) => (iso ? `${formatTime(iso)} (${ago(iso, now)})` : "—");

export function rateClass(rate: number | null) {
  if (rate === null) return "text-slate-400";
  if (rate < 80) return "font-semibold text-red-700";
  if (rate < 95) return "font-semibold text-amber-800";
  return "text-slate-700";
}

// Where everything lives. A client's pages sit under it: /health/clients/<client>/… holds its health,
// licenses (and each phone), seats, calls, issues and items, so the URL, breadcrumb and tabs all say
// where you are (owner, 2026-11-13). Without a client a link goes to the flat route, which looks the
// client up and redirects, or to the fleet-wide view.
export const clientHref = (basePath: string, clientId: string) => `${basePath}/clients/${encodeURIComponent(clientId)}`;
const scoped = (basePath: string, clientId?: string | null) => (clientId ? clientHref(basePath, clientId) : basePath);

// Links into the item views. `scope` narrows to one client and sets the window, in days; without one,
// a drill's own window applies. `issue` shows that issue's evidence above the rows.
export function itemsHref(basePath: string, drill: Drill, scope: { client?: string; window?: number; issue?: string } = {}) {
  const query = new URLSearchParams({
    ...drill,
    window: String(scope.window ?? (Number(drill.window) || 1)),
    ...(scope.issue ? { issue: scope.issue } : {}),
  });
  return `${scoped(basePath, scope.client)}/items?${query}`;
}

// `back` is the items list the call was opened from, for the breadcrumb (QA U3).
export const callHref = (basePath: string, callId: string, back?: string, clientId?: string | null) =>
  `${scoped(basePath, clientId)}/calls/${encodeURIComponent(callId)}${back ? `?${new URLSearchParams({ back })}` : ""}`;
export const licenseHref = (basePath: string, licenseId: string, clientId?: string | null) => `${scoped(basePath, clientId)}/licenses/${encodeURIComponent(licenseId)}`;
export const issueHref = (basePath: string, issueId: string, clientId?: string | null) => `${scoped(basePath, clientId)}/issues/${encodeURIComponent(issueId)}`;

// ---- Colour by severity and CRM status code (owner, 2026-11-13) ----
// Standard notation: red a problem, amber worth a look, green went well, sky information, grey a plain
// count. Filter chips are tinted in their colour, and filled with it when picked.
export type Tone = "red" | "amber" | "green" | "sky" | "slate";
const TONES: Record<Tone, { chip: string; on: string; badge: string }> = {
  red: { chip: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100", on: "border-red-600 bg-red-600 text-white", badge: "bg-red-50 text-red-700 ring-red-200" },
  amber: { chip: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100", on: "border-amber-500 bg-amber-500 text-white", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  green: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", on: "border-emerald-600 bg-emerald-600 text-white", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  sky: { chip: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100", on: "border-sky-600 bg-sky-600 text-white", badge: "bg-sky-50 text-sky-800 ring-sky-200" },
  slate: { chip: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50", on: "border-indigo-600 bg-indigo-600 text-white", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
};

// A severity, health level or log severity as a tone.
export function severityTone(value: string | null | undefined): Tone {
  const v = (value ?? "").toLowerCase();
  if (["critical", "error", "fatal", "failed"].includes(v)) return "red";
  if (["warning", "warn"].includes(v)) return "amber";
  if (["healthy", "ok", "delivered", "calling"].includes(v)) return "green";
  if (v === "info") return "sky";
  return "slate";
}

// A CRM reply's HTTP code: 2xx accepted, 4xx refused (the request or its sign-in), 5xx or no reply the
// CRM failing.
export function httpTone(code: number | null): Tone {
  if (code === null) return "red";
  if (code >= 200 && code < 300) return "green";
  if (code >= 500) return "red";
  if (code === 401 || code === 403) return "red";
  if (code >= 400) return "amber";
  return "slate";
}

export const toneChip = (tone: Tone, on: boolean) => `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? TONES[tone].on : TONES[tone].chip}`;
export const toneBadge = (tone: Tone) => `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${TONES[tone].badge}`;
export const toneDot: Record<Tone, string> = { red: "bg-red-500", amber: "bg-amber-500", green: "bg-emerald-500", sky: "bg-sky-500", slate: "bg-slate-300" };
export const toneText: Record<Tone, string> = { red: "text-red-700", amber: "text-amber-800", green: "text-emerald-700", sky: "text-sky-800", slate: "text-slate-500" };
