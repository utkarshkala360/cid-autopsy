"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";
import type { StageDef } from "@board/lib/stage-track-types";

// Design 1 (Phase 16): the macro-stage picker every entity type
// (Customer/Initiative/Team/Work Item) now shares the same shape —
// Org-Admin-only edit, live StageTrack-backed options, "Not set" default.
// Customer/Initiative already had bespoke inline pickers built before this
// phase (customer-detail.tsx/initiative-detail.tsx); this one is reused by
// the two new targets (Team, Work Item) added this phase.
export function MacroStagePicker({
  endpoint,
  stages,
  isOrgAdmin,
  initialValue,
  label = "Macro Stage",
}: {
  endpoint: string;
  stages: StageDef[];
  isOrgAdmin: boolean;
  initialValue: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStage(next: string) {
    setError(null);
    setPending(true);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macroStage: next || null }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setValue(next || null);
    router.refresh();
  }

  const currentLabel = stages.find((s) => s.key === value)?.label ?? "Not set";

  return (
    <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate">{label}</div>
      {isOrgAdmin ? (
        <Select
          value={value ?? ""}
          onValueChange={setStage}
          placeholder="Not set"
          disabled={pending}
          className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stages.map((s) => (
            <SelectOption key={s.key} value={s.key}>
              {s.label}
            </SelectOption>
          ))}
        </Select>
      ) : (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {currentLabel}
        </span>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-status-blocked">{error}</p>}
    </div>
  );
}
