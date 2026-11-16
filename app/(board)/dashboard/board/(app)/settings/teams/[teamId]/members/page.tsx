import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { AddMemberForm } from "@board/components/teams/add-member-form";
import { MemberRow } from "@board/components/teams/member-row";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { TeamMembership, type TeamRole } from "@board/models/TeamMembership";
import { getStageTrack } from "@board/lib/stage-tracks";
import { MacroStagePicker } from "@board/components/shared/macro-stage-picker";

type PopulatedMembership = {
  _id: unknown;
  role: TeamRole;
  memberId: { _id: unknown; name: string; email: string } | null;
};

export default async function TeamMembersPage({
  params,
}: {
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
            : "Managing membership requires Team Admin on this Team (or Org Admin)."
        }
      />
    );
  }

  await connectDB();
  const [team, memberships] = await Promise.all([
    Team.findById(teamId).lean<TeamDoc>(),
    TeamMembership.find({ teamId })
      .populate("memberId", "name email")
      .sort({ createdAt: 1 })
      .lean<PopulatedMembership[]>(),
  ]);

  if (!team) {
    return <ForbiddenState title="Team not found" message="This Team doesn't exist or was removed." />;
  }

  const teamStageTrack = await getStageTrack(authz.member.organizationId, "team");

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate">
        Manage who belongs to this Team and their role. Org Admin has Admin access here by
        default, even without an explicit membership row (MB-2).
      </p>

      {teamStageTrack?.enabled && (
        <MacroStagePicker
          endpoint={`/dashboard/board/api/teams/${teamId}/macro-stage`}
          stages={teamStageTrack.stages}
          isOrgAdmin={authz.member.orgRole === "org_admin"}
          initialValue={team.macroStage ?? null}
          label={teamStageTrack.name}
        />
      )}

      <div className="rounded-lg border border-border bg-panel p-5">
        <AddMemberForm teamId={String(team._id)} />
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        {memberships.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
              <Users className="h-5 w-5" />
            </div>
            <p className="text-xs text-slate">No explicit members yet. Add one by email above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
                  <th className="pb-2 pr-4 font-semibold">Member</th>
                  <th className="pb-2 pr-4 font-semibold">Role</th>
                  <th className="pb-2 pr-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {memberships
                  .filter((m) => m.memberId)
                  .map((m) => (
                    <MemberRow
                      key={String(m._id)}
                      teamId={String(team._id)}
                      memberId={String(m.memberId!._id)}
                      name={m.memberId!.name}
                      email={m.memberId!.email}
                      role={m.role}
                      canEditProfile={authz.member.orgRole === "org_admin"}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
