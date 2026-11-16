import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { WorkItem } from "@board/models/WorkItem";
import { Team } from "@board/models/Team";
import { TeamMembership } from "@board/models/TeamMembership";
import { Member } from "@board/models/Member";
import type { MentionableMember } from "@board/lib/mentions";

export async function loadTeamWorkItem(teamId: string, itemId: string) {
  if (!mongoose.isValidObjectId(itemId)) return null;
  await connectDB();
  return WorkItem.findOne({ _id: itemId, teamId });
}

type PopulatedMembership = {
  memberId: { _id: unknown; name: string; email: string } | null;
};

/**
 * Everyone with real access to this Team: explicit TeamMembership rows plus
 * every org-wide Org Admin (who has Admin here by inheritance, MB-2, even
 * without a membership row — see effectiveTeamRole in authz.ts). Used for
 * the assignee picker and any "member" custom field, so an Org Admin acting
 * on a Team they never got explicitly added to is still assignable. Comment
 * @mentions intentionally use the wider getOrgMentionCandidates below
 * instead — see its docstring.
 */
export async function getTeamMentionCandidates(teamId: string): Promise<MentionableMember[]> {
  await connectDB();
  const team = await Team.findById(teamId).lean<{ organizationId: unknown }>();

  const [memberships, orgAdmins] = await Promise.all([
    TeamMembership.find({ teamId })
      .populate("memberId", "name email")
      .lean<PopulatedMembership[]>(),
    team
      ? Member.find(
          { organizationId: team.organizationId, orgRole: "org_admin" },
          "name email"
        ).lean()
      : Promise.resolve([]),
  ]);

  const byId = new Map<string, { name: string; email: string }>();
  for (const admin of orgAdmins) {
    byId.set(String(admin._id), { name: admin.name, email: admin.email });
  }
  for (const m of memberships) {
    if (m.memberId) {
      byId.set(String(m.memberId._id), {
        name: m.memberId.name,
        email: m.memberId.email,
      });
    }
  }

  return [...byId.entries()].map(([id, { name, email }]) => ({
    id,
    name,
    email,
  }));
}

/**
 * Every active Member in the Organization — deliberately wider than
 * getTeamMentionCandidates. @mentions are allowed to reach a Member with no
 * access to this Team; they still get notified (MB-5 draws no distinction
 * by role/access here), they just can't open the item without a Guest grant.
 * Not used for the assignee picker or custom fields, which stay Team-scoped.
 */
export async function getOrgMentionCandidates(
  organizationId: string
): Promise<MentionableMember[]> {
  await connectDB();
  const members = await Member.find({ organizationId }, "name email").lean<
    { _id: unknown; name: string; email: string }[]
  >();
  return members.map((m) => ({ id: String(m._id), name: m.name, email: m.email }));
}
