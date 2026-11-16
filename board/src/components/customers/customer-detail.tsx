"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Check, X, Plus, Trash2, Ticket as TicketIcon } from "lucide-react";
import { StatusPill } from "@board/components/work-items/status-pill";
import { PriorityBadge } from "@board/components/work-items/priority-badge";
type StageOption = { key: string; label: string };

// Phase 16 (Design 1, StageTrack generalization): the live `customer`
// StageTrack's stage list, no longer a fixed JOURNEY_STAGES const array —
// this client component receives it as a prop from its server-rendered
// parent instead of importing it directly.
function stageLabelFrom(stages: StageOption[], key: string | null): string {
  if (!key) return "—";
  return stages.find((s) => s.key === key)?.label ?? "—";
}
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { Select, SelectOption } from "@board/components/ui/select";
import { TimelineFeed } from "@board/components/shared/timeline-feed";
import { fullDateTimeTitle } from "@board/lib/format-date";
import type { StatusCategory, Priority } from "@board/lib/status-categories";
import type { TimelineEntry } from "@board/lib/timeline";

type Contact = { name: string; email?: string; phone?: string };

export type StageHistoryEntry = {
  id: string;
  oldValue: string | null;
  newValue: string | null;
  memberName: string;
  createdAt: string;
};

export type LinkedTicket = {
  id: string;
  title: string;
  teamId: string;
  teamName: string;
  statusLabel: string;
  statusCategory: StatusCategory;
  priority: Priority;
};

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function CustomerDetail({
  customerId,
  initialName,
  initialContacts,
  canManage,
  linkedTickets,
  hiddenCount = 0,
  journeyModuleEnabled = false,
  journeyStages = [],
  isOrgAdmin = false,
  initialJourneyStage = null,
  stageHistory = [],
  timelineEntries = [],
}: {
  customerId: string;
  initialName: string;
  initialContacts: Contact[];
  canManage: boolean;
  linkedTickets: LinkedTicket[];
  hiddenCount?: number;
  journeyModuleEnabled?: boolean;
  journeyStages?: StageOption[];
  isOrgAdmin?: boolean;
  initialJourneyStage?: string | null;
  stageHistory?: StageHistoryEntry[];
  timelineEntries?: TimelineEntry[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [contacts, setContacts] = useState(initialContacts);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [addingContact, setAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: "", email: "", phone: "" });
  const [journeyStage, setJourneyStage] = useState(initialJourneyStage);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setPending(true);
    const res = await fetch(`/dashboard/board/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  // CJ-1: setting the Journey Stage is Org-Admin-only, a stricter floor
  // than name/contacts (Team-Admin-eligible via `canManage`), so this is a
  // separate endpoint and doesn't reuse `patch()`/canManage above.
  async function setStage(next: string) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/customers/${customerId}/journey-stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journeyStage: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setJourneyStage(next);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link
            href="/dashboard/board/customers"
            className="text-xs font-medium text-slate hover:text-ink"
          >
            ← All Customers
          </Link>
          <div className="mt-2 flex items-center gap-1.5">
            {editingName ? (
              <div className="flex flex-1 items-center gap-1.5">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-surface px-2.5 font-heading text-xl font-bold text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  aria-label="Save name"
                  onClick={async () => {
                    if (await patch({ name: nameDraft })) {
                      setName(nameDraft);
                      setEditingName(false);
                    }
                  }}
                  className="rounded-md p-1.5 text-status-done hover:bg-status-done-bg"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => {
                    setNameDraft(name);
                    setEditingName(false);
                  }}
                  className="rounded-md p-1.5 text-slate hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">{name}</h1>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Edit name"
                    onClick={() => setEditingName(true)}
                    className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-md bg-status-blocked-bg px-3 py-2 text-xs font-medium text-status-blocked">
            {error}
          </p>
        )}

        <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
              Linked Tickets
            </div>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate">
              {linkedTickets.length}
            </span>
          </div>
          {hiddenCount > 0 && (
            <p className="mb-3 text-[11px] text-slate">
              {hiddenCount} more {hiddenCount === 1 ? "Ticket is" : "Tickets are"} linked here on
              Teams you don&apos;t have access to.
            </p>
          )}
          {linkedTickets.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
                <TicketIcon className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate">No Tickets linked to this Customer yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {linkedTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/board/teams/${t.teamId}/work-items/${t.id}`}
                      className="block truncate text-sm font-medium text-ink hover:text-primary"
                    >
                      {t.title}
                    </Link>
                    <span className="text-[11px] text-slate">{t.teamName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusPill label={t.statusLabel} category={t.statusCategory} />
                    <PriorityBadge priority={t.priority} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate">
            Timeline
          </div>
          <TimelineFeed entries={timelineEntries} />
        </div>
      </div>

      <div className="space-y-4">
        {journeyModuleEnabled && (
          <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate">
              Journey Stage
            </div>
            {isOrgAdmin ? (
              <Select
                value={journeyStage ?? ""}
                onValueChange={setStage}
                placeholder="Not set"
                className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {journeyStages.map((s) => (
                  <SelectOption key={s.key} value={s.key}>
                    {s.label}
                  </SelectOption>
                ))}
              </Select>
            ) : (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {stageLabelFrom(journeyStages, journeyStage)}
              </span>
            )}
            {stageHistory.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {stageHistory.map((h) => (
                  <li key={h.id} className="text-[11px] text-slate">
                    <MemberHoverCard name={h.memberName}>
                      <span className="font-medium text-ink">{h.memberName}</span>
                    </MemberHoverCard>{" "}
                    moved{" "}
                    {stageLabelFrom(journeyStages, h.oldValue)} → {stageLabelFrom(journeyStages, h.newValue)} ·{" "}
                    <span title={fullDateTimeTitle(h.createdAt)}>
                      {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
              Contacts
            </div>
            {canManage && !addingContact && (
              <button
                type="button"
                onClick={() => setAddingContact(true)}
                className="text-[10px] font-medium text-primary hover:text-primary-hover"
              >
                Add
              </button>
            )}
          </div>

          {contacts.length === 0 && !addingContact ? (
            <p className="text-xs text-slate">No contacts yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {contacts.map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-xs">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    {c.email && <p className="text-slate">{c.email}</p>}
                    {c.phone && <p className="text-slate">{c.phone}</p>}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      aria-label="Remove contact"
                      disabled={pending}
                      onClick={async () => {
                        const next = contacts.filter((_, idx) => idx !== i);
                        if (await patch({ contacts: next })) setContacts(next);
                      }}
                      className="rounded-md p-1 text-slate hover:bg-status-blocked-bg hover:text-status-blocked"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {addingContact && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
              <input
                autoFocus
                value={contactDraft.name}
                onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Name"
                className={inputClass}
              />
              <input
                value={contactDraft.email}
                onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="Email (optional)"
                className={inputClass}
              />
              <input
                value={contactDraft.phone}
                onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="Phone (optional)"
                className={inputClass}
              />
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={!contactDraft.name.trim() || pending}
                  onClick={async () => {
                    const next = [...contacts, contactDraft];
                    if (await patch({ contacts: next })) {
                      setContacts(next);
                      setContactDraft({ name: "", email: "", phone: "" });
                      setAddingContact(false);
                    }
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingContact(false);
                    setContactDraft({ name: "", email: "", phone: "" });
                  }}
                  className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-slate hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
