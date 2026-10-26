import { requireAdmin } from "@/lib/auth";
import { ConsoleHeader } from "@/components/ConsoleHeader";
import { adminLogoutAction } from "@/app/admin/actions";

export default async function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <>
      <ConsoleHeader
        consoleName="Admin"
        homeHref="/admin"
        userLabel={admin.username}
        logoutAction={adminLogoutAction}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
