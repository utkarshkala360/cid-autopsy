"use client";

import { Select, SelectOption } from "@board/components/ui/select";
import { DatePicker } from "@board/components/ui/date-picker";
import { NotOnTeamBadge } from "@board/components/ui/not-on-team-badge";

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "dropdown" | "date" | "user_picker";
  options?: string[];
};

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function CustomFieldInput({
  field,
  value,
  onChange,
  teamMembers,
  mentionCandidates = teamMembers,
  teamName,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  teamMembers: { id: string; name: string }[];
  // Wider than teamMembers on purpose — a "member" custom field can point
  // at any active Org Member, not just people on this Team (same reach as
  // the Assignee field and @mentions). Falls back to teamMembers so
  // existing callers don't need updating.
  mentionCandidates?: { id: string; name: string }[];
  teamName?: string;
}) {
  const teamMemberIds = new Set(teamMembers.map((m) => m.id));
  if (field.fieldType === "dropdown") {
    return (
      <Select
        value={value || "__unset__"}
        onValueChange={(v) => onChange(v === "__unset__" ? "" : v)}
        className={inputClass}
      >
        <SelectOption value="__unset__">—</SelectOption>
        {(field.options ?? []).map((opt) => (
          <SelectOption key={opt} value={opt}>
            {opt}
          </SelectOption>
        ))}
      </Select>
    );
  }

  if (field.fieldType === "user_picker") {
    return (
      <Select
        value={value || "__unassigned__"}
        onValueChange={(v) => onChange(v === "__unassigned__" ? "" : v)}
        className={inputClass}
      >
        <SelectOption value="__unassigned__">Unassigned</SelectOption>
        {mentionCandidates.map((m) => (
          <SelectOption key={m.id} value={m.id}>
            <span className="flex items-center gap-1.5">
              {m.name}
              {!teamMemberIds.has(m.id) && (
                <NotOnTeamBadge teamName={teamName ?? "this Team"} />
              )}
            </span>
          </SelectOption>
        ))}
      </Select>
    );
  }

  if (field.fieldType === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  }

  if (field.fieldType === "date") {
    return (
      <DatePicker
        value={value || null}
        onChange={(v) => onChange(v ?? "")}
        className={inputClass}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
