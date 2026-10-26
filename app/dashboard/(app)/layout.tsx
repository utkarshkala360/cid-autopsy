import { requireMember } from "@/lib/auth";
import { SUB_APPS } from "@/lib/sub-apps";
import { ConsoleHeader } from "@/components/ConsoleHeader";
import { memberLogoutAction } from "@/app/dashboard/actions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const member = await requireMember();
  return (
    <>
      <ConsoleHeader
        consoleName="Dashboard"
        homeHref="/dashboard"
        userLabel={member.fullName}
        logoutAction={memberLogoutAction}
        nav={SUB_APPS.map((app) => ({ href: `/dashboard/${app.slug}`, label: app.name }))}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
