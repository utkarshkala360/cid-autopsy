"use client";

import { useState } from "react";
import { UserPlus, X, UserCog } from "lucide-react";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";

export type GuestGrantView = { id: string; memberName: string; memberEmail: string };

/**
 * MB-3: grant/revoke Guest access to one Work Item or one Initiative.
 * Reused as-is by both — the endpoint is the only thing that differs
 * (POST { email } / DELETE {endpoint}/{grantId}), matching how KanbanBoard
 * was generalized across Task/Ticket in Phase 6 rather than forked.
 */
export function GuestAccessPanel({
  endpoint,
  targetLabel,
  initialGrants,
}: {
  endpoint: string;
  targetLabel: string;
  initialGrants: GuestGrantView[];
}) {
  const [grants, setGrants] = useState(initialGrants);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setIsSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const data = await res.json();
    setGrants((prev) => {
      const withoutExisting = prev.filter((g) => g.memberEmail !== data.grant.memberEmail);
      return [...withoutExisting, data.grant];
    });
    setEmail("");
  }

  async function revoke(grantId: string) {
    setError(null);
    const res = await fetch(`${endpoint}/${grantId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setGrants((prev) => prev.filter((g) => g.id !== grantId));
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
        <UserCog className="h-3.5 w-3.5" />
        Guest Access
      </div>
      <p className="mb-3 text-xs text-slate">
        Members granted Guest access can view and comment on this {targetLabel} without joining the
        Team — nothing else in this Team is visible to them (MB-3/MB-4).
      </p>

      <form onSubmit={handleSubmit} className="mb-3 flex flex-wrap items-start gap-2">
        <input
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="member@company.com"
          required
          className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Grant access
        </button>
      </form>
      {error && <p className="mb-2 text-xs font-medium text-status-blocked">{error}</p>}

      {grants.length === 0 ? (
        <p className="text-xs text-slate">No Guests have access yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between py-1.5">
              <div>
                <MemberHoverCard name={g.memberName} email={g.memberEmail}>
                  <div className="text-xs font-medium text-ink">{g.memberName}</div>
                </MemberHoverCard>
                <div className="text-[11px] text-slate">{g.memberEmail}</div>
              </div>
              <button
                type="button"
                aria-label={`Revoke Guest access for ${g.memberName}`}
                onClick={() => revoke(g.id)}
                className="rounded-md p-1 text-slate hover:bg-muted hover:text-status-blocked"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
