import { redirect } from "next/navigation";
import { boardSession, getCurrentMember } from "@board/lib/get-current-member";
import { listNotificationsForMember } from "@board/lib/notifications";
import { AppShell } from "@board/components/layout/app-shell";

// Phase 11: the single shared layout for every authenticated route. Per
// Next.js 16's App Router, a layout "preserve[s] state, remain[s]
// interactive, and do[es] not rerender" on client-side navigation between
// sibling pages beneath it — so the auth check and notification queries
// below now run once per navigation *away* from this route subtree, not on
// every click within it, unlike the old per-page AppShell embedding this
// replaces. `router.refresh()` (used after mutations) still re-runs this
// layout, which is correct — a mutation can change notification state.
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  const session = boardSession(member);
  const { notifications, unreadCount } = await listNotificationsForMember(
    member._id
  );

  return (
    <AppShell
      session={session}
      notifications={notifications}
      unreadCount={unreadCount}
      avatarUrl={member.avatarUrl ?? null}
    >
      {children}
    </AppShell>
  );
}
