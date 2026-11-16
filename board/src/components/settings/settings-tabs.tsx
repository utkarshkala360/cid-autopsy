"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrgRole } from "@board/models/Member";

// Design 4 (Phase 16): the shared tab bar every /settings/* page now renders
// under. Admin-only tabs are hidden here for a non-admin the same way
// buildNavItems(orgRole) already hides admin-only sidebar rows — this is a
// display convenience only, never the actual gate: every page underneath
// still does its own server-side requireOrgAdmin()/requireTeamRole() check
// (Non-Negotiable #1), so hitting a hidden tab's URL directly still 403s.
type SettingsTab = { name: string; href: string; adminOnly?: boolean };

const SETTINGS_TABS: SettingsTab[] = [
  { name: "My Teams", href: "/dashboard/board/settings/my-teams" },
  { name: "Teams", href: "/dashboard/board/settings/teams", adminOnly: true },
  { name: "Templates", href: "/dashboard/board/settings/templates", adminOnly: true },
  { name: "Customer Templates", href: "/dashboard/board/settings/customer-templates", adminOnly: true },
  { name: "Modules", href: "/dashboard/board/settings/modules", adminOnly: true },
  { name: "Audit Log", href: "/dashboard/board/settings/audit-log", adminOnly: true },
];

export function SettingsTabs({ orgRole }: { orgRole: OrgRole }) {
  const pathname = usePathname();
  const tabs = SETTINGS_TABS.filter((tab) => !tab.adminOnly || orgRole === "org_admin");

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Settings">
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
