"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Columns3,
  Target,
  Building2,
  Settings,
  KeyRound,
} from "lucide-react";
import { Logo, LogoMark } from "./logo";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  comingSoon?: string;
}

// Design 4 (Phase 16): "My Teams", "Modules", and "Audit Log" are no longer
// separate top-level rows — they're tabs inside the shared /settings shell
// (src/app/(app)/settings/layout.tsx, src/components/settings/settings-tabs.tsx).
// "Settings & RBAC" is renamed "Settings" and — deliberately — no longer
// gated on orgRole here, since My Teams (reachable by every Member) now
// lives behind this same row. The actual admin-only boundary is enforced
// server-side per-tab/per-page (Non-Negotiable #1), not by hiding this row.
function buildNavItems(): NavItem[] {
  return [
    { name: "Org Dashboard", href: "/dashboard/board/dashboard", icon: LayoutDashboard },
    { name: "Work Items", href: "/dashboard/board/work-items", icon: CheckSquare },
    { name: "Boards", href: "/dashboard/board/boards", icon: Columns3 },
    { name: "Initiatives", href: "/dashboard/board/initiatives", icon: Target },
    { name: "Customers", href: "/dashboard/board/customers", icon: Building2 },
    // MB-3: every Member — including one who is only ever a Guest, with no
    // Team role anywhere — needs a way in, since Team-scoped nav items are
    // otherwise entirely blocked for them (Non-Negotiable #9).
    { name: "Guest Access", href: "/dashboard/board/guest-access", icon: KeyRound },
    { name: "Settings", href: "/dashboard/board/settings", icon: Settings },
  ];
}

// Collapses to a fixed icon rail and expands on hover. The rail's layout
// width is reserved by a same-sized spacer sibling so the real <aside> can be
// `fixed` and grow wider on hover as an overlay, without ever resizing (or
// reflowing) the main content next to it.
const RAIL_WIDTH = "w-16";
const EXPANDED_WIDTH = "w-64";

// Every label/trailing element below stays mounted in both states — only its
// opacity (and the ancestor <aside>'s width) changes. Conditionally
// mounting/unmounting them was what made the hover expand feel glitchy: text
// would pop in abruptly instead of fading in as the rail widened. Likewise,
// `justify-content` never toggles anywhere (it isn't animatable), so nothing
// snaps mid-transition — every row stays `justify-start` and pushes trailing
// content right with `ml-auto` instead.
const FADE = "transition-opacity duration-200 ease-in-out";
const MORPH = "transition-all duration-200 ease-in-out";

export function Sidebar() {
  const navItems = buildNavItems();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={`${RAIL_WIDTH} shrink-0`} aria-hidden="true" />
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`fixed top-14 left-0 z-40 flex h-[calc(100vh-3.5rem)] flex-col justify-between overflow-hidden border-r border-border bg-panel ${MORPH} ${
          expanded ? `${EXPANDED_WIDTH} shadow-lg` : RAIL_WIDTH
        }`}
      >
        {/* Upper Navigation */}
        <div className="space-y-6 p-3">
          {/* Primary Links */}
          <nav className="space-y-1">
            <div
              className={`mb-2 truncate px-3 text-[11px] font-semibold tracking-wider text-slate uppercase ${FADE} ${
                expanded ? "opacity-100" : "opacity-0"
              }`}
            >
              Navigation
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              if (item.comingSoon) {
                return (
                  <div
                    key={item.name}
                    title={`${item.name} isn't built yet`}
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center gap-2.5 overflow-hidden rounded-md px-3 py-2 text-xs font-medium text-slate opacity-60"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate" />
                    <span className={`truncate ${FADE} ${expanded ? "opacity-100" : "opacity-0"}`}>
                      {item.name}
                    </span>
                    <span
                      className={`ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate ${FADE} ${
                        expanded ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {item.comingSoon}
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={!expanded ? item.name : undefined}
                  className={`group flex items-center gap-2.5 overflow-hidden rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-slate hover:bg-muted hover:text-ink"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-slate group-hover:text-ink"}`}
                  />
                  <span className={`truncate ${FADE} ${expanded ? "opacity-100" : "opacity-0"}`}>
                    {item.name}
                  </span>
                  {item.badge && (
                    <span
                      className={`ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate ${FADE} ${
                        expanded ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer / Brand mark — both marks stay mounted, stacked, and
            crossfade so the swap never pops. */}
        <div className="relative flex h-16 shrink-0 items-center justify-center overflow-hidden border-t border-border bg-surface/40">
          <div
            className={`absolute inset-0 flex items-center justify-center ${FADE} ${
              expanded ? "opacity-0" : "opacity-100"
            }`}
          >
            <LogoMark className="h-9 w-9" />
          </div>
          <div className={`${FADE} ${expanded ? "opacity-100" : "opacity-0"}`}>
            <Logo className="h-9" />
          </div>
        </div>
      </aside>
    </>
  );
}
