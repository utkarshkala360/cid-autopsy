"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "./actions";
import { FormMessage } from "@/components/FormMessage";
import { cardClass, inputClass, primaryButtonClass } from "@/components/ui";

export type SettingField = {
  key: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  group: string;
  value: number;
  defaultValue: number;
  // Who last changed it, and when, already formatted. Null while it's at its default.
  changed: string | null;
};

export function SettingsForm({ fields }: { fields: SettingField[] }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, undefined);
  const groups = [...new Set(fields.map((f) => f.group))];
  return (
    <form action={formAction} className="mt-4 space-y-4">
      {groups.map((group) => (
        <fieldset key={group} className={`${cardClass} p-4`}>
          <legend className="px-1 text-sm font-semibold text-slate-900">{group}</legend>
          <div className="mt-1 divide-y divide-slate-100">
            {fields
              .filter((f) => f.group === group)
              .map((f) => (
                <div key={f.key} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_9rem_10rem]">
                  <label htmlFor={f.key} className="text-sm text-slate-700">
                    {f.label}
                    <span className="block text-xs text-slate-400">
                      Default {f.defaultValue} {f.suffix}
                      {f.changed && ` · changed by ${f.changed}`}
                    </span>
                  </label>
                  <input
                    id={f.key}
                    name={f.key}
                    type="number"
                    required
                    step="any"
                    min={f.min}
                    max={f.max}
                    defaultValue={f.value}
                    className={`${inputClass} text-right tabular-nums ${f.changed ? "border-indigo-400" : ""}`}
                  />
                  <span className="text-sm text-slate-500">{f.suffix}</span>
                </div>
              ))}
          </div>
        </fieldset>
      ))}
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
