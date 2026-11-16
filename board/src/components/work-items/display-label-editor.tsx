"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ORG-8: what a Work Item is called in this Team's UI. Renaming here never
 * touches WorkItem.type or any API field name — it's read live
 * (labelForTeam) everywhere the label shows up: list/board headers, the
 * detail page, empty states, and notifications.
 */
export function DisplayLabelEditor({
  teamId,
  initialLabel,
  defaultLabel,
}: {
  teamId: string;
  initialLabel: string | null;
  defaultLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function save(nextValue: string | null) {
    setError(null);
    setIsSubmitting(true);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/display-label`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayLabel: nextValue }),
    });
    setIsSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-[220px] flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={defaultLabel}
          maxLength={40}
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="mt-1.5 text-xs font-medium text-status-blocked">{error}</p>}
      </div>
      <button
        type="button"
        disabled={isSubmitting || !value.trim()}
        onClick={() => save(value.trim())}
        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        Save label
      </button>
      {initialLabel && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            setValue("");
            save(null);
          }}
          className="inline-flex h-9 items-center rounded-md border border-border bg-panel px-3 text-xs font-medium text-ink shadow-2xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset to default
        </button>
      )}
    </div>
  );
}
