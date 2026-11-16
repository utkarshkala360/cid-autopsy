import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { TeamSettingsTabs } from "@board/components/settings/team-settings-tabs";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

// Shared shell for a single Team's settings — header + the Members/Config
// tab bar (see team-settings-tabs.tsx for why this exists: Config used to
// be a small button buried inside the Members page). Every page under here
// still runs its own server-side requireTeamRole check (Non-Negotiable #1)
// — this layout's own gate is a UX convenience, not the actual boundary.
export default async function TeamSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");

  if (!authz.ok && authz.status === 401) {
    redirect("/dashboard/login");
  }

  if (!authz.ok) {
    return (
      <ForbiddenState
        title={authz.status === 404 ? "Team not found" : "You don't have access to this Team"}
        message={
          authz.status === 404
            ? "This Team doesn't exist or was removed."
            : "Managing this Team requires Team Admin (or Org Admin)."
        }
      />
    );
  }

  await connectDB();
  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team) {
    return <ForbiddenState title="Team not found" message="This Team doesn't exist or was removed." />;
  }

  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const typeLabel = labelForTeam(team, templates);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/board/settings/teams"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          All Teams
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">{team.name}</h1>
          <Link
            href={`/dashboard/board/teams/${teamId}/work-items`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs font-medium text-ink shadow-2xs hover:bg-muted"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {typeLabel}s
          </Link>
        </div>
      </div>
      <TeamSettingsTabs teamId={teamId} configLabel={`${typeLabel} Config`} />
      {children}
    </div>
  );
}
