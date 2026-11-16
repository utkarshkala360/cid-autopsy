"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, UserCog } from "lucide-react";
import { TEAM_ROLES, type TeamRole } from "@board/lib/team-roles";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { Select, SelectOption } from "@board/components/ui/select";

export function MemberRow({
  teamId,
  memberId,
  name,
  email,
  role,
  canEditProfile = false,
}: {
  teamId: string;
  memberId: string;
  name: string;
  email: string;
  role: TeamRole;
  // Org-Admin-only escape hatch into /profile/[memberId] — set a Member's
  // password without knowing their current one (requireSelfOrOrgAdmin).
  canEditProfile?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function changeRole(nextRole: TeamRole) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: nextRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove() {
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <MemberHoverCard name={name} email={email}>
          <div className="font-medium text-ink">{name}</div>
        </MemberHoverCard>
        <div className="text-xs text-slate">{email}</div>
        {error && <p className="mt-1 text-xs font-medium text-status-blocked">{error}</p>}
      </td>
      <td className="py-3 pr-4">
        <Select
          value={role}
          disabled={isPending}
          onValueChange={(v) => changeRole(v as TeamRole)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        >
          {TEAM_ROLES.map((r) => (
            <SelectOption key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </SelectOption>
          ))}
        </Select>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          {canEditProfile && (
            <Link
              href={`/dashboard/board/profile/${memberId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
            >
              <UserCog className="h-3.5 w-3.5" />
              Edit profile
            </Link>
          )}
          <button
            type="button"
            aria-label={`Remove ${name} from Team`}
            disabled={isPending}
            onClick={remove}
            className="inline-flex items-center gap-1 text-xs font-medium text-status-blocked hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
