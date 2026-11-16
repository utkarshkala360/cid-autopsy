"use client";

import { useRouter } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";

const selectClass =
  "h-9 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// Phase 16 (Design 2, Sprint/Initiative unification): the Initiatives page
// now covers both ordinary cross-team tags and Team-run Initiatives
// (formerly a separate Sprints page per Team) — this is the switch between
// them, replacing teams/[teamId]/sprints/page.tsx's own URL/nav entirely.
export function InitiativesTeamFilter({
  teams,
  current,
}: {
  teams: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={current}
      onValueChange={(v) => router.push(v === "tags" ? "/dashboard/board/initiatives" : `/dashboard/board/initiatives?team=${v}`)}
      className={selectClass}
    >
      <SelectOption value="tags">Cross-team Tags</SelectOption>
      {teams.map((t) => (
        <SelectOption key={t.id} value={t.id}>
          {t.name} Sprints
        </SelectOption>
      ))}
    </Select>
  );
}
