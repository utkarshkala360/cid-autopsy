"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// BD-3: opt-in per Team, off by default — this toggle is the entire
// mechanism. On: Sprint Planning/detail pages and the Sprint field on a
// Work Item become reachable. Off: none of that UI renders anywhere,
// exactly the "never see Sprint UI at all" requirement for Teams that
// don't use it.
export function SprintSettingsToggle({
  teamId,
  initialEnabled,
}: {
  teamId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function toggle() {
    setError(null);
    setIsSubmitting(true);
    const next = !enabled;
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/sprint-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintsEnabled: next }),
    });
    setIsSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setEnabled(next);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isSubmitting}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-panel shadow-xs transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium text-ink">
        {enabled ? "Sprints are on" : "Sprints are off"}
      </span>
      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
    </div>
  );
}
