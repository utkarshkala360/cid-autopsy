"use client";

import Link from "next/link";
import type { BoardSession } from "@board/lib/get-current-member";
import { memberLogoutAction } from "@/app/(portal)/dashboard/actions";
import { Building, HelpCircle, LayoutGrid, LogOut } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import type { NotificationView } from "@board/lib/notifications";

function initials(label: string) {
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function TopNav({
  session,
  initialNotifications = [],
  initialUnreadCount = 0,
  avatarUrl = null,
}: {
  session: BoardSession;
  initialNotifications?: NotificationView[];
  initialUnreadCount?: number;
  avatarUrl?: string | null;
}) {
  return (
    <header className="border-border bg-panel sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b px-4 sm:px-6">
      {/* Organization */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          title="Back to all apps"
          className="text-slate hover:bg-muted hover:text-ink inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          All apps
        </Link>
        <span className="bg-muted text-slate hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex">
          <Building className="h-3 w-3" />
          Org: 360 Degree Cloud
        </span>
      </div>

      {/* Center Search - Team-scoped per §7.1 */}
      {session?.user && (
        <div className="hidden w-80 max-w-md items-center md:flex">
          <GlobalSearch />
        </div>
      )}

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {session?.user && (
          <NotificationBell
            initialNotifications={initialNotifications}
            initialUnreadCount={initialUnreadCount}
          />
        )}
        <button
          type="button"
          disabled
          aria-label="Help & Documentation"
          title="Help & docs are not written yet"
          className="text-slate cursor-not-allowed rounded-md p-1.5 opacity-50"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <div className="bg-border mx-1 h-4 w-px" />

        {!session?.user && (
          <Link
            href="/dashboard/login"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
          >
            Log in
          </Link>
        )}

        {session?.user && (
          <div className="flex items-center gap-2 pl-1">
            <Link
              href="/dashboard/board/profile"
              title="My Profile"
              className="hover:bg-muted flex items-center gap-2 rounded-md p-1 transition-colors"
            >
              <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(session.user.name || session.user.email || "?")
                )}
              </div>
              <div className="hidden flex-col text-left text-xs lg:flex">
                <span className="text-ink leading-tight font-medium">
                  {session.user.name || session.user.email}
                </span>
                <span className="text-slate text-[11px]">
                  {session.user.orgRole === "org_admin" ? "Org Admin" : "Member"}
                </span>
              </div>
            </Link>
            {/* Board shares the portal's sign-in, so signing out here signs out of every app. */}
            <form action={memberLogoutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="text-slate hover:bg-muted hover:text-ink rounded-md p-1.5 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
