"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X, Pencil, ArrowUpRight } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";

// WT-1/WT-2 (Phase 16, Design 3): the template list is now a live,
// Org-Admin-managed registry (WorkItemTemplateDef), not a fixed const array
// — this client component can no longer import it directly (the lib is now
// server-only), so its parent (settings/teams/page.tsx) fetches it once and
// passes it down as a prop, same "server fetches, client renders" split
// every other registry-backed picker in this app already uses.
export function TeamRow({
  teamId,
  name,
  slug,
  active,
  primaryWorkItemType,
  templates,
}: {
  teamId: string;
  name: string;
  slug: string;
  active: boolean;
  primaryWorkItemType: string;
  templates: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 w-full max-w-[220px] rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              aria-label="Save name"
              onClick={async () => {
                if (await patch({ name: draftName })) setEditing(false);
              }}
              className="rounded-md p-1 text-status-done hover:bg-status-done-bg"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel"
              onClick={() => {
                setDraftName(name);
                setEditing(false);
              }}
              className="rounded-md p-1 text-slate hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{name}</span>
            <button
              type="button"
              aria-label="Rename team"
              onClick={() => setEditing(true)}
              className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs font-medium text-status-blocked">{error}</p>}
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-slate">{slug}</td>
      <td className="py-3 pr-4">
        <Select
          value={primaryWorkItemType}
          disabled={isPending}
          onValueChange={(v) => patch({ primaryWorkItemType: v })}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {templates.map((t) => (
            <SelectOption key={t.key} value={t.key}>
              {t.label}
            </SelectOption>
          ))}
        </Select>
      </td>
      <td className="py-3 pr-4">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            active
              ? "bg-status-done-bg text-status-done"
              : "bg-status-todo-bg text-status-todo"
          }`}
        >
          {active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => patch({ active: !active })}
            className="text-xs font-medium text-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {active ? "Deactivate" : "Activate"}
          </button>
          <Link
            href={`/dashboard/board/settings/teams/${teamId}/members`}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-primary"
          >
            Manage
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
