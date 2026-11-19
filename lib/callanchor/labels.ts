// Turns CallAnchor's raw text into stable, PII-free labels, so identical outcomes group together.

// Removes ids, numbers, emails, ARNs and URLs.
export function mask(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/arn:aws:[^\s"]+/g, "<arn>")
    .replace(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9_-]{15,}\b/g, "<id>")
    .replace(/\+?\d[\d\s-]{3,}\d/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function messageOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const message = messageOf(v.message) ?? messageOf(v.error_description) ?? messageOf(v.error) ?? messageOf(v.details);
  if (typeof v.code === "string") return message ? `${v.code}: ${message}` : v.code;
  return message;
}

type Delivery = { status: string; httpStatus?: number | null; errorMessage?: string; responsePreview?: string };

function errorLabel(event: Delivery) {
  const raw = event.errorMessage ?? "";
  let text = raw;
  try {
    text = messageOf(JSON.parse(raw)) ?? raw;
  } catch {
    // Plain text, or JSON cut short by CallAnchor's preview: take its message if there is one.
    text = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)/)?.[1] ?? raw;
  }
  // Salesforce quotes the rejected value, which can be an agent's free-text note.
  text = text.replace(/(data value too large):.*/i, "$1");
  return mask(text).slice(0, 180) || `HTTP ${event.httpStatus ?? "no response"}, no error message`;
}

// What the CRM sent back on success: the shape of its reply, not the values.
function replyLabel(event: Delivery) {
  if (!event.responsePreview) return "Empty reply";
  try {
    const reply = JSON.parse(event.responsePreview);
    if (reply && typeof reply === "object" && !Array.isArray(reply)) {
      return `Reply with ${Object.keys(reply).sort().join(", ") || "no fields"}`;
    }
    return `Reply: ${Array.isArray(reply) ? "list" : typeof reply}`;
  } catch {
    return "Non-JSON reply";
  }
}

// Failures by their error, everything else by the shape of the reply.
export const deliveryLabel = (event: Delivery) => (event.status === "failed" ? errorLabel(event) : replyLabel(event));

// A callout reached the CRM only when CallAnchor marked it delivered, which needs a CRM record id in
// the reply. A 2xx without one is a failure: the CRM may have skipped the call (owner, 2026-11-13,
// replacing the 2xx rule of 2026-11-04). CRM_STATUS_SQL, and ca_refresh_calls and ca_events in
// db/schema.sql, must agree.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const crmStatus = (status: string, _httpStatus: number | null) => status;
export const CRM_STATUS_SQL = "status";

// A sign-in failure is HTTP 401 or 403. Reply text is each client's own code, so words like
// "unauthorized" in it aren't reliable (finding F, owner 2026-11-04). One exception (owner,
// 2026-11-19): when CallAnchor can't get a CRM token at all, it sends nothing, so the callout has no
// HTTP code, and its error starts with CallAnchor's own words, not the client's: "OAuth token request
// failed" (Salesforce invalid_grant, app_not_found). That's a sign-in failure, not a CRM outage.
const SIGN_IN_PREFIX = "OAuth token request failed";
export const isSignInFailure = (httpStatus: number | null, label: string | null | undefined) => httpStatus === null && !!label?.startsWith(SIGN_IN_PREFIX);
export const isAuthFailure = (httpStatus: number | null, label?: string | null) => httpStatus === 401 || httpStatus === 403 || isSignInFailure(httpStatus, label);
// The same test on ca_callout_events.
export const AUTH_SQL = `(http_status IN (401, 403) OR (http_status IS NULL AND label LIKE '${SIGN_IN_PREFIX}%'))`;

// Why the phone had no recording, in plain words, from the reason code in CallAnchor's
// mark-unavailable log (owner, 2026-11-19); else CallAnchor's own message.
const UNAVAILABLE_CODES: Record<string, string> = {
  GOOGLE_DIALER_NO_RECORDING: "the Google Phone app didn't record the call: turn on call recording in the Google Phone app on this phone",
  RECORDING_FILE_NOT_FOUND: "no recording file was found on the phone: check call recording is on in the phone's dialer and the app has storage access",
  CAPTURE_SKIPPED: "recording was skipped by the call capture policy",
};
export const unavailableText = (code: string | null | undefined, message: string | null | undefined) =>
  (code && UNAVAILABLE_CODES[code]) || message || (code ? code.toLowerCase().replace(/_/g, " ") : null);

// The trusted part of a CRM reply: its HTTP class.
export type HttpClass = "2xx" | "4xx" | "5xx" | "no response" | "other";
export function httpClass(httpStatus: number | null): HttpClass {
  if (httpStatus === null) return "no response";
  if (httpStatus >= 200 && httpStatus < 300) return "2xx";
  if (httpStatus >= 400 && httpStatus < 500) return "4xx";
  if (httpStatus >= 500) return "5xx";
  return "other";
}

// A license's phone as shown everywhere: the full number (owner, 2026-11-13), or its last 4 digits on
// a row saved before full numbers were kept, until the next client list pull fills it in.
export const phoneText = (l: { number?: string | null; last4: string | null } | null | undefined) =>
  l?.number || (l?.last4 ? `…${l.last4}` : "Unknown phone");

// The agent shown with a phone wherever its number shows (owner, 2026-11-13, restated 2026-11-19):
// the assigned agent's name, "Unassigned" when the seat has no agent, or null when not yet pulled.
export const agentText = (l: { agentName?: string | null; memberId?: string | null } | null | undefined) =>
  l?.agentName || (l && l.memberId === null ? "Unassigned" : null);
