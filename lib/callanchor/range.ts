// Time ranges for the health pages (owner, 2026-11-19): calendar ranges in IST, a day starting at
// midnight IST and a week on Monday, Today by default. Each range is compared with the same number of
// whole dates just before it (dates only, not time: Today against all of yesterday), from the daily
// totals. A plain module, so server pages and the client picker share it.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const IST_OFFSET_MS = 5.5 * HOUR;

export const RANGE_KEYS = ["today", "yesterday", "this-week", "last-week", "7d", "15d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This week",
  "last-week": "Last week",
  "7d": "Last 7 days",
  "15d": "Last 15 days",
  custom: "Custom",
};

export type TimeRange = {
  key: RangeKey;
  from: number;
  to: number;
  // "Today", or "12 Nov, 10:00 – 14 Nov, 18:00" for a custom range.
  label: string;
  // For sentences: "calls today", "calls in the last 7 days".
  inText: string;
  // Server memory key: the same range read twice shares one computation.
  id: string;
  // One cell of a strip or chart: an hour for up to two days, else a day.
  cellMs: number;
  // The dates it's compared with (IST, YYYY-MM-DD) and how they read: "yesterday", "last week".
  prev: { label: string; days: string[] };
  // The query that links back to this range; empty for Today, the default.
  query: Record<string, string>;
  // The custom inputs' values (IST, YYYY-MM-DDTHH:mm).
  input: { from: string; to: string };
};

export const istMidnight = (at: number) => Math.floor((at + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS;
export const istDate = (at: number) => new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
// A moment as a datetime-local value in IST.
export const istInput = (at: number) => new Date(at + IST_OFFSET_MS).toISOString().slice(0, 16);
const INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const fromInput = (value: string | undefined) => (value && INPUT.test(value) ? Date.parse(`${value}:00+05:30`) : Number.NaN);

const labelFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
// `count` whole dates ending the day before `dayStart`.
const datesBefore = (dayStart: number, count: number) => Array.from({ length: count }, (_, i) => istDate(dayStart - (count - i) * DAY));
const datesText = (days: string[]) => {
  const at = (d: string) => dateFormat.format(Date.parse(`${d}T12:00:00+05:30`));
  return days.length === 1 ? at(days[0]) : `${at(days[0])} – ${at(days.at(-1)!)}`;
};

type Query = { range?: string; window?: string; from?: string; to?: string };

// The range a page's query asks for. `retainDays` is how far back calls are stored (SYNC.retainDays):
// a custom range is held inside it. A number in `range` or `window` (older links, and issue links that
// count over a rolling window) is that many days back from now, as a custom range, so its rows match.
export function parseRange(query: Query, now: number, retainDays: number): TimeRange {
  const today = istMidnight(now);
  const monday = today - ((new Date(today + IST_OFFSET_MS).getUTCDay() + 6) % 7) * DAY;
  const earliest = now - retainDays * DAY;
  const asked = query.range ?? (query.window ? query.window : undefined);

  const preset = (key: RangeKey, from: number, to: number, prevDays: string[], prevLabel: string, inText: string): TimeRange => ({
    key,
    from,
    to,
    label: RANGE_LABELS[key],
    inText,
    // With the start date, so a new day doesn't serve yesterday's "Today" from memory.
    id: `${key}:${istDate(from)}`,
    cellMs: to - from <= 2 * DAY ? HOUR : DAY,
    prev: { label: prevLabel, days: prevDays },
    query: key === "today" ? {} : { range: key },
    input: { from: istInput(from), to: istInput(to) },
  });
  const custom = (from: number, to: number): TimeRange => {
    const first = istMidnight(from);
    const count = Math.round((istMidnight(to - 1) - first) / DAY) + 1;
    const days = datesBefore(first, count);
    const input = { from: istInput(from), to: istInput(to) };
    const label = `${labelFormat.format(from)} – ${labelFormat.format(to)}`;
    return {
      key: "custom",
      from,
      to,
      label,
      inText: `from ${label} IST`,
      id: `custom:${input.from}:${input.to}`,
      cellMs: to - from <= 2 * DAY ? HOUR : DAY,
      prev: { label: datesText(days), days },
      query: { range: "custom", ...input },
      input,
    };
  };

  const rolling = asked && /^\d{1,2}$/.test(asked) ? Number(asked) : null;
  if (rolling) {
    const days = Math.min(Math.max(rolling, 1), retainDays);
    const r = custom(now - days * DAY, now);
    return { ...r, label: days === 1 ? "Last 24 hours" : `Last ${days} × 24 hours`, inText: days === 1 ? "in the last 24 hours" : `in the last ${days} × 24 hours` };
  }
  switch (asked) {
    case "yesterday":
      return preset("yesterday", today - DAY, today, datesBefore(today - DAY, 1), "the day before", "yesterday");
    case "this-week":
      return preset("this-week", monday, now, datesBefore(monday, 7), "last week", "this week");
    case "last-week":
      return preset("last-week", monday - 7 * DAY, monday, datesBefore(monday - 7 * DAY, 7), "the week before", "last week");
    case "7d":
      return preset("7d", today - 6 * DAY, now, datesBefore(today - 6 * DAY, 7), "the 7 days before", "in the last 7 days");
    case "15d":
      return preset("15d", today - 14 * DAY, now, datesBefore(today - 14 * DAY, 15), "the 15 days before", "in the last 15 days");
    case "custom": {
      const from = Math.max(fromInput(query.from), earliest);
      const to = Math.min(fromInput(query.to), now);
      if (Number.isFinite(from) && Number.isFinite(to) && from < to) return custom(from, to);
      break;
    }
  }
  return preset("today", today, now, datesBefore(today, 1), "yesterday", "today");
}

// The cells a range splits into: whole hours or days from its start, the last one cut at its end.
export function rangeCells(range: Pick<TimeRange, "from" | "to" | "cellMs">) {
  const count = Math.max(1, Math.ceil((range.to - range.from) / range.cellMs));
  return Array.from({ length: count }, (_, i) => ({ start: range.from + i * range.cellMs, end: Math.min(range.to, range.from + (i + 1) * range.cellMs) }));
}
