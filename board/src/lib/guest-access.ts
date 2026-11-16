import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { getCurrentMember } from "@board/lib/get-current-member";
import { requireTeamRole, type AuthzFailure, type TeamRole } from "@board/lib/authz";
import { loadTeamWorkItem } from "@board/lib/work-items";
import { GuestGrant } from "@board/models/GuestGrant";
import type { WorkItemDoc } from "@board/models/WorkItem";
import type { MemberDoc } from "@board/models/Member";

type Id = string | mongoose.Types.ObjectId;

/**
 * MB-3: does this Member hold a Guest grant reaching this specific Work Item
 * — either a direct grant on the item itself, or a grant on the Initiative
 * it's tagged to (if any)? This is the only thing that can widen access
 * beyond a real Team role for a Guest.
 */
export async function hasGuestAccessToWorkItem(memberId: Id, item: WorkItemDoc): Promise<boolean> {
  await connectDB();
  const or: Record<string, unknown>[] = [{ workItemId: item._id }];
  if (item.initiativeId) or.push({ initiativeId: item.initiativeId });
  const grant = await GuestGrant.exists({ memberId, $or: or });
  return !!grant;
}

/** All Initiative-level grant ids this Member holds — used to bulk-check a list of items in one query. */
export async function guestInitiativeGrantIds(memberId: Id): Promise<Set<string>> {
  await connectDB();
  const grants = await GuestGrant.find({ memberId, initiativeId: { $ne: null } }, "initiativeId").lean<
    { initiativeId: mongoose.Types.ObjectId }[]
  >();
  return new Set(grants.map((g) => String(g.initiativeId)));
}

/** All direct-Work-Item grant ids this Member holds among the given item ids. */
export async function guestWorkItemGrantIds(memberId: Id, workItemIds: Id[]): Promise<Set<string>> {
  if (workItemIds.length === 0) return new Set();
  await connectDB();
  const grants = await GuestGrant.find(
    { memberId, workItemId: { $in: workItemIds } },
    "workItemId"
  ).lean<{ workItemId: mongoose.Types.ObjectId }[]>();
  return new Set(grants.map((g) => String(g.workItemId)));
}

export type WorkItemAccessRole = TeamRole | "guest";

export type WorkItemAccessResult =
  | { ok: true; member: MemberDoc; role: WorkItemAccessRole; item: WorkItemDoc }
  | AuthzFailure;

/**
 * The single enforcement point for "can this Member see this one Work
 * Item" (MB-4). Real Team role (viewer+) always wins first, unchanged from
 * Phase 3/4. Only when that fails does a Guest grant get a chance — and
 * only for this exact item (or its Initiative), never the whole Team.
 *
 * Deliberately returns the identical 403 — same status, same message —
 * whether the item doesn't exist or exists but isn't shared with this
 * Member: a Guest probing IDs can't tell the difference (MB-4: "should not
 * even see the item's existence").
 */
export async function requireWorkItemAccess(
  teamId: string,
  itemId: string
): Promise<WorkItemAccessResult> {
  const teamAuthz = await requireTeamRole(teamId, "viewer");
  if (teamAuthz.ok) {
    const item = await loadTeamWorkItem(teamId, itemId);
    if (!item) return { ok: false, status: 404, message: "Work Item not found." };
    return { ok: true, member: teamAuthz.member, role: teamAuthz.role, item };
  }
  // 401 (not authenticated) or 404 (Team itself doesn't exist) pass through unchanged.
  if (teamAuthz.status !== 403) return teamAuthz;

  const member = await getCurrentMember();
  if (!member) return { ok: false, status: 401, message: "Not authenticated." };

  if (!mongoose.isValidObjectId(itemId)) {
    return { ok: false, status: 403, message: "Insufficient Team role." };
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  const granted = item ? await hasGuestAccessToWorkItem(member._id, item) : false;
  if (!item || !granted) {
    return { ok: false, status: 403, message: "Insufficient Team role." };
  }

  return { ok: true, member, role: "guest", item };
}

/** Whether this access result permits posting a comment (Team Member+, or a Guest on this item). */
export function canCommentWithAccess(role: WorkItemAccessRole): boolean {
  return role === "guest" || role === "member" || role === "admin";
}
