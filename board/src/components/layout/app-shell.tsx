import React from "react";
import type { BoardSession } from "@board/lib/get-current-member";
import type { NotificationView } from "@board/lib/notifications";
import { TopNav } from "./top-nav";
import { Sidebar } from "./sidebar";

// Phase 11: purely presentational. Session/notifications are loaded once by
// the shared `src/app/(app)/layout.tsx`, which — per Next.js 16 App Router
// semantics — does not rerender on client-side navigation between sibling
// pages, so this data is now fresh as of the last navigation *into* this
// route subtree, not stale for an entire session; a `router.refresh()`
// after a mutation still re-runs it, same as before.
export function AppShell({
  session,
  notifications,
  unreadCount,
  avatarUrl = null,
  children,
}: {
  session: BoardSession;
  notifications: NotificationView[];
  unreadCount: number;
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface text-ink flex h-screen flex-col">
      <TopNav
        session={session}
        initialNotifications={notifications}
        initialUnreadCount={unreadCount}
        avatarUrl={avatarUrl}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
