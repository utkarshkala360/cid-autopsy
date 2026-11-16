"use client";

import { useState } from "react";
import { UserPlus, X, Users } from "lucide-react";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";

export type CollaboratorView = { id: string; name: string; email: string };

// Any active Org Member can be added — this only subscribes them to
// notifications on this Work Item's status/assignment changes (same reach
// and same "notify, don't grant access" behavior as an @mention). It does
// NOT grant view access; someone outside the Team still needs a Guest grant
// to open the item (see GuestAccessPanel for that).
export function CollaboratorsPanel({
  endpoint,
  initialCollaborators,
}: {
  endpoint: string;
  initialCollaborators: CollaboratorView[];
}) {
  const [collaborators, setCollaborators] = useState(initialCollaborators);
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
    setCollaborators((prev) => {
      const withoutExisting = prev.filter((c) => c.id !== data.collaborator.id);
      return [...withoutExisting, data.collaborator];
    });
    setEmail("");
  }

  async function remove(memberId: string) {
    setError(null);
    const res = await fetch(`${endpoint}/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setCollaborators((prev) => prev.filter((c) => c.id !== memberId));
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
        <Users className="h-3.5 w-3.5" />
        Collaborators
      </div>
      <p className="mb-3 text-xs text-slate">
        Collaborators get notified on status and assignment changes, same as the assignee and
        reporter — but adding one doesn&apos;t grant them access on its own.
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
          Add
        </button>
      </form>
      {error && <p className="mb-2 text-xs font-medium text-status-blocked">{error}</p>}

      {collaborators.length === 0 ? (
        <p className="text-xs text-slate">No Collaborators yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5">
              <div>
                <MemberHoverCard name={c.name} email={c.email}>
                  <div className="text-xs font-medium text-ink">{c.name}</div>
                </MemberHoverCard>
                <div className="text-[11px] text-slate">{c.email}</div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${c.name} as a Collaborator`}
                onClick={() => remove(c.id)}
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
