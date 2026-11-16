"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, type StatusCategory } from "@board/lib/status-categories";
import { CustomFieldInput, type FieldDef } from "@board/components/work-items/custom-field-input";
import { LabelsInput } from "@board/components/work-items/labels-input";
import { Select, SelectOption } from "@board/components/ui/select";
import { DatePicker } from "@board/components/ui/date-picker";
import { NotOnTeamBadge } from "@board/components/ui/not-on-team-badge";

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function CreateWorkItemForm({
  teamId,
  teamName,
  type,
  typeLabel,
  // Phase 16 (Design 3): generalizes the old `type === "ticket"` hardcode —
  // the server-rendered parent looks this up from the live
  // WorkItemTemplateDef registry (getTemplateDef(type, templates)
  // .requiresCustomer) and hands it down, since this client component can't
  // hit the registry itself.
  requiresCustomer,
  statuses,
  fields,
  teamMembers,
  mentionCandidates = teamMembers,
  customers,
  initiatives,
  existingLabels = [],
}: {
  teamId: string;
  teamName: string;
  type: string;
  typeLabel: string;
  requiresCustomer: boolean;
  statuses: { key: string; label: string; category: StatusCategory }[];
  fields: FieldDef[];
  teamMembers: { id: string; name: string }[];
  // Wider than teamMembers on purpose — see the same prop on WorkItemDetail.
  mentionCandidates?: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  // Every label ever used on this Team's Work Items — powers the chip
  // input's autocomplete so labels stay reusable instead of re-typed.
  existingLabels?: string[];
}) {
  const router = useRouter();
  const teamMemberIds = new Set(teamMembers.map((m) => m.id));
  const isTicket = requiresCustomer;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(statuses[0]?.key ?? "");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        type,
        status,
        priority,
        assignee: assignee || null,
        customerId: isTicket ? customerId : undefined,
        initiativeId: initiativeId || null,
        dueDate: dueDate || null,
        labels,
        customFields: customFieldValues,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const { workItem } = await res.json();
    router.push(`/dashboard/board/teams/${teamId}/work-items/${workItem._id}`);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link
          href={`/dashboard/board/teams/${teamId}/work-items`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          {teamName} {typeLabel}s
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink">
          New {typeLabel}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg border border-border bg-panel p-6 shadow-xs"
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Title</label>
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fix login redirect loop"
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">
            Description <span className="text-slate">(Markdown supported)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What needs to happen?"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Status</label>
            <Select value={status} onValueChange={setStatus} className={inputClass}>
              {statuses.map((s) => (
                <SelectOption key={s.key} value={s.key}>
                  {s.label}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Priority</label>
            <Select value={priority} onValueChange={setPriority} className={inputClass}>
              {PRIORITIES.map((p) => (
                <SelectOption key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Assignee</label>
            <Select
              value={assignee || "__unassigned__"}
              onValueChange={(v) => setAssignee(v === "__unassigned__" ? "" : v)}
              className={inputClass}
            >
              <SelectOption value="__unassigned__">Unassigned</SelectOption>
              {mentionCandidates.map((m) => (
                <SelectOption key={m.id} value={m.id}>
                  <span className="flex items-center gap-1.5">
                    {m.name}
                    {!teamMemberIds.has(m.id) && <NotOnTeamBadge teamName={teamName} />}
                  </span>
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Due date</label>
            <DatePicker
              value={dueDate || null}
              onChange={(v) => setDueDate(v ?? "")}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">
              Initiative <span className="text-slate">(optional)</span>
            </label>
            <Select
              value={initiativeId || "__none__"}
              onValueChange={(v) => setInitiativeId(v === "__none__" ? "" : v)}
              className={inputClass}
            >
              <SelectOption value="__none__">None</SelectOption>
              {initiatives.map((i) => (
                <SelectOption key={i.id} value={i.id}>
                  {i.name}
                </SelectOption>
              ))}
            </Select>
          </div>
          {isTicket && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink">
                Customer{" "}
                <span className="font-normal text-slate">(optional)</span>
              </label>
              <Select
                value={customerId}
                onValueChange={setCustomerId}
                placeholder="Select a Customer… (optional)"
                className={inputClass}
              >
                {customers.map((c) => (
                  <SelectOption key={c.id} value={c.id}>
                    {c.name}
                  </SelectOption>
                ))}
              </Select>
              {customers.length === 0 && (
                <p className="text-[11px] text-slate">
                  No Customers yet —{" "}
                  <Link href="/dashboard/board/customers" className="font-medium text-primary hover:text-primary-hover">
                    create one first
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Labels</label>
          <LabelsInput value={labels} onChange={setLabels} suggestions={existingLabels} />
        </div>

        {fields.length > 0 && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
              Team fields
            </div>
            <div className="grid grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <label className="text-xs font-medium text-ink">{field.label}</label>
                  <CustomFieldInput
                    field={field}
                    value={customFieldValues[field.key] ?? ""}
                    onChange={(v) =>
                      setCustomFieldValues((prev) => ({ ...prev, [field.key]: v }))
                    }
                    teamMembers={teamMembers}
                    mentionCandidates={mentionCandidates}
                    teamName={teamName}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-status-blocked-bg px-3 py-2 text-xs font-medium text-status-blocked">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creating…" : `Create ${typeLabel}`}
          </button>
          <Link
            href={`/dashboard/board/teams/${teamId}/work-items`}
            className="inline-flex h-9 items-center rounded-md px-3 text-xs font-medium text-slate hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
