/**
 * Full local date + time for a `title` tooltip — pair with any relative
 * ("4h ago") or short exact ("8/15/2026") date display so hovering always
 * reveals the precise local moment, timezone included.
 */
export function fullDateTimeTitle(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  // Locale pinned to "en-US" rather than `undefined` ("whatever the runtime
  // resolves") — this renders on the server for every SSR'd page that shows
  // a due date/timestamp tooltip, and Node's default locale resolution can
  // differ from the browser's, producing different hour formats (24h vs
  // AM/PM) and timezone-name spellings ("GMT+5:30" vs "IST") for the exact
  // same Date. That mismatch fails React hydration. The app has no i18n
  // elsewhere, so a fixed locale costs nothing and guarantees server/client
  // agree byte-for-byte.
  const tzName =
    Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const formatted = d.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "medium",
  });
  return tzName ? `${formatted} ${tzName}` : formatted;
}
