import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { CreateTeamForm } from "@board/components/teams/create-team-form";
import { TeamRow } from "@board/components/teams/team-row";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

export default async function TeamsSettingsPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      
        <ForbiddenState message="Creating, renaming, and deactivating Teams is an Org Admin action (ORG-2). Ask your Org Admin for access." />
    );
  }

  await connectDB();
  const [teams, templates] = await Promise.all([
    Team.find({ organizationId: member.organizationId }).sort({ name: 1 }).lean<TeamDoc[]>(),
    getWorkItemTemplateDefs(member.organizationId),
  ]);

  return (
    
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
            Teams
          </h1>
          <p className="mt-1 text-xs text-slate">
            Create, rename, and deactivate Teams. Every Team shares the same Work
            Item engine — no Team-specific code (ORG-4).
          </p>
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          <CreateTeamForm templates={templates} />
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          {teams.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-slate mb-3">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate">
                No Teams yet. Create the first one above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
                    <th className="pb-2 pr-4 font-semibold">Name</th>
                    <th className="pb-2 pr-4 font-semibold">Slug</th>
                    <th className="pb-2 pr-4 font-semibold">Template</th>
                    <th className="pb-2 pr-4 font-semibold">Status</th>
                    <th className="pb-2 pr-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <TeamRow
                      key={String(team._id)}
                      teamId={String(team._id)}
                      name={team.name}
                      slug={team.slug}
                      active={team.active}
                      primaryWorkItemType={team.primaryWorkItemType}
                      templates={templates}
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
