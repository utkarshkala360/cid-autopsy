"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Plus, X, ShieldAlert } from "lucide-react";
import { StatusPill } from "@board/components/work-items/status-pill";
import { LINK_FORM_OPTIONS } from "@board/lib/link-types";
import type { StatusCategory } from "@board/lib/status-categories";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { Select, SelectOption } from "@board/components/ui/select";
import { toast } from "sonner";

export type LinkedItem = {
  linkId: string;
  relationLabel: string;
  viewable: boolean;
  item: {
    id: string;
    title: string;
    type: string;
    teamId: string;
    teamName: string;
    statusLabel: string;
    statusCategory: StatusCategory;
  } | null;
};

type TeamOption = { _id: string; name: string; active: boolean };
type WorkItemOption = { _id: string; title: string };

const inputClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// ORG-6: cross-team linking — "visible and navigable from either Work
// Item." Links are server-fetched by the page (initialLinks, same pattern
// as WorkItemDetail's initialHistory) and only refetched client-side after
// a mutation — no mount-time effect. The add-link form's Team → Work Item
// pickers fetch on user interaction (opening the form / picking a Team),
// not on mount, and only ever offer Teams/items the current Member can
// view, since the underlying GETs are gated the same way as everywhere
// else (requireTeamRole).
export function WorkItemLinksPanel({
  teamId,
  itemId,
  canEdit,
  initialLinks,
}: {
  teamId: string;
  itemId: string;
  canEdit: boolean;
  initialLinks: LinkedItem[];
}) {
  const [links, setLinks] = useState<LinkedItem[]>(initialLinks);

  const [adding, setAdding] = useState(false);
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [targetItems, setTargetItems] = useState<WorkItemOption[]>([]);
  const [targetItemId, setTargetItemId] = useState("");
  const [relation, setRelation] = useState(LINK_FORM_OPTIONS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function openAdd() {
    setAdding(true);
    if (teams) return;
    const res = await fetch("/dashboard/board/api/teams");
    if (!res.ok) return;
    const data = await res.json();
    setTeams((data.teams ?? []).filter((t: TeamOption) => t.active));
  }

  async function selectTargetTeam(id: string) {
    setTargetTeamId(id);
    setTargetItemId("");
    setTargetItems([]);
    if (!id) return;
    const res = await fetch(`/dashboard/board/api/teams/${id}/work-items`);
    if (!res.ok) return;
    const data = await res.json();
    setTargetItems((data.workItems ?? []).filter((w: { _id: string }) => w._id !== itemId));
  }

  async function addLink() {
    if (!targetItemId) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${itemId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetItemId, relation }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const data = await res.json();
    setLinks(data.links);
    setAdding(false);
    setTargetTeamId("");
    setTargetItemId("");
  }

  async function removeLink() {
    if (!removeTargetId) return;
    setRemoving(true);
    const res = await fetch(
      `/dashboard/board/api/teams/${teamId}/work-items/${itemId}/links/${removeTargetId}`,
      { method: "DELETE" }
    );
    setRemoving(false);
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.linkId !== removeTargetId));
      toast.success("Link removed.");
    } else {
      toast.error("Could not remove that link.");
    }
    setRemoveTargetId(null);
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
          Linked Work Items
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Link
          </button>
        )}
      </div>

      {links.length === 0 && !adding ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-slate mb-2">
            <Link2 className="h-4 w-4" />
          </div>
          <p className="text-xs text-slate">No linked Work Items yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => (
            <li key={link.linkId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-slate">{link.relationLabel}: </span>
                {link.viewable && link.item ? (
                  <>
                    <Link
                      href={`/dashboard/board/teams/${link.item.teamId}/work-items/${link.item.id}`}
                      className="text-sm font-medium text-ink hover:text-primary"
                    >
                      {link.item.title}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-slate">{link.item.teamName}</span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-slate">
                    <ShieldAlert className="h-3 w-3" />
                    Restricted Work Item — no access to its Team
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {link.viewable && link.item && (
                  <StatusPill label={link.item.statusLabel} category={link.item.statusCategory} />
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Remove link"
                    onClick={() => setRemoveTargetId(link.linkId)}
                    className="rounded-md p-1 text-slate hover:bg-status-blocked-bg hover:text-status-blocked"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ink">Relation</label>
              <Select value={relation} onValueChange={setRelation} className={inputClass}>
                {LINK_FORM_OPTIONS.map((o) => (
                  <SelectOption key={o.value} value={o.value}>
                    {o.label}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ink">Team</label>
              <Select
                value={targetTeamId}
                onValueChange={selectTargetTeam}
                placeholder="Select a Team…"
                className={`${inputClass} w-36`}
              >
                {(teams ?? []).map((t) => (
                  <SelectOption key={t._id} value={t._id}>
                    {t.name}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ink">Work Item</label>
              <Select
                value={targetItemId}
                onValueChange={setTargetItemId}
                disabled={!targetTeamId}
                placeholder={targetTeamId ? "Select a Work Item…" : "Pick a Team first"}
                className={`${inputClass} w-48 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {targetItems.map((w) => (
                  <SelectOption key={w._id} value={w._id}>
                    {w.title}
                  </SelectOption>
                ))}
              </Select>
            </div>
          </div>

          {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!targetItemId || pending}
              onClick={addLink}
              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Linking…" : "Add link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
                setTargetTeamId("");
                setTargetItemId("");
              }}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={removeTargetId !== null}
        onOpenChange={(open) => !open && setRemoveTargetId(null)}
        title="Remove this link?"
        description="The linked Work Item itself is not affected."
        confirmLabel="Remove"
        destructive
        pending={removing}
        onConfirm={removeLink}
      />
    </div>
  );
}
