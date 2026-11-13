import { requireMember } from "@/lib/auth";
import { SUB_APPS } from "@/lib/sub-apps";
import { ConsoleHeader } from "@/components/ConsoleHeader";
import { memberLogoutAction } from "@/app/dashboard/actions";
import { AuditNoteButton } from "@/components/AuditNoteButton";

// Header and page frame for everything members sign in to: the dashboard and customers.
export async function MemberShell({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return (
    <>
      <ConsoleHeader
        consoleName="Dashboard"
        homeHref="/dashboard"
        userLabel={member.fullName}
        logoutAction={memberLogoutAction}
        nav={[
          { href: "/customers", label: "Customers" },
          ...SUB_APPS.map((app) => ({ href: `/dashboard/${app.slug}`, label: app.name })),
        ]}
      />
      <main className="w-full flex-1 px-4 py-8">{children}</main>
      {member.isAuditor && <AuditNoteButton />}
    </>
  );
}
