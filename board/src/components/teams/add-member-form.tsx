"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { TEAM_ROLES, type TeamRole } from "@board/lib/team-roles";
import { Select, SelectOption } from "@board/components/ui/select";

export function AddMemberForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`/dashboard/board/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setEmail("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <div className="flex-1 min-w-[220px]">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="member@company.com"
          required
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {error && <p className="mt-1.5 text-xs font-medium text-status-blocked">{error}</p>}
      </div>
      <Select
        value={role}
        onValueChange={(v) => setRole(v as TeamRole)}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {TEAM_ROLES.map((r) => (
          <SelectOption key={r} value={r}>
            {r[0].toUpperCase() + r.slice(1)}
          </SelectOption>
        ))}
      </Select>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add to Team
      </button>
    </form>
  );
}
