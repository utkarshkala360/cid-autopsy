import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { CreateWorkItemForm } from "@board/components/work-items/create-work-item-form";
import { requireTeamRole } from "@board/lib/authz";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { getFieldDefs } from "@board/lib/custom-fields";
import { getTeamMentionCandidates, getOrgMentionCandidates } from "@board/lib/work-items";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { WorkItem } from "@board/models/WorkItem";
import { labelForTeam, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";

export default async function NewWorkItemPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "member");

  if (!authz.ok && authz.status === 401) {
    redirect("/dashboard/login");
  }

  if (!authz.ok) {
    return (
      
        <ForbiddenState
          title={authz.status === 404 ? "Team not found" : "You don't have access to this Team"}
          message={
            authz.status === 404
              ? "This Team doesn't exist or was removed."
              : "Creating Work Items requires at least Team Member access."
          }
        />
    );
  }

  await connectDB();
  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team) {
    return (
      
        <ForbiddenState title="Team not found" message="This Team doesn't exist or was removed." />
    );
  }

  const workItemType = team.primaryWorkItemType;
  const templates = await getWorkItemTemplateDefs(authz.member.organizationId);
  const isTicket = templates.find((t) => t.key === workItemType)?.requiresCustomer ?? workItemType === "ticket";

  const [workflow, fieldDefs, teamMembers, mentionCandidates, customers, initiatives, existingLabels] = await Promise.all([
    getEffectiveWorkflow(teamId, workItemType),
    getFieldDefs(teamId, workItemType),
    getTeamMentionCandidates(teamId),
    getOrgMentionCandidates(String(authz.member.organizationId)),
    isTicket ? Customer.find({ organizationId: authz.member.organizationId }, "name").sort({ name: 1 }).lean() : Promise.resolve([]),
    // Phase 16 (Design 2): Team-run Initiatives (teamId set) aren't
    // offered in the cross-team tag picker — a Work Item tags an ordinary
    // Initiative here; its Sprint assignment is the separate `teamInitiativeId`
    // field on the create form.
    Initiative.find({ organizationId: authz.member.organizationId, teamId: null }, "name")
      .sort({ name: 1 })
      .lean(),
    WorkItem.distinct("labels", { teamId, type: workItemType }) as Promise<string[]>,
  ]);

  const fields = fieldDefs.map((f) => ({
    id: String(f._id),
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ?? undefined,
  }));

  return (
    
      <CreateWorkItemForm
        teamId={teamId}
        teamName={team.name}
        type={workItemType}
        typeLabel={labelForTeam(team, templates)}
        requiresCustomer={isTicket}
        statuses={workflow.statuses}
        fields={fields}
        teamMembers={teamMembers}
        mentionCandidates={mentionCandidates}
        customers={customers.map((c) => ({ id: String(c._id), name: c.name as string }))}
        initiatives={initiatives.map((i) => ({ id: String(i._id), name: i.name as string }))}
        existingLabels={existingLabels.filter(Boolean)}
      />
  );
}
