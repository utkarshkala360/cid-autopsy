import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { effectiveTeamRole } from "@board/lib/authz";
import { Team, type TeamDoc } from "@board/models/Team";
import { TeamMembership } from "@board/models/TeamMembership";
import type { TeamRole } from "@board/models/TeamMembership";
import type { MemberDoc } from "@board/models/Member";

export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uniqueSlugFor(name: string) {
  await connectDB();
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  while (await Team.exists({ slug })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

export async function listMemberTeamsWithRoles(
  member: MemberDoc
): Promise<{ team: TeamDoc; role: TeamRole }[]> {
  await connectDB();
  const [teams, memberships] = await Promise.all([
    Team.find({ organizationId: member.organizationId }).sort({ name: 1 }).lean<TeamDoc[]>(),
    TeamMembership.find({ memberId: member._id }).lean<{ teamId: unknown; role: TeamRole }[]>(),
  ]);

  const roleByTeamId = new Map(
    memberships.map((m) => [String(m.teamId), m.role])
  );

  return teams
    .map((team) => {
      const role = effectiveTeamRole(member.orgRole, roleByTeamId.get(String(team._id)));
      return role ? { team, role } : null;
    })
    .filter((entry): entry is { team: TeamDoc; role: TeamRole } => entry !== null);
}
