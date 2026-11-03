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

const AUTH_ERROR = /oauth|invalid_grant|invalid_token|unauthori[sz]ed|scope_mismatch|session expired|token (has )?expired/i;

export const isAuthFailure = (httpStatus: number | null, label: string) => httpStatus === 401 || AUTH_ERROR.test(label);
