"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";

const selectClass =
  "h-9 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// DB-1/DB-2: the two things this dashboard can be sliced by — Team scope
// (limited to Teams the current Member can actually see, "all" meaning
// every accessible Team, not literally every Team in the Org for a
// non-Admin) and Initiative (ORG-5's cross-team filter).
export function DashboardFilters({
  teams,
  initiatives,
  currentTeam,
  currentInitiative,
  showAllOption,
}: {
  teams: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  currentTeam: string;
  currentInitiative: string;
  showAllOption: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preserve every other param (in particular `dv`, the active Dashboard
  // View's widget config — src/lib/dashboard-views.ts) rather than
  // rebuilding the query string from scratch, so switching the Team or
  // Initiative filter never silently discards a custom widget selection.
  function updateParam(key: "team" | "initiative", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("team", key === "team" ? value : currentTeam);
    params.set("initiative", key === "initiative" ? value : currentInitiative);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={currentTeam}
        onValueChange={(v) => updateParam("team", v)}
        className={selectClass}
      >
        {showAllOption && <SelectOption value="all">All Teams</SelectOption>}
        {teams.map((t) => (
          <SelectOption key={t.id} value={t.id}>
            {t.name}
          </SelectOption>
        ))}
      </Select>

      <Select
        value={currentInitiative}
        onValueChange={(v) => updateParam("initiative", v)}
        className={selectClass}
      >
        <SelectOption value="all">All Initiatives</SelectOption>
        {initiatives.map((i) => (
          <SelectOption key={i.id} value={i.id}>
            {i.name}
          </SelectOption>
        ))}
      </Select>
    </div>
  );
}
