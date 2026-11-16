"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";
import { DatePicker } from "@board/components/ui/date-picker";

const selectClass =
  "h-9 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// CT-7: "filterable by user/Team/date range" — same URL-driven filter
// pattern DashboardFilters already established (src/components/dashboard/
// dashboard-filters.tsx). Changing any filter resets to page 1, since the
// old page number is almost never still meaningful against a new result set.
export function AuditLogFilters({
  teams,
  members,
  currentTeam,
  currentMember,
  currentFrom,
  currentTo,
}: {
  teams: { id: string; name: string }[];
  members: { id: string; name: string }[];
  currentTeam: string;
  currentMember: string;
  currentFrom: string;
  currentTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function update(next: Partial<{ team: string; member: string; from: string; to: string }>) {
    const params = new URLSearchParams();
    const team = next.team ?? currentTeam;
    const member = next.member ?? currentMember;
    const from = next.from ?? currentFrom;
    const to = next.to ?? currentTo;
    if (team !== "all") params.set("team", team);
    if (member !== "all") params.set("member", member);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentTeam} onValueChange={(v) => update({ team: v })} className={selectClass}>
        <SelectOption value="all">All Teams</SelectOption>
        {teams.map((t) => (
          <SelectOption key={t.id} value={t.id}>
            {t.name}
          </SelectOption>
        ))}
      </Select>

      <Select value={currentMember} onValueChange={(v) => update({ member: v })} className={selectClass}>
        <SelectOption value="all">All Members</SelectOption>
        {members.map((m) => (
          <SelectOption key={m.id} value={m.id}>
            {m.name}
          </SelectOption>
        ))}
      </Select>

      <DatePicker
        value={currentFrom || null}
        onChange={(v) => update({ from: v ?? "" })}
        className="h-9 w-32"
      />
      <span className="text-xs text-slate">to</span>
      <DatePicker value={currentTo || null} onChange={(v) => update({ to: v ?? "" })} className="h-9 w-32" />
    </div>
  );
}
