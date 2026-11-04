import type { Drill, Level } from "@/lib/callanchor/health";

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

export function rateClass(rate: number | null) {
  if (rate === null) return "text-slate-400";
  if (rate < 80) return "font-semibold text-red-700";
  if (rate < 95) return "font-semibold text-amber-800";
  return "text-slate-700";
}

// Links into the item views. `scope` narrows to one client and sets the window, in days.
export function itemsHref(basePath: string, drill: Drill, scope: { client?: string; window?: number } = {}) {
  const query = new URLSearchParams({ ...drill, ...(scope.client ? { client: scope.client } : {}), window: String(scope.window ?? 1) });
  return `${basePath}/items?${query}`;
}

export const callHref = (basePath: string, callId: string) => `${basePath}/calls/${encodeURIComponent(callId)}`;
