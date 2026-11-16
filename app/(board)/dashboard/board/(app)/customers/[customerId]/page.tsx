import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { CustomerDetail, type LinkedTicket, type StageHistoryEntry } from "@board/components/customers/customer-detail";
import { getCurrentMember } from "@board/lib/get-current-member";
import { resolveTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Customer, type CustomerDoc } from "@board/models/Customer";
import { TeamMembership } from "@board/models/TeamMembership";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { Team } from "@board/models/Team";
import { GuestGrant } from "@board/models/GuestGrant";
import { ChangeHistory, type ChangeHistoryDoc } from "@board/models/ChangeHistory";
import { Member } from "@board/models/Member";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import { getStageTrack, stageLabel } from "@board/lib/stage-tracks";
import { sortTimeline, type TimelineEntry } from "@board/lib/timeline";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (!mongoose.isValidObjectId(customerId)) {
    return (
      
        <ForbiddenState title="Customer not found" message="This Customer doesn't exist or was removed." />
    );
  }

  await connectDB();
  const [customer, hasTeamAdmin, journeyTrack] = await Promise.all([
    Customer.findOne({ _id: customerId, organizationId: member.organizationId }).lean<CustomerDoc>(),
    member.orgRole === "org_admin"
      ? Promise.resolve(true)
      : TeamMembership.exists({ memberId: member._id, role: "admin" }),
    getStageTrack(member.organizationId, "customer"),
  ]);

  if (!customer) {
    return (
      
        <ForbiddenState title="Customer not found" message="This Customer doesn't exist or was removed." />
    );
  }

  const allTickets = await WorkItem.find({ customerId })
    .sort({ updatedAt: -1 })
    .lean<WorkItemDoc[]>();

  const allTeamIds = [...new Set(allTickets.map((t) => String(t.teamId)))];

  // MB-4: a Customer record itself is viewable by any Member (Phase 6), but
  // the Tickets linked to it still live inside their own Team — visible
  // here only with a real Team role on that Ticket's Team, or a Guest grant
  // reaching it directly. Same boundary Phase 8 applied to the Initiative
  // detail page's linked Work Items; this page never had it, and building a
  // Timeline that surfaces real comment text off these same Tickets would
  // have made the gap worse, so it's fixed here rather than left as-is.
  const [roleEntries, directGrantIds] = await Promise.all([
    Promise.all(allTeamIds.map(async (id) => [id, await resolveTeamRole(member, id)] as const)),
    GuestGrant.find(
      { memberId: member._id, workItemId: { $in: allTickets.map((t) => t._id) } },
      "workItemId"
    ).lean<{ workItemId: mongoose.Types.ObjectId }[]>(),
  ]);
  const roleByTeamId = new Map(roleEntries);
  const directGrantIdSet = new Set(directGrantIds.map((g) => String(g.workItemId)));

  const tickets = allTickets.filter(
    (t) => roleByTeamId.get(String(t.teamId)) || directGrantIdSet.has(String(t._id))
  );
  const hiddenCount = allTickets.length - tickets.length;

  const teamIds = [...new Set(tickets.map((t) => String(t.teamId)))];
  const teams = teamIds.length
    ? await Team.find({ _id: { $in: teamIds } }, "name").lean()
    : [];
  const teamNameById = new Map(teams.map((t) => [String(t._id), t.name as string]));

  const workflowByTeam = new Map(
    await Promise.all(
      teamIds.map(async (teamId) => [teamId, await getEffectiveWorkflow(teamId, "ticket")] as const)
    )
  );

  const linkedTickets: LinkedTicket[] = tickets.map((t) => {
    const workflow = workflowByTeam.get(String(t.teamId))!;
    const statusMeta = resolveStatusMeta(workflow.statuses, t.status);
    return {
      id: String(t._id),
      title: t.title,
      teamId: String(t.teamId),
      teamName: teamNameById.get(String(t.teamId)) ?? "Unknown Team",
      statusLabel: statusMeta.label,
      statusCategory: statusMeta.category,
      priority: t.priority as LinkedTicket["priority"],
    };
  });

  const journeyModuleEnabled = journeyTrack?.enabled ?? false;
  let stageHistory: StageHistoryEntry[] = [];
  if (journeyModuleEnabled) {
    const rows = await ChangeHistory.find({ customerId, field: "journeyStage" })
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

  // XM-2: Timeline — same "no new data store" merge Initiatives get,
  // scoped to Tickets the requester can actually see (the `tickets` list
  // above, already MB-4-filtered).
  const activityRows = tickets.length
    ? await ChangeHistory.find({
        workItemId: { $in: tickets.map((t) => t._id) },
        $or: [{ kind: "comment" }, { field: "status" }],
      })
        .sort({ createdAt: 1 })
        .lean<ChangeHistoryDoc[]>()
    : [];
  const timelineMemberIds = [
    ...new Set([
      ...activityRows.map((r) => String(r.memberId)),
      ...tickets.map((t) => String(t.reporter)),
    ]),
  ];
  const timelineMembers = timelineMemberIds.length
    ? await Member.find({ _id: { $in: timelineMemberIds } }, "name").lean()
    : [];
  const timelineNameById = new Map(timelineMembers.map((m) => [String(m._id), m.name as string]));
  const ticketById = new Map(tickets.map((t) => [String(t._id), t]));

  const timelineEntries: TimelineEntry[] = [];
  if (journeyModuleEnabled) {
    for (const h of stageHistory) {
      timelineEntries.push({
        id: `stage-${h.id}`,
        createdAt: h.createdAt,
        kind: "stage_change",
        memberName: h.memberName,
        oldLabel: stageLabel(journeyTrack, h.oldValue),
        newLabel: stageLabel(journeyTrack, h.newValue),
      });
    }
  }
  for (const t of tickets) {
    timelineEntries.push({
      id: `created-${t._id}`,
      createdAt: t.createdAt.toISOString(),
      kind: "item_created",
      memberName: timelineNameById.get(String(t.reporter)) ?? "Someone",
      itemId: String(t._id),
      itemKey: t.key,
      itemTitle: t.title,
      teamId: String(t.teamId),
    });
  }
  for (const row of activityRows) {
    const ticket = ticketById.get(String(row.workItemId));
    if (!ticket) continue;
    const workflow = workflowByTeam.get(String(ticket.teamId));
    if (row.kind === "comment") {
      timelineEntries.push({
        id: String(row._id),
        createdAt: row.createdAt.toISOString(),
        kind: "item_comment",
        memberName: timelineNameById.get(String(row.memberId)) ?? "Someone",
        itemId: String(ticket._id),
        itemKey: ticket.key,
        itemTitle: ticket.title,
        teamId: String(ticket.teamId),
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
        itemId: String(ticket._id),
        itemKey: ticket.key,
        itemTitle: ticket.title,
        teamId: String(ticket.teamId),
        oldLabel,
        newLabel,
      });
    }
  }
  const timeline = sortTimeline(timelineEntries);

  return (

      <CustomerDetail
        customerId={String(customer._id)}
        initialName={customer.name}
        initialContacts={(customer.contacts ?? []).map((c) => ({
          name: c.name,
          email: c.email || undefined,
          phone: c.phone || undefined,
        }))}
        canManage={member.orgRole === "org_admin" || !!hasTeamAdmin}
        linkedTickets={linkedTickets}
        hiddenCount={hiddenCount}
        journeyModuleEnabled={journeyModuleEnabled}
        journeyStages={journeyTrack?.stages ?? []}
        isOrgAdmin={member.orgRole === "org_admin"}
        initialJourneyStage={customer.journeyStage ?? null}
        stageHistory={stageHistory}
        timelineEntries={timeline}
      />
  );
}
