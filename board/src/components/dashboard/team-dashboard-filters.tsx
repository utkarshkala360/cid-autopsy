"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectOption } from "@board/components/ui/select";

// The Team Dashboard's own filter bar — Initiative only, since the Team
// itself is already fixed by the URL (no Team selector the way the Org
// Dashboard's DashboardFilters needs one). Same "preserve every other
// param" discipline that component follows, so switching Initiative never
// discards the active `dv` widget config.
export function TeamDashboardFilters({
  initiatives,
  currentInitiative,
}: {
  initiatives: { id: string; name: string }[];
  currentInitiative: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateInitiative(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("initiative", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select
      value={currentInitiative}
      onValueChange={updateInitiative}
      className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    >
      <SelectOption value="all">All Initiatives</SelectOption>
      {initiatives.map((i) => (
        <SelectOption key={i.id} value={i.id}>
          {i.name}
        </SelectOption>
      ))}
    </Select>
  );
}
