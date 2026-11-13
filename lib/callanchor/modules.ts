// Issues and errors are grouped by the part of the system they sit in (owner, 2026-11-13): the CRM
// and its integrations, the device (phone and app), the CallAnchor portal (platform and account),
// and usage (clients and phones not calling).
export const MODULES = {
  crm: { label: "CRM", note: "Integrations, syncs and the CRM's replies" },
  device: { label: "Device", note: "The phone and the app: capturing, recording, uploading" },
  portal: { label: "Portal", note: "CallAnchor itself: the platform, account limits and settings" },
  usage: { label: "Usage", note: "Clients and phones that stopped calling or never started" },
} as const;
export type IssueModule = keyof typeof MODULES;

const DEVICE_KINDS = new Set([
  "recordings_waiting",
  "license_not_capturing",
  "license_not_recording",
  "license_stuck_on_phone",
  "license_upload_errors",
  "license_login_churn",
  "license_outdated_app",
  "license_device_risk",
]);
const USAGE_KINDS = new Set(["client_quiet", "license_never_called", "license_no_calls"]);
const PORTAL_KINDS = new Set(["recordings_stuck", "recording_mislabeled", "trial_skipped"]);

export function issueModule(kind: string): IssueModule {
  if (DEVICE_KINDS.has(kind)) return "device";
  if (USAGE_KINDS.has(kind)) return "usage";
  if (PORTAL_KINDS.has(kind) || kind.startsWith("platform_")) return "portal";
  // account_health_check_* and account_no_integration are about the CRM integration.
  if (kind.startsWith("account_") && !kind.startsWith("account_health_check_") && kind !== "account_no_integration") return "portal";
  return "crm";
}
