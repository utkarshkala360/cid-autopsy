"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";

const UNIT_LABEL: Record<"off" | "story_points" | "hours_minutes", string> = {
  off: "Off",
  story_points: "Story Points",
  hours_minutes: "Hours & Minutes",
};

/**
 * WL-1: per-Team unit choice. "Off" (null) means the Estimate field and the
 * whole WorkLogPanel are invisible everywhere on this Team's Work Items —
 * same "invisible, not disabled" precedent SprintSettingsToggle already
 * sets. Locked (409) once the Team has logged any time — the route
 * surfaces that as a plain error message, not a disabled control, since a
 * Team Admin should be able to see *why* rather than guess.
 */
export function TimeTrackingUnitEditor({
  teamId,
  initialUnit,
}: {
  teamId: string;
  initialUnit: "story_points" | "hours_minutes" | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<"off" | "story_points" | "hours_minutes">(
    initialUnit ?? "off"
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function save(next: "off" | "story_points" | "hours_minutes") {
    setError(null);
    setIsSubmitting(true);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/time-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeTrackingUnit: next === "off" ? null : next }),
    });
    setIsSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setValue(next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={value}
        onValueChange={(v) => save(v as "off" | "story_points" | "hours_minutes")}
        className="h-9 w-56 rounded-md border border-border bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {(["off", "story_points", "hours_minutes"] as const).map((u) => (
          <SelectOption key={u} value={u} disabled={isSubmitting}>
            {UNIT_LABEL[u]}
          </SelectOption>
        ))}
      </Select>
      {error && <p className="w-full text-xs font-medium text-status-blocked">{error}</p>}
    </div>
  );
}
