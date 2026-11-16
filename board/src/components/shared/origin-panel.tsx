"use client";

import { useState } from "react";
import Link from "next/link";
import { GitBranch, X, ShieldAlert } from "lucide-react";
import { ORIGIN_KIND_LABEL, type OriginKind } from "@board/lib/origin-types";
import { Select, SelectOption } from "@board/components/ui/select";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { toast } from "sonner";

export type OriginValue = {
  kind: OriginKind;
  id: string;
  viewable: boolean;
  label: string;
  href: string | null;
};

type TeamOption = { _id: string; name: string; active: boolean };
type WorkItemOption = { _id: string; title: string };
type CustomerOption = { id: string; name: string };

const inputClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * XM-1: "originated from" — distinct from the general link set. Marks that
 * this Work Item or Initiative explicitly originated from a Customer or
 * from another Work Item (e.g. a Ticket, or a piece of feedback logged as
 * one). Reused as-is by both the Work Item detail page and the Initiative
 * detail page — same generalize-don't-fork precedent Phase 6's KanbanBoard
 * set — the only difference between the two call sites is `patchEndpoint`
 * and `excludeWorkItemId`.
 */
export function OriginPanel({
  patchEndpoint,
  canEdit,
  initialOrigin,
  customers,
  excludeWorkItemId,
}: {
  patchEndpoint: string;
  canEdit: boolean;
  initialOrigin: OriginValue | null;
  customers: CustomerOption[];
  excludeWorkItemId?: string;
}) {
  const [origin, setOrigin] = useState<OriginValue | null>(initialOrigin);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<OriginKind>("customer");
  const [customerId, setCustomerId] = useState("");
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [targetItems, setTargetItems] = useState<WorkItemOption[]>([]);
  const [targetItemId, setTargetItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function openEdit() {
    setEditing(true);
    setError(null);
    if (kind === "work_item" && !teams) {
      const res = await fetch("/dashboard/board/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams((data.teams ?? []).filter((t: TeamOption) => t.active));
      }
    }
  }

  async function selectKind(next: OriginKind) {
    setKind(next);
    if (next === "work_item" && !teams) {
      const res = await fetch("/dashboard/board/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams((data.teams ?? []).filter((t: TeamOption) => t.active));
      }
    }
  }

  async function selectTargetTeam(id: string) {
    setTargetTeamId(id);
    setTargetItemId("");
    setTargetItems([]);
    if (!id) return;
    const res = await fetch(`/dashboard/board/api/teams/${id}/work-items`);
    if (!res.ok) return;
    const data = await res.json();
    setTargetItems(
      (data.workItems ?? []).filter((w: { _id: string }) => w._id !== excludeWorkItemId)
    );
  }

  async function save() {
    const id = kind === "customer" ? customerId : targetItemId;
    if (!id) return;
    setPending(true);
    setError(null);
    const res = await fetch(patchEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originatedFromKind: kind, originatedFromId: id }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const label =
      kind === "customer"
        ? (customers.find((c) => c.id === customerId)?.name ?? "Customer")
        : (targetItems.find((w) => w._id === targetItemId)?.title ?? "Work Item");
    setOrigin({
      kind,
      id,
      viewable: true,
      label: kind === "work_item" ? label : label,
      href: kind === "customer" ? `/dashboard/board/customers/${id}` : null,
    });
    setEditing(false);
    setCustomerId("");
    setTargetTeamId("");
    setTargetItemId("");
    toast.success("Origin set.");
  }

  async function clearOrigin() {
    setPending(true);
    const res = await fetch(patchEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originatedFromKind: null, originatedFromId: null }),
    });
    setPending(false);
    setConfirmClear(false);
    if (res.ok) {
      setOrigin(null);
      toast.success("Origin cleared.");
    } else {
      toast.error("Could not clear the origin.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
          Originated From
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
          >
            <GitBranch className="h-3.5 w-3.5" />
            {origin ? "Change" : "Set origin"}
          </button>
        )}
      </div>

      {!editing && (
        <>
          {!origin ? (
            <p className="text-xs text-slate">
              Not marked as originating from a Customer or another Work Item.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <span className="text-[11px] font-medium text-slate">
                  {ORIGIN_KIND_LABEL[origin.kind]}:{" "}
                </span>
                {origin.viewable && origin.href ? (
                  <Link href={origin.href} className="font-medium text-ink hover:text-primary">
                    {origin.label}
                  </Link>
                ) : origin.viewable ? (
                  <span className="font-medium text-ink">{origin.label}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-slate">
                    <ShieldAlert className="h-3 w-3" />
                    {origin.label}
                  </span>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  aria-label="Clear origin"
                  onClick={() => setConfirmClear(true)}
                  className="rounded-md p-1 text-slate hover:bg-status-blocked-bg hover:text-status-blocked"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ink">Type</label>
              <Select value={kind} onValueChange={(v) => selectKind(v as OriginKind)} className={`${inputClass} w-32`}>
                <SelectOption value="customer">Customer</SelectOption>
                <SelectOption value="work_item">Work Item</SelectOption>
              </Select>
            </div>
            {kind === "customer" ? (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-ink">Customer</label>
                <Select
                  value={customerId}
                  onValueChange={setCustomerId}
                  placeholder="Select a Customer…"
                  className={`${inputClass} w-48`}
                >
                  {customers.map((c) => (
                    <SelectOption key={c.id} value={c.id}>
                      {c.name}
                    </SelectOption>
                  ))}
                </Select>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending || (kind === "customer" ? !customerId : !targetItemId)}
              onClick={save}
              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
                setCustomerId("");
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
        open={confirmClear}
        onOpenChange={(open) => !open && setConfirmClear(false)}
        title="Clear this origin?"
        description="The Customer or Work Item this originated from is not affected."
        confirmLabel="Clear"
        destructive
        pending={pending}
        onConfirm={clearOrigin}
      />
    </div>
  );
}
