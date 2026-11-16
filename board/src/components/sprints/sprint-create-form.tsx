"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DatePicker } from "@board/components/ui/date-picker";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Phase 16 (Design 2, Sprint/Initiative unification): still "create a
// Sprint" from the user's point of view — now a Team-run Initiative under
// the hood (POST /api/initiatives with teamId set), the container the
// former POST /api/teams/[teamId]/sprints route wrote to a since-deleted
// Sprint model.
export function SprintCreateForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const today = new Date();
  const twoWeeksOut = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(isoDate(today));
  const [endDate, setEndDate] = useState(isoDate(twoWeeksOut));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const res = await fetch(`/dashboard/board/api/initiatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamId, sprintGoal: goal, startDate, endDate }),
    });
    setIsSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setName("");
    setGoal("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sprint name (e.g. Sprint 14)"
        required
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary lg:col-span-2"
      />
      <input
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Goal (optional)"
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary lg:col-span-2"
      />
      <DatePicker
        value={startDate}
        onChange={(v) => setStartDate(v ?? "")}
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <DatePicker
        value={endDate}
        onChange={(v) => setEndDate(v ?? "")}
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Create Sprint
      </button>
      {error && <p className="text-xs font-medium text-status-blocked sm:col-span-2 lg:col-span-5">{error}</p>}
    </form>
  );
}
