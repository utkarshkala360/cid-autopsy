import "server-only";
import { cache } from "react";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { getCurrentMember } from "@board/lib/get-current-member";
import { Team } from "@board/models/Team";
import {
  TeamMembership,
  TEAM_ROLES,
  type TeamRole,
} from "@board/models/TeamMembership";
import type { MemberDoc, OrgRole } from "@board/models/Member";

const ROLE_RANK: Record<TeamRole, number> = { viewer: 1, member: 2, admin: 3 };

export type AuthzFailure = {
  ok: false;
  status: 401 | 403 | 404;
  message: string;
};

/**
 * Org Admin's Team role is inherited on every Team by default (MB-2) unless
 * a Member has an explicit TeamMembership row for that Team. This is the one
 * place that rule is encoded — everything else calls through it.
 */
export function effectiveTeamRole(
  orgRole: OrgRole,
  explicitRole: TeamRole | null | undefined
): TeamRole | null {
  if (explicitRole) return explicitRole;
  if (orgRole === "org_admin") return "admin";
  return null;
}

/**
 * Memoized per-request via React's cache() (Phase 11) — a page/route
 * commonly resolves the same Member's role on the same Team more than once
 * (e.g. an authz gate plus a later display check); this dedupes the
 * TeamMembership lookup within that one request only, same pattern as
 * getCurrentMember(). Never shared across requests/users, so it carries none
 * of the cross-Team/Guest leakage risk a server-side cache would.
 */
export const resolveTeamRole = cache(
  async (
    member: MemberDoc,
    teamId: string | mongoose.Types.ObjectId
  ): Promise<TeamRole | null> => {
    await connectDB();
    const membership = await TeamMembership.findOne({
      memberId: member._id,
      teamId,
    }).lean<{ role: TeamRole }>();
    return effectiveTeamRole(member.orgRole, membership?.role);
  }
);

export async function requireOrgAdmin(): Promise<
  AuthzFailure | { ok: true; member: MemberDoc }
> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, status: 401, message: "Not authenticated." };
  }
  if (member.orgRole !== "org_admin") {
    return { ok: false, status: 403, message: "Org Admin access required." };
  }
  return { ok: true, member };
}

/**
 * The canonical enforcement point for every Team-scoped action in this
 * codebase (ORG-2 through ORG-8, §7.7 Roles & Permissions Matrix). Any route
 * that checks a Team permission a different way is a bug.
 */
export async function requireTeamRole(
  teamId: string,
  minimumRole: TeamRole
): Promise<AuthzFailure | { ok: true; member: MemberDoc; role: TeamRole }> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, status: 401, message: "Not authenticated." };
  }

  if (!mongoose.isValidObjectId(teamId)) {
    return { ok: false, status: 404, message: "Team not found." };
  }

  await connectDB();
  const team = await Team.findById(teamId).lean();
  if (!team) {
    return { ok: false, status: 404, message: "Team not found." };
  }

  const role = await resolveTeamRole(member, teamId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    return { ok: false, status: 403, message: "Insufficient Team role." };
  }

  return { ok: true, member, role };
}

/**
 * Customer records (§7.8) are Org-level, not owned by one Team, so there's no
 * `teamId` to call `requireTeamRole` with. The Roles & Permissions Matrix
 * grants "Manage Customer records" to Org Admin and to Team Admin "(own Team,
 * if applicable)" — read here as: any Member holding Team Admin on *some*
 * Team, since Support/Sales/CS are the Teams that would plausibly manage
 * Customers and any of them qualifies. View access (GET) is intentionally
 * not gated by this — every non-Guest role gets read access per the matrix,
 * and Guest as a real principal doesn't exist yet (see Phase 3/4 notes).
 */
export async function requireAnyTeamAdmin(): Promise<
  AuthzFailure | { ok: true; member: MemberDoc }
> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, status: 401, message: "Not authenticated." };
  }
  if (member.orgRole === "org_admin") {
    return { ok: true, member };
  }
  await connectDB();
  const hasAdminSomewhere = await TeamMembership.exists({
    memberId: member._id,
    role: "admin",
  });
  if (!hasAdminSomewhere) {
    return {
      ok: false,
      status: 403,
      message: "Team Admin (on any Team) or Org Admin access required.",
    };
  }
  return { ok: true, member };
}

/**
 * Profile management (name/avatar/password): a Member may always manage
 * their own, and an Org Admin may manage anyone's — no other role may touch
 * someone else's profile. `isSelf` tells the caller which branch it's in,
 * since the two allowed paths behave differently (e.g. changing your own
 * password needs the current one; an Org Admin changing someone else's
 * doesn't).
 */
export async function requireSelfOrOrgAdmin(
  targetMemberId: string
): Promise<AuthzFailure | { ok: true; member: MemberDoc; isSelf: boolean }> {
  const member = await getCurrentMember();
  if (!member) {
    return { ok: false, status: 401, message: "Not authenticated." };
  }
  const isSelf = String(member._id) === targetMemberId;
  if (isSelf || member.orgRole === "org_admin") {
    return { ok: true, member, isSelf };
  }
  return { ok: false, status: 403, message: "You can only manage your own profile." };
}

export { TEAM_ROLES };
export type { TeamRole };
