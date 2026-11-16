import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import {
  InitiativeDetail,
  type LinkedWorkItem,
  type StageHistoryEntry,
  type InitiativeSprintPanel,
} from "@board/components/initiatives/initiative-detail";
import { getCurrentMember } from "@board/lib/get-current-member";
import { resolveTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { TeamMembership } from "@board/models/TeamMembership";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { Team, type TeamDoc } from "@board/models/Team";
import { GuestGrant, type GuestGrantDoc } from "@board/models/GuestGrant";
import { ChangeHistory, type ChangeHistoryDoc } from "@board/models/ChangeHistory";
import { Member } from "@board/models/Member";
import { Customer } from "@board/models/Customer";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { resolveOrigin } from "@board/lib/origin-links";
import { getStageTrack, stageLabel } from "@board/lib/stage-tracks";
import { sortTimeline, type TimelineEntry } from "@board/lib/timeline";
import { computeBurndown } from "@board/lib/sprint-reports";
import type { BoardItem } from "@board/components/work-items/board-card";
import type { SprintStatus } from "@board/lib/sprint-status";

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (!mongoose.isValidObjectId(initiativeId)) {
    return (
      
        <ForbiddenState title="Initiative not found" message="This Initiative doesn't exist or was removed." />
    );
  }

  await connectDB();
  const [initiative, hasTeamAdmin, lifecycleTrack, customers] = await Promise.all([
    Initiative.findOne({ _id: initiativeId, organizationId: member.organizationId }).lean<InitiativeDoc>(),
    member.orgRole === "org_admin"
      ? Promise.resolve(true)
      : TeamMembership.exists({ memberId: member._id, role: "admin" }),
    getStageTrack(member.organizationId, "initiative"),
    Customer.find({ organizationId: member.organizationId }, "name").sort({ name: 1 }).lean(),
  ]);

  if (!initiative) {
    return (
      
        <ForbiddenState title="Initiative not found" message="This Initiative doesn't exist or was removed." />
    );
  }

  const canManage = member.orgRole === "org_admin" || !!hasTeamAdmin;

  const allItems = await WorkItem.find({ initiativeId }).sort({ updatedAt: -1 }).lean<WorkItemDoc[]>();

  const teamIds = [...new Set(allItems.map((i) => String(i.teamId)))];
  const teams = teamIds.length
    ? await Team.find({ _id: { $in: teamIds } }, "name displayLabel primaryWorkItemType").lean<TeamDoc[]>()
    : [];
  const teamById = new Map(teams.map((t) => [String(t._id), t]));

  // MB-4: an Initiative is Org-level, but its linked Work Items still live
  // inside their own Team — visible here only if the requester has a real
  // Team role on that item's Team, OR holds a Guest grant reaching it
  // (directly, or via a grant on this whole Initiative). Same boundary the
  // cross-team link panel enforces (src/lib/work-item-links.ts).
  const [roleEntries, hasInitiativeGrant, directGrantIds] = await Promise.all([
    Promise.all(teamIds.map(async (id) => [id, await resolveTeamRole(member, id)] as const)),
    GuestGrant.exists({ memberId: member._id, initiativeId }),
    GuestGrant.find(
      { memberId: member._id, workItemId: { $in: allItems.map((i) => i._id) } },
      "workItemId"
    ).lean<{ workItemId: mongoose.Types.ObjectId }[]>(),
  ]);
  const roleByTeamId = new Map(roleEntries);
  const directGrantIdSet = new Set(directGrantIds.map((g) => String(g.workItemId)));

  const items = allItems.filter((item) => {
    if (roleByTeamId.get(String(item.teamId))) return true;
    if (hasInitiativeGrant) return true;
    return directGrantIdSet.has(String(item._id));
  });
  const hiddenCount = allItems.length - items.length;

  const combos = new Map<string, { teamId: string; type: string }>();
  for (const item of items) combos.set(`${item.teamId}|${item.type}`, { teamId: String(item.teamId), type: item.type });
  const workflowByCombo = new Map(
    await Promise.all(
      [...combos.entries()].map(
        async ([key, c]) => [key, await getEffectiveWorkflow(c.teamId, c.type)] as const
      )
    )
  );

  const templates = await getWorkItemTemplateDefs(member.organizationId);

  const linkedItems: LinkedWorkItem[] = items.map((item) => {
    const workflow = workflowByCombo.get(`${item.teamId}|${item.type}`)!;
    const statusMeta = resolveStatusMeta(workflow.statuses, item.status);
    const team = teamById.get(String(item.teamId));
    return {
      id: String(item._id),
      title: item.title,
      teamId: String(item.teamId),
      teamName: team?.name ?? "Unknown Team",
      typeLabel: team ? labelForTeam(team, templates) : "Work Item",
      statusLabel: statusMeta.label,
      statusCategory: statusMeta.category,
      priority: item.priority as LinkedWorkItem["priority"],
    };
  });

  const guestGrants = canManage
    ? await GuestGrant.find({ initiativeId })
        .populate("memberId", "name email")
        .sort({ createdAt: 1 })
        .lean<(GuestGrantDoc & { memberId: { _id: unknown; name: string; email: string } | null })[]>()
    : [];

  const lifecycleModuleEnabled = lifecycleTrack?.enabled ?? false;
  let stageHistory: StageHistoryEntry[] = [];
  if (lifecycleModuleEnabled) {
    const rows = await ChangeHistory.find({ initiativeId, field: "lifecycleStage" })
      .sort({ createdAt: 1 })
      .lean<ChangeHistoryDoc[]>();
    const memberIds = [...new Set(rows.map((r) => String(r.memberId)))];
    const members = memberIds.length
      ? await Member.find({ _id: { $in: memberIds } }, "name").lean()
      : [];
    const nameById = new Map(members.map((m) => [String(m._id), m.name as string]));
    stageHistory = rows.map((r) => ({
      id: String(r._id),
      oldValue: (r.oldValue as string | null) ?? null,
      newValue: (r.newValue as string | null) ?? null,
      memberName: nameById.get(String(r.memberId)) ?? "Someone",
      createdAt: r.createdAt.toISOString(),
    }));
  }

  const origin = await resolveOrigin(
    initiative.originatedFromKind,
    initiative.originatedFromId,
    member
  );

  // XM-2: Timeline — a chronological feed merging stage changes with
  // activity (creation, status changes, comments) from every Work Item
  // visible on this Initiative. "No new data store; a filtered read of
  // what's already being logged" — every row here already exists in
  // ChangeHistory or on `items` (both already fetched above for the
  // Linked Work Items panel and stageHistory).
  const activityRows = items.length
    ? await ChangeHistory.find({
        workItemId: { $in: items.map((i) => i._id) },
        $or: [{ kind: "comment" }, { field: "status" }],
      })
        .sort({ createdAt: 1 })
        .lean<ChangeHistoryDoc[]>()
    : [];
  const timelineMemberIds = [
    ...new Set([
      ...activityRows.map((r) => String(r.memberId)),
      ...items.map((i) => String(i.reporter)),
    ]),
  ];
  const timelineMembers = timelineMemberIds.length
    ? await Member.find({ _id: { $in: timelineMemberIds } }, "name").lean()
    : [];
  const timelineNameById = new Map(timelineMembers.map((m) => [String(m._id), m.name as string]));
  const itemById = new Map(items.map((i) => [String(i._id), i]));

  const timelineEntries: TimelineEntry[] = [];
  if (lifecycleModuleEnabled) {
    for (const h of stageHistory) {
      timelineEntries.push({
        id: `stage-${h.id}`,
        createdAt: h.createdAt,
        kind: "stage_change",
        memberName: h.memberName,
        oldLabel: stageLabel(lifecycleTrack, h.oldValue),
        newLabel: stageLabel(lifecycleTrack, h.newValue),
      });
    }
  }
  for (const item of items) {
    timelineEntries.push({
      id: `created-${item._id}`,
      createdAt: item.createdAt.toISOString(),
      kind: "item_created",
      memberName: timelineNameById.get(String(item.reporter)) ?? "Someone",
      itemId: String(item._id),
      itemKey: item.key,
      itemTitle: item.title,
      teamId: String(item.teamId),
    });
  }
  for (const row of activityRows) {
    const item = itemById.get(String(row.workItemId));
    if (!item) continue;
    const workflow = workflowByCombo.get(`${item.teamId}|${item.type}`);
    if (row.kind === "comment") {
      timelineEntries.push({
        id: String(row._id),
        createdAt: row.createdAt.toISOString(),
        kind: "item_comment",
        memberName: timelineNameById.get(String(row.memberId)) ?? "Someone",
        itemId: String(item._id),
        itemKey: item.key,
        itemTitle: item.title,
        teamId: String(item.teamId),
        commentPreview: (row.commentText ?? "").slice(0, 80),
      });
    } else if (row.kind === "field_change" && row.field === "status") {
      const oldLabel = workflow
        ? resolveStatusMeta(workflow.statuses, String(row.oldValue)).label
        : String(row.oldValue);
      const newLabel = workflow
        ? resolveStatusMeta(workflow.statuses, String(row.newValue)).label
        : String(row.newValue);
      timelineEntries.push({
        id: String(row._id),
        createdAt: row.createdAt.toISOString(),
        kind: "item_status_change",
        memberName: timelineNameById.get(String(row.memberId)) ?? "Someone",
        itemId: String(item._id),
        itemKey: item.key,
        itemTitle: item.title,
        teamId: String(item.teamId),
        oldLabel,
        newLabel,
      });
    }
  }
  const timeline = sortTimeline(timelineEntries);

  // Phase 16 (Design 2, Sprint/Initiative unification): the second render
  // mode — set only when this Initiative is Team-run (teamId set). Reuses
  // the exact same Board/Burndown data-shaping the old Sprint detail page
  // did, just scoped by teamInitiativeId instead of sprintId.
  let sprintProps: InitiativeSprintPanel | null = null;
  if (initiative.teamId) {
    const sprintTeamId = String(initiative.teamId);
    const [sprintTeam, sprintRole] = await Promise.all([
      Team.findById(sprintTeamId).lean<TeamDoc>(),
      resolveTeamRole(member, sprintTeamId),
    ]);
    if (sprintTeam) {
      const workItemType = sprintTeam.primaryWorkItemType;
      const [workflow, sprintItems, backlogItems, burndown] = await Promise.all([
        getEffectiveWorkflow(sprintTeamId, workItemType),
        WorkItem.find({ teamId: sprintTeamId, type: workItemType, teamInitiativeId: initiative._id })
          .sort({ order: 1, createdAt: 1 })
          .lean<WorkItemDoc[]>(),
        initiative.sprintStatus !== "completed"
          ? WorkItem.find({ teamId: sprintTeamId, type: workItemType, teamInitiativeId: null })
              .sort({ order: 1 })
              .lean<WorkItemDoc[]>()
          : Promise.resolve([]),
        initiative.sprintStatus !== "planned"
          ? computeBurndown(initiative)
          : Promise.resolve({ totalItems: 0, points: [] }),
      ]);

      const assigneeIds = [...new Set(sprintItems.map((i) => i.assignee).filter(Boolean).map(String))];
      const assignees = assigneeIds.length
        ? await Member.find({ _id: { $in: assigneeIds } }, "name").lean()
        : [];
      const assigneeMap = new Map(assignees.map((a) => [String(a._id), a.name as string]));

      const boardItems: BoardItem[] = sprintItems.map((item) => ({
        id: String(item._id),
        key: item.key,
        title: item.title,
        status: item.status,
        priority: item.priority as BoardItem["priority"],
        assigneeName: item.assignee ? assigneeMap.get(String(item.assignee)) ?? null : null,
        labels: item.labels ?? [],
        dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
        order: item.order ?? 0,
        createdAt: new Date(item.createdAt).toISOString(),
        isEpic: Boolean(item.isEpic),
      }));

      function toMoverItem(item: WorkItemDoc) {
        const statusMeta = resolveStatusMeta(workflow.statuses, item.status);
        return {
          id: String(item._id),
          title: item.title,
          statusLabel: statusMeta.label,
          statusCategory: statusMeta.category,
        };
      }

      sprintProps = {
        teamId: sprintTeamId,
        status: initiative.sprintStatus as SprintStatus,
        goal: initiative.sprintGoal ?? "",
        startDate: initiative.startDate ? new Date(initiative.startDate).toISOString() : new Date().toISOString(),
        endDate: initiative.endDate ? new Date(initiative.endDate).toISOString() : new Date().toISOString(),
        canManage: sprintRole === "member" || sprintRole === "admin",
        boardItems,
        columns: workflow.statuses,
        transitions: workflow.transitions,
        itemLabel: labelForTeam(sprintTeam, templates),
        burndown,
        initialSprintItems: sprintItems.map(toMoverItem),
        initialBacklog: backlogItems.map(toMoverItem),
      };
    }
  }

  return (

      <InitiativeDetail
        initiativeId={String(initiative._id)}
        initialName={initiative.name}
        initialDescription={initiative.description}
        canManage={canManage}
        linkedItems={linkedItems}
        hiddenCount={hiddenCount}
        initialGuestGrants={guestGrants
          .filter((g) => g.memberId)
          .map((g) => ({ id: String(g._id), memberName: g.memberId!.name, memberEmail: g.memberId!.email }))}
        lifecycleModuleEnabled={lifecycleModuleEnabled}
        lifecycleStages={lifecycleTrack?.stages ?? []}
        isOrgAdmin={member.orgRole === "org_admin"}
        initialLifecycleStage={initiative.lifecycleStage ?? null}
        stageHistory={stageHistory}
        initialOrigin={origin}
        customers={customers.map((c) => ({ id: String(c._id), name: c.name as string }))}
        timelineEntries={timeline}
        sprint={sprintProps}
      />
  );
}
