import { redirect } from "next/navigation";
import { getCurrentMember } from "@board/lib/get-current-member";
import { SettingsTabs } from "@board/components/settings/settings-tabs";

// Design 4 (Phase 16): shared shell for every /settings/* route — folds the
// former standalone "My Teams" and "Modules"/"Audit Log" sidebar entries in
// as tabs here instead. Computes member/orgRole once and passes it to
// SettingsTabs to hide admin-only tabs for a non-admin — the same
// buildNavItems(orgRole) pattern the sidebar already used. This layout only
// renders navigation; it never widens or narrows access on its own — every
// page underneath still runs its own server-side gate (Non-Negotiable #1).
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-xs text-slate">
          Your Teams, and — for Org Admins — Team management, Work Item templates, Stage Tracks,
          and the org-wide audit log.
        </p>
      </div>
      <SettingsTabs orgRole={member.orgRole} />
      {children}
    </div>
  );
}
