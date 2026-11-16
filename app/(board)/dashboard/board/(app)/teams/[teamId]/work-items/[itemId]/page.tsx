import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { WorkItemDetail } from "@board/components/work-items/work-item-detail";
import { requireWorkItemAccess } from "@board/lib/guest-access";
import { getTeamMentionCandidates, getOrgMentionCandidates } from "@board/lib/work-items";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { getFieldDefs } from "@board/lib/custom-fields";
import { connectDB } from "@board/lib/mongodb";
import { ChangeHistory, type ChangeHistoryDoc } from "@board/models/ChangeHistory";
import { Team, type TeamDoc } from "@board/models/Team";
import { Member } from "@board/models/Member";
import { Customer } from "@board/models/Customer";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { GuestGrant, type GuestGrantDoc } from "@board/models/GuestGrant";
import { Attachment, type AttachmentDoc } from "@board/models/Attachment";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { getLinksForWorkItem } from "@board/lib/work-item-links";
import { resolveOrigin } from "@board/lib/origin-links";
import { getStageTrack } from "@board/lib/stage-tracks";
import { WorkLog, type WorkLogDoc } from "@board/models/WorkLog";

export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; itemId: string }>;
}) {
  const { teamId, itemId } = await params;
  const access = await requireWorkItemAccess(teamId, itemId);

  if (!access.ok && access.status === 401) {
    redirect("/dashboard/login");
  }

  if (!access.ok) {
    return (
      
        <ForbiddenState
          title={access.status === 404 ? "Team not found" : "You don't have access to this Work Item"}
          message={
            access.status === 404
              ? "This Team doesn't exist or was removed."
              : "Viewing this Work Item requires at least Team Viewer access, or a Guest grant shared with you."
          }
        />
    );
  }

  const item = access.item;
  const isGuest = access.role === "guest";
  const canEdit = access.role === "member" || access.role === "admin";
  const canComment = canEdit || isGuest;
  const canManageGuests =
    access.role === "admin" || (access.role === "member" && String(item.reporter) === String(access.member._id));

  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team) {
    return (
      
        <ForbiddenState title="Not found" message="This Work Item doesn't exist or was removed." />
    );
  }

  const [workflow, fieldDefs, teamMembers, mentionCandidates, collaboratorMembers, subtasks, parentDoc, history, customers, initiatives, links, guestGrants, sprints, attachments, existingLabels, origin, templates, workItemStageTrack, workLogEntries] =
    await Promise.all([
      getEffectiveWorkflow(teamId, item.type),
      getFieldDefs(teamId, item.type),
      isGuest ? Promise.resolve([]) : getTeamMentionCandidates(teamId),
      isGuest ? Promise.resolve([]) : getOrgMentionCandidates(String(access.member.organizationId)),
      item.collaborators?.length
        ? Member.find({ _id: { $in: item.collaborators } }, "name email").lean()
        : Promise.resolve([]),
      // IT-12 (Phase 16): full docs, not just "key title status" — the new
      // nested Board view mode needs every BoardItem field (status,
      // priority, assignee, labels, dueDate, order, isEpic), the same shape
      // the Team board already builds from a WorkItem.find().
      WorkItem.find({ parentId: itemId, teamId }).sort({ order: 1, createdAt: 1 }).lean<WorkItemDoc[]>(),
      item.parentId
        ? WorkItem.findOne({ _id: item.parentId, teamId }, "key title").lean()
        : Promise.resolve(null),
      ChangeHistory.find({ workItemId: itemId, teamId })
        .sort({ createdAt: 1 })
        .lean<ChangeHistoryDoc[]>(),
      // Loaded regardless of type — a Work Item doesn't need to be a Ticket
      // to be marked as "originated from" a Customer (XM-1), even though
      // only a Ticket can *link* to one via customerId.
      Customer.find({ organizationId: access.member.organizationId }, "name")
        .sort({ name: 1 })
        .lean(),
      Initiative.find({ organizationId: access.member.organizationId, teamId: null }, "name")
        .sort({ name: 1 })
        .lean(),
      isGuest ? Promise.resolve([]) : getLinksForWorkItem(itemId, access.member),
      canManageGuests
        ? GuestGrant.find({ workItemId: itemId })
            .populate("memberId", "name email")
            .sort({ createdAt: 1 })
            .lean<(GuestGrantDoc & { memberId: { _id: unknown; name: string; email: string } | null })[]>()
        : Promise.resolve([]),
      // BD-3: only fetched for a Team that opted into Sprints — the field
      // itself is hidden entirely on the detail component otherwise.
      // Phase 16 (Design 2): queries Initiative{teamId} instead of the
      // deleted Sprint model.
      team.sprintsEnabled
        ? Initiative.find({ teamId }).sort({ startDate: 1 }).lean<InitiativeDoc[]>()
        : Promise.resolve([]),
      Attachment.find({ workItemId: itemId, isLatest: true, deletedAt: null })
        .sort({ createdAt: 1 })
        .lean<AttachmentDoc[]>(),
      WorkItem.distinct("labels", { teamId, type: item.type }) as Promise<string[]>,
      resolveOrigin(item.originatedFromKind, item.originatedFromId, access.member),
      getWorkItemTemplateDefs(access.member.organizationId),
      getStageTrack(access.member.organizationId, "work_item"),
      // WL-1: only fetched for a Team with time tracking on — the panel
      // renders nothing at all otherwise.
      team.timeTrackingUnit
        ? WorkLog.find({ workItemId: itemId, teamId })
            .sort({ date: -1, createdAt: -1 })
            .lean<WorkLogDoc[]>()
        : Promise.resolve([]),
    ]);

  const referencedIds = new Set<string>();
  if (item.assignee) referencedIds.add(String(item.assignee));
  referencedIds.add(String(item.reporter));
  (item.collaborators ?? []).forEach((c) => referencedIds.add(String(c)));
  for (const h of history) {
    referencedIds.add(String(h.memberId));
    (h.mentions ?? []).forEach((m) => referencedIds.add(String(m)));
    if (h.field === "collaborators") {
      (Array.isArray(h.oldValue) ? h.oldValue : []).forEach((id) => referencedIds.add(String(id)));
      (Array.isArray(h.newValue) ? h.newValue : []).forEach((id) => referencedIds.add(String(id)));
    }
  }
  for (const a of attachments) {
    referencedIds.add(String(a.uploadedBy));
  }
  for (const w of workLogEntries) {
    referencedIds.add(String(w.memberId));
  }
  for (const s of subtasks) {
    if (s.assignee) referencedIds.add(String(s.assignee));
  }

  await connectDB();
  const referencedMembers = referencedIds.size
    ? await Member.find({ _id: { $in: [...referencedIds] } }, "name email").lean()
    : [];
  const memberNames: Record<string, string> = {};
  const memberEmails: Record<string, string> = {};
  referencedMembers.forEach((m) => {
    memberNames[String(m._id)] = m.name;
    memberEmails[String(m._id)] = m.email;
  });

  const fields = fieldDefs.map((f) => ({
    id: String(f._id),
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ?? undefined,
  }));

  return (
    
      <WorkItemDetail
        teamId={teamId}
        teamName={team.name}
        typeLabel={labelForTeam(team, templates)}
        requiresCustomer={templates.find((t) => t.key === item.type)?.requiresCustomer ?? item.type === "ticket"}
        isOrgAdmin={access.member.orgRole === "org_admin"}
        workItemStageTrackEnabled={workItemStageTrack?.enabled ?? false}
        workItemStages={workItemStageTrack?.stages ?? []}
        canEdit={canEdit}
        canComment={canComment}
        isGuest={isGuest}
        canManageGuests={canManageGuests}
        isTeamAdmin={access.role === "admin"}
        currentMemberId={String(access.member._id)}
        timeTrackingUnit={team.timeTrackingUnit ?? null}
        initialWorkLogEntries={workLogEntries.map((w) => ({
          id: String(w._id),
          memberId: String(w.memberId),
          date: new Date(w.date).toISOString(),
          amount: w.amount,
          unit: w.unit,
          note: w.note ?? "",
        }))}
        workItem={{
          id: String(item._id),
          key: item.key,
          type: item.type,
          title: item.title,
          description: item.description,
          status: item.status,
          priority: item.priority,
          assignee: item.assignee ? String(item.assignee) : null,
          reporter: String(item.reporter),
          labels: item.labels,
          dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
          customFields: (item.customFields as Record<string, unknown>) ?? {},
          customerId: item.customerId ? String(item.customerId) : null,
          initiativeId: item.initiativeId ? String(item.initiativeId) : null,
          teamInitiativeId: item.teamInitiativeId ? String(item.teamInitiativeId) : null,
          parentId: item.parentId ? String(item.parentId) : null,
          isEpic: Boolean(item.isEpic),
          macroStage: item.macroStage ?? null,
          estimate: item.estimate ?? null,
          actualTotal: item.actualTotal ?? 0,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }}
        statuses={workflow.statuses}
        transitions={workflow.transitions}
        fields={fields}
        teamMembers={teamMembers}
        mentionCandidates={mentionCandidates}
        customers={customers.map((c) => ({ id: String(c._id), name: c.name as string }))}
        initiatives={initiatives.map((i) => ({ id: String(i._id), name: i.name as string }))}
        sprints={sprints.map((s) => ({ id: String(s._id), name: s.name, status: s.sprintStatus }))}
        memberNames={memberNames}
        memberEmails={memberEmails}
        initialLinks={links}
        initialOrigin={origin}
        initialAttachments={attachments.map((a) => ({
          id: String(a._id),
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          blobUrl: a.blobUrl,
          uploadedBy: String(a.uploadedBy),
          groupId: String(a.groupId),
          version: a.version,
          createdAt: a.createdAt.toISOString(),
        }))}
        initialHistory={history.map((h) => ({
          id: String(h._id),
          kind: h.kind,
          field: h.field ?? undefined,
          oldValue: h.oldValue,
          newValue: h.newValue,
          commentText: h.commentText ?? undefined,
          mentions: (h.mentions ?? []).map(String),
          attachmentAction: h.attachmentAction ?? undefined,
          attachmentFilename: h.attachmentFilename ?? undefined,
          memberId: String(h.memberId),
          createdAt: h.createdAt.toISOString(),
        }))}
        initialGuestGrants={guestGrants
          .filter((g) => g.memberId)
          .map((g) => ({
            id: String(g._id),
            memberName: g.memberId!.name,
            memberEmail: g.memberId!.email,
          }))}
        initialCollaborators={collaboratorMembers.map((m) => ({
          id: String(m._id),
          name: m.name as string,
          email: m.email as string,
        }))}
        initialSubtasks={subtasks.map((s) => ({
          id: String(s._id),
          key: s.key,
          title: s.title,
          status: s.status,
          priority: s.priority as WorkItemDoc["priority"],
          assigneeName: s.assignee ? memberNames[String(s.assignee)] ?? null : null,
          labels: s.labels ?? [],
          dueDate: s.dueDate ? new Date(s.dueDate).toISOString() : null,
          order: s.order ?? 0,
          createdAt: new Date(s.createdAt).toISOString(),
          isEpic: Boolean(s.isEpic),
        }))}
        parentRef={
          parentDoc
            ? { id: String(item.parentId), key: parentDoc.key as string, title: parentDoc.title as string }
            : null
        }
        existingLabels={existingLabels.filter(Boolean)}
      />
  );
}
