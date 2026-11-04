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

// Links into the item views. `scope` narrows to one client and sets the window, in days; without one,
// a drill's own window applies. `issue` shows that issue's evidence above the rows.
export function itemsHref(basePath: string, drill: Drill, scope: { client?: string; window?: number; issue?: string } = {}) {
  const query = new URLSearchParams({
    ...drill,
    ...(scope.client ? { client: scope.client } : {}),
    window: String(scope.window ?? (Number(drill.window) || 1)),
    ...(scope.issue ? { issue: scope.issue } : {}),
  });
  return `${basePath}/items?${query}`;
}

// `back` is the items list the call was opened from, for the breadcrumb (QA U3).
export const callHref = (basePath: string, callId: string, back?: string) =>
  `${basePath}/calls/${encodeURIComponent(callId)}${back ? `?${new URLSearchParams({ back })}` : ""}`;
export const licenseHref = (basePath: string, licenseId: string) => `${basePath}/licenses/${encodeURIComponent(licenseId)}`;
export const issueHref = (basePath: string, issueId: string) => `${basePath}/issues/${encodeURIComponent(issueId)}`;
