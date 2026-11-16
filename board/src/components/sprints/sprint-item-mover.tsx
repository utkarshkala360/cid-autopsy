"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { StatusPill } from "@board/components/work-items/status-pill";
import type { StatusCategory } from "@board/lib/status-categories";

export type MoverItem = {
  id: string;
  title: string;
  statusLabel: string;
  statusCategory: StatusCategory;
};

// BD-3: "ability to move items in/out of a sprint." A plain two-list
// add/remove control, not drag-and-drop — the requirement is the
// capability, not a specific interaction; this reuses the exact PATCH
// `/dashboard/board/api/teams/{teamId}/work-items/{itemId}` route every other Work Item
// mutation already goes through (Non-Negotiable #6/#9), so a Sprint
// assignment is diffed into ChangeHistory exactly like any other field edit.
export function SprintItemMover({
  teamId,
  sprintId,
  itemHrefBase,
  initialBacklog,
  initialSprintItems,
  disabled = false,
}: {
  teamId: string;
  sprintId: string;
  itemHrefBase: string;
  initialBacklog: MoverItem[];
  initialSprintItems: MoverItem[];
  disabled?: boolean;
}) {
  const [backlog, setBacklog] = useState(initialBacklog);
  const [sprintItems, setSprintItems] = useState(initialSprintItems);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function move(item: MoverItem, target: "sprint" | "backlog") {
    setError(null);
    setBusyId(item.id);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamInitiativeId: target === "sprint" ? sprintId : null }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't move that item.");
      return;
    }
    if (target === "sprint") {
      setBacklog((prev) => prev.filter((i) => i.id !== item.id));
      setSprintItems((prev) => [...prev, item]);
    } else {
      setSprintItems((prev) => prev.filter((i) => i.id !== item.id));
      setBacklog((prev) => [...prev, item]);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
          In this Sprint ({sprintItems.length})
        </div>
        {sprintItems.length === 0 ? (
          <p className="text-xs text-slate">Nothing assigned yet — add from the backlog below.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {sprintItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                <Link href={`${itemHrefBase}/${item.id}`} className="min-w-0 flex-1 truncate text-xs font-medium text-ink hover:text-primary">
                  {item.title}
                </Link>
                <StatusPill label={item.statusLabel} category={item.statusCategory} />
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.title} from Sprint`}
                    disabled={busyId === item.id}
                    onClick={() => move(item, "backlog")}
                    className="shrink-0 rounded-md p-1 text-slate hover:bg-muted hover:text-status-blocked disabled:opacity-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!disabled && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
            Backlog ({backlog.length})
          </div>
          {backlog.length === 0 ? (
            <p className="text-xs text-slate">Nothing left on the backlog.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {backlog.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <Link href={`${itemHrefBase}/${item.id}`} className="min-w-0 flex-1 truncate text-xs font-medium text-ink hover:text-primary">
                    {item.title}
                  </Link>
                  <StatusPill label={item.statusLabel} category={item.statusCategory} />
                  <button
                    type="button"
                    aria-label={`Add ${item.title} to Sprint`}
                    disabled={busyId === item.id}
                    onClick={() => move(item, "sprint")}
                    className="shrink-0 rounded-md p-1 text-slate hover:bg-muted hover:text-primary disabled:opacity-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
