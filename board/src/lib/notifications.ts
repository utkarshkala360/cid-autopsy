import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { Notification, type NotificationType } from "@board/models/Notification";
import { GuestGrant } from "@board/models/GuestGrant";
import { Team, type TeamDoc } from "@board/models/Team";
import { Member } from "@board/models/Member";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import type { WorkItemDoc } from "@board/models/WorkItem";

type Id = string | mongoose.Types.ObjectId;

/**
 * Who gets notified about a change to this Work Item: its reporter and
 * assignee, every Collaborator added to it (notify-only, same as an
 * @mention — see the field's docstring on the WorkItem model), plus every
 * Guest granted access to it — either directly or via its Initiative
 * (MB-5: Guests get the exact same notification treatment as any other role
 * for items they have access to, not a lesser path).
 */
export async function getWatchersForWorkItem(item: WorkItemDoc): Promise<string[]> {
  await connectDB();
  const ids = new Set<string>();
  if (item.reporter) ids.add(String(item.reporter));
  if (item.assignee) ids.add(String(item.assignee));
  (item.collaborators ?? []).forEach((c: Id) => ids.add(String(c)));

  const or: Record<string, unknown>[] = [{ workItemId: item._id }];
  if (item.initiativeId) or.push({ initiativeId: item.initiativeId });
  const grants = await GuestGrant.find({ $or: or }, "memberId").lean<{ memberId: mongoose.Types.ObjectId }[]>();
  grants.forEach((g) => ids.add(String(g.memberId)));

  return [...ids];
}

async function insertNotifications(params: {
  organizationId: Id;
  actorId: Id;
  teamId: Id;
  workItemId: Id;
  workItemTitle: string;
  type: NotificationType;
  oldValue?: string | null;
  newValue?: string | null;
  recipientIds: Id[];
}) {
  const recipients = [...new Set(params.recipientIds.map(String))].filter(
    (id) => id !== String(params.actorId)
  );
  if (recipients.length === 0) return [];
  await connectDB();
  return Notification.insertMany(
    recipients.map((recipientId) => ({
      organizationId: params.organizationId,
      recipientId,
      actorId: params.actorId,
      teamId: params.teamId,
      workItemId: params.workItemId,
      workItemTitle: params.workItemTitle,
      type: params.type,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
    }))
  );
}

export async function notifyStatusChange(params: {
  organizationId: Id;
  actorId: Id;
  item: WorkItemDoc;
  oldStatusLabel: string;
  newStatusLabel: string;
}) {
  const watchers = await getWatchersForWorkItem(params.item);
  return insertNotifications({
    organizationId: params.organizationId,
    actorId: params.actorId,
    teamId: params.item.teamId,
    workItemId: params.item._id,
    workItemTitle: params.item.title,
    type: "status_change",
    oldValue: params.oldStatusLabel,
    newValue: params.newStatusLabel,
    recipientIds: watchers,
  });
}

export async function notifyAssignment(params: {
  organizationId: Id;
  actorId: Id;
  item: WorkItemDoc;
  assigneeId: Id;
}) {
  return insertNotifications({
    organizationId: params.organizationId,
    actorId: params.actorId,
    teamId: params.item.teamId,
    workItemId: params.item._id,
    workItemTitle: params.item.title,
    type: "assignment",
    recipientIds: [params.assigneeId],
  });
}

export async function notifyMentions(params: {
  organizationId: Id;
  actorId: Id;
  teamId: Id;
  workItemId: Id;
  workItemTitle: string;
  mentionedMemberIds: Id[];
}) {
  return insertNotifications({
    organizationId: params.organizationId,
    actorId: params.actorId,
    teamId: params.teamId,
    workItemId: params.workItemId,
    workItemTitle: params.workItemTitle,
    type: "mention",
    recipientIds: params.mentionedMemberIds,
  });
}

export type NotificationView = {
  id: string;
  type: NotificationType;
  message: string;
  workItemId: string;
  teamId: string;
  read: boolean;
  createdAt: string;
};

/**
 * Every notification is rendered from a live join to Team (for the
 * ORG-8 display label) plus the actor's name — never from wording baked in
 * at creation time, so a Team renaming its label later doesn't leave old
 * notifications reading inconsistently (ORG-8: applied "everywhere",
 * including notifications).
 */
export async function listNotificationsForMember(
  memberId: Id,
  limit = 30
): Promise<{ notifications: NotificationView[]; unreadCount: number }> {
  await connectDB();
  const [rows, unreadCount] = await Promise.all([
    Notification.find({ recipientId: memberId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          type: NotificationType;
          actorId: mongoose.Types.ObjectId;
          teamId: mongoose.Types.ObjectId;
          workItemId: mongoose.Types.ObjectId;
          workItemTitle: string;
          oldValue: string | null;
          newValue: string | null;
          read: boolean;
          createdAt: Date;
        }[]
      >(),
    Notification.countDocuments({ recipientId: memberId, read: false }),
  ]);

  if (rows.length === 0) return { notifications: [], unreadCount };

  const teamIds = [...new Set(rows.map((r) => String(r.teamId)))];
  const actorIds = [...new Set(rows.map((r) => String(r.actorId)))];
  const [teams, actors] = await Promise.all([
    Team.find({ _id: { $in: teamIds } }, "organizationId name displayLabel primaryWorkItemType").lean<TeamDoc[]>(),
    Member.find({ _id: { $in: actorIds } }, "name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>(),
  ]);
  const teamById = new Map(teams.map((t) => [String(t._id), t]));
  const actorNameById = new Map(actors.map((a) => [String(a._id), a.name]));
  // v1 has exactly one Organization (ORG-1), so any Team in scope carries
  // the same organizationId the template registry is keyed by — this file
  // has no Member context of its own to source it from otherwise.
  const templates = teams.length ? await getWorkItemTemplateDefs(teams[0].organizationId) : [];

  const notifications = rows.map((r) => {
    const team = teamById.get(String(r.teamId));
    const label = team ? labelForTeam(team, templates) : "Work Item";
    const actorName = actorNameById.get(String(r.actorId)) ?? "Someone";
    const title = r.workItemTitle;

    let message: string;
    if (r.type === "mention") {
      message = `${actorName} mentioned you in ${label} "${title}"`;
    } else if (r.type === "assignment") {
      message = `${actorName} assigned you to ${label} "${title}"`;
    } else {
      message = `${actorName} moved ${label} "${title}" from ${r.oldValue} to ${r.newValue}`;
    }

    return {
      id: String(r._id),
      type: r.type,
      message,
      workItemId: String(r.workItemId),
      teamId: String(r.teamId),
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return { notifications, unreadCount };
}
