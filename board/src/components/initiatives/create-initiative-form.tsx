"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// ORG-5: name + optional description. Creatable by any Team Admin or Org
// Admin — enforced server-side by requireAnyTeamAdmin (same as Customer).
export function CreateInitiativeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/dashboard/board/api/initiatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setName("");
    setDescription("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Initiative name (e.g. Q4 Launch)"
          required
          className={inputClass}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className={inputClass}
        />
      </div>
      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Create Initiative
      </button>
    </form>
  );
}
