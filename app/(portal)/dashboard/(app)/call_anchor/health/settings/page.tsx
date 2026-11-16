import type { Metadata } from "next";
import { loadSettings } from "@/lib/callanchor/health";
import { SETTINGS, settingDefault, settingValue } from "@/lib/callanchor/issues";
import { requireHealthAdmin } from "@/lib/callanchor/session";
import { formatTime } from "../format";
import { SettingsForm, type SettingField } from "./SettingsForm";

export const metadata: Metadata = { title: "Health settings" };

// The thresholds that decide what's flagged, editable by the owner (2026-11-05). Admins only (2026-11-12). Fleet-wide; saved
// values override RULES in lib/callanchor/issues.ts on every load.

export default async function HealthSettingsPage() {
  await requireHealthAdmin();
  const saved = new Map((await loadSettings()).map((s) => [s.key, s]));
  const fields: SettingField[] = SETTINGS.map((s) => {
    const change = saved.get(s.key);
    return {
      key: s.key,
      label: s.label,
      suffix: s.suffix,
      min: s.min,
      max: s.max,
      group: s.group,
      value: Math.round(settingValue(s) * 100) / 100,
      defaultValue: Math.round(settingDefault(s) * 100) / 100,
      changed: change ? `${change.updatedBy}, ${formatTime(change.updatedAt)} IST` : null,
    };
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Client health</h1>
      <p className="mt-3 max-w-3xl text-sm text-slate-500">
        What gets flagged, and when. Times are plain elapsed time, judged day by day, with no working-hours filter. Changes apply to every client and
        phone from the next page load. Set a value back to its default to clear it.
      </p>
      <div>
        <SettingsForm fields={fields} />
      </div>
    </div>
  );
}
