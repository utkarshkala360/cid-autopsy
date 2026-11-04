"use server";

import { revalidatePath } from "next/cache";
import { loadSettings } from "@/lib/callanchor/health";
import { SETTINGS, settingDefault } from "@/lib/callanchor/issues";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { saveHealthSettings } from "@/lib/callanchor/store";
import { field } from "@/lib/form";
import type { FormState } from "@/components/form-state";

// Pairs where the first must stay below the second, so a warning comes before its critical.
const ORDER: [string, string, string][] = [
  ["noSyncWarningHours", "noSyncCriticalHours", "The no-sync warning must come before its critical"],
  ["phoneSilentDays", "phoneSilentCriticalDays", "The silent-phone warning must come before its critical"],
  ["criticalSuccessRate", "warningSuccessRate", "The critical success rate must be below the warning one"],
];

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { member } = await requireCallAnchorSession(`${HEALTH_PATH}/settings`);
  await loadSettings();
  const values: Record<string, number> = {};
  for (const s of SETTINGS) {
    const value = Number(field(formData, s.key));
    if (!Number.isFinite(value) || value < s.min || value > s.max) return { error: `${s.label}: enter ${s.min} to ${s.max} ${s.suffix}.` };
    values[s.key] = value;
  }
  for (const [low, high, message] of ORDER) if (values[low] >= values[high]) return { error: `${message}.` };

  const changed: Record<string, number> = {};
  const reset: string[] = [];
  for (const s of SETTINGS) {
    if (values[s.key] === settingDefault(s)) reset.push(s.key);
    else changed[s.key] = values[s.key];
  }
  await saveHealthSettings(changed, reset, member.fullName || member.username);
  revalidatePath(HEALTH_PATH, "layout");
  return { success: "Saved. Every health page uses the new values from its next load." };
}
