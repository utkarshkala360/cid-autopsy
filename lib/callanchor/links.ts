// How CallAnchor's three event streams link to each other: mobile logs (support/logs), CRM callouts
// (callout-logs) and portal events (support/audit-logs). Pure functions with no imports, so the store
// and one-off backfill scripts share them.

// What a CRM callout's payload says about its call. callout-logs returns the payload as
// `payloadPreview`, a JSON string that can be cut short, so fields are read one by one. The recording
// URL is a signed link and is never read; the agent's number is kept to its last 4 digits.
export type CallFacts = {
  hasRecording: boolean | null;
  // outgoing, incoming, missed or rejected, as mobile.call.create spells it.
  callType: string | null;
  seconds: number | null;
  startedAt: string | null;
  agentLast4: string | null;
};

const field = (preview: string, name: string) =>
  new RegExp(`"${name}":\\s*("(?:[^"\\\\]|\\\\.)*"|-?\\d+|true|false|null)`).exec(preview)?.[1] ?? null;
const text = (value: string | null) => (value?.startsWith('"') ? value.slice(1, -1) : null);

export function callFacts(preview: string | null | undefined): CallFacts | null {
  if (!preview) return null;
  const hasRecording = field(preview, "hasRecording");
  const seconds = field(preview, "durationSeconds");
  const startedAt = text(field(preview, "startedAt"));
  const digits = text(field(preview, "agentNumber"))?.replace(/\D/g, "") ?? "";
  return {
    hasRecording: hasRecording === "true" ? true : hasRecording === "false" ? false : null,
    callType: text(field(preview, "callType"))?.toLowerCase() || null,
    seconds: seconds && /^\d+$/.test(seconds) ? Number(seconds) : null,
    startedAt: startedAt && !Number.isNaN(Date.parse(startedAt)) ? startedAt : null,
    agentLast4: digits.length >= 4 ? digits.slice(-4) : null,
  };
}

// A portal event (support/audit-logs), as stored.
export type AuditEntry = {
  id: string;
  clientId?: string | null;
  actorType?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
};

// The license, integration and callout a portal event is about. A license change names the license
// as its resource; a mobile session carries metadata.licenseId; integration changes and deliveries
// carry metadata.platformSlug; a callout resync names the callout log in metadata.logId.
export function auditLinks(entry: AuditEntry) {
  const meta = entry.metadata ?? {};
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    licenseId: entry.resourceType === "license" ? str(entry.resourceId) : str(meta.licenseId),
    platformId: str(meta.platformSlug),
    calloutLogId: entry.resourceType === "callout_resync" ? str(meta.logId) : null,
  };
}
