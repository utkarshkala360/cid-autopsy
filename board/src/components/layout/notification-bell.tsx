"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationView } from "@board/lib/notifications";
import { fullDateTimeTitle } from "@board/lib/format-date";

/**
 * §7.11/MB-5: @mentions, assignment, and status changes — same list, same
 * component, whether the signed-in Member is a full Team Member or a Guest.
 * Initial data comes from AppShell's server-side fetch (no mount-time
 * effect, matching this codebase's one convention for client components
 * that show server data — see Phase 7's WorkItemLinksPanel note); marking
 * read is the only client-driven refetch, and it's an optimistic local
 * update, not a re-fetch.
 */
export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: NotificationView[];
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`/dashboard/board/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/dashboard/board/api/notifications/mark-all-read", { method: "POST" }).catch(() => {});
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="focus-visible:ring-primary relative rounded-md p-1.5 text-slate transition-colors hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="bg-status-blocked absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="radix-content border-border bg-panel z-50 w-80 rounded-lg border shadow-lg"
        >
          <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-ink text-xs font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-[11px] font-medium"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-slate px-3 py-6 text-center text-xs">
                Nothing yet — @mentions, assignments, and status changes on items you watch show
                up here.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/dashboard/board/teams/${n.teamId}/work-items/${n.workItemId}`}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read) markRead(n.id);
                      }}
                      className={`block px-3 py-2.5 text-xs leading-relaxed transition-colors hover:bg-muted ${
                        n.read ? "text-slate" : "font-medium text-ink"
                      }`}
                    >
                      {!n.read && (
                        <span className="bg-primary mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" />
                      )}
                      {n.message}
                      <div
                        className="text-slate mt-0.5 text-[10px]"
                        title={fullDateTimeTitle(n.createdAt)}
                      >
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
