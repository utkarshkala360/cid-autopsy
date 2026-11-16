"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Members and Config used to live one behind the other — Config was a small
// icon-button tucked into the Members page, easy to miss. Same tab-bar
// pattern SettingsTabs already uses one level up, so the two are equally
// prominent instead of Config feeling like a hidden sub-page.
export function TeamSettingsTabs({ teamId, configLabel }: { teamId: string; configLabel: string }) {
  const pathname = usePathname();
  const tabs = [
    { name: "Members", href: `/dashboard/board/settings/teams/${teamId}/members` },
    { name: configLabel, href: `/dashboard/board/settings/teams/${teamId}/work-item-config` },
  ];

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Team settings">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate hover:text-ink"
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
