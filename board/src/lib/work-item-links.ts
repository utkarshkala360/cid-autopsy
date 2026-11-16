import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { WorkItemLink } from "@board/models/WorkItemLink";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { Team, type TeamDoc } from "@board/models/Team";
import { resolveTeamRole } from "@board/lib/authz";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import type { MemberDoc } from "@board/models/Member";
import { FORWARD_LINK_LABEL, INVERSE_LINK_LABEL, type LinkType } from "@board/lib/link-types";
import type { StatusCategory } from "@board/lib/status-categories";

export type LinkedWorkItemView = {
  linkId: string;
  relationLabel: string;
  viewable: boolean;
  item: {
    id: string;
    title: string;
    type: string;
    teamId: string;
    teamName: string;
    status: string;
    statusLabel: string;
    statusCategory: StatusCategory;
  } | null;
};

/**
 * Every link touching this Work Item, from either direction, with the
 * relation label resolved relative to `workItemId` (CT — "visible and
 * navigable from either Work Item", ORG-6). The other side's details are
 * only populated if the requesting Member has at least Viewer on the other
 * item's Team — otherwise it's a real "restricted" state, not a broken
 * link or a silent leak across a Team boundary the Member has no access to.
 */
export async function getLinksForWorkItem(
  workItemId: string,
  requester: MemberDoc
): Promise<LinkedWorkItemView[]> {
  await connectDB();
  const links = await WorkItemLink.find({
    $or: [{ fromWorkItemId: workItemId }, { toWorkItemId: workItemId }],
  }).lean<{ _id: mongoose.Types.ObjectId; fromWorkItemId: mongoose.Types.ObjectId; toWorkItemId: mongoose.Types.ObjectId; type: LinkType }[]>();

  if (links.length === 0) return [];

  const otherIds = links.map((l) =>
    String(l.fromWorkItemId) === workItemId ? l.toWorkItemId : l.fromWorkItemId
  );
  const otherItems = await WorkItem.find({ _id: { $in: otherIds } }).lean<WorkItemDoc[]>();
  const itemById = new Map(otherItems.map((i) => [String(i._id), i]));

  const teamIds = [...new Set(otherItems.map((i) => String(i.teamId)))];
  const teams = teamIds.length ? await Team.find({ _id: { $in: teamIds } }).lean<TeamDoc[]>() : [];
  const teamById = new Map(teams.map((t) => [String(t._id), t]));

  const roleByTeamId = new Map(
    await Promise.all(teamIds.map(async (id) => [id, await resolveTeamRole(requester, id)] as const))
  );

  const workflowCache = new Map<string, Awaited<ReturnType<typeof getEffectiveWorkflow>>>();

  const results: LinkedWorkItemView[] = [];
  for (const link of links) {
    const isOutgoing = String(link.fromWorkItemId) === workItemId;
    const otherId = String(isOutgoing ? link.toWorkItemId : link.fromWorkItemId);
    const other = itemById.get(otherId);
    const relationLabel = isOutgoing ? FORWARD_LINK_LABEL[link.type] : INVERSE_LINK_LABEL[link.type];

    if (!other) {
      results.push({ linkId: String(link._id), relationLabel, viewable: false, item: null });
      continue;
    }

    const otherTeamId = String(other.teamId);
    const role = roleByTeamId.get(otherTeamId);
    if (!role) {
      results.push({ linkId: String(link._id), relationLabel, viewable: false, item: null });
      continue;
    }

    const workflowKey = `${otherTeamId}|${other.type}`;
    let workflow = workflowCache.get(workflowKey);
    if (!workflow) {
      workflow = await getEffectiveWorkflow(otherTeamId, other.type);
      workflowCache.set(workflowKey, workflow);
    }
    const statusMeta = resolveStatusMeta(workflow.statuses, other.status);
    const team = teamById.get(otherTeamId);

    results.push({
      linkId: String(link._id),
      relationLabel,
      viewable: true,
      item: {
        id: String(other._id),
        title: other.title,
        type: other.type,
        teamId: otherTeamId,
        teamName: team?.name ?? "Unknown Team",
        status: other.status,
        statusLabel: statusMeta.label,
        statusCategory: statusMeta.category,
      },
    });
  }

  return results;
}
