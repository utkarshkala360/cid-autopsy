"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";

// Phase 16 (Design 3): a template picker at Team-creation time — previously
// every Team was created as "task" and had to be switched afterward via the
// Template column on this same page. `templates` comes from the parent
// server component (live WorkItemTemplateDef registry), same "server
// fetches, client renders" split TeamRow now uses.
export function CreateTeamForm({ templates }: { templates: { key: string; label: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [primaryWorkItemType, setPrimaryWorkItemType] = useState(templates[0]?.key ?? "task");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/dashboard/board/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, primaryWorkItemType }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setName("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <div className="flex-1 min-w-[200px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New Team name (e.g. QA)"
          required
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="mt-1.5 text-xs font-medium text-status-blocked">{error}</p>}
      </div>
      <Select
        value={primaryWorkItemType}
        onValueChange={setPrimaryWorkItemType}
        className="h-9 w-40 rounded-md border border-border bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {templates.map((t) => (
          <SelectOption key={t.key} value={t.key}>
            {t.label}
          </SelectOption>
        ))}
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Create Team
      </button>
    </form>
  );
}
