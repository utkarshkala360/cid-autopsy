import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { WorkflowEditor } from "@board/components/work-items/workflow-editor";
import { CustomFieldsEditor } from "@board/components/work-items/custom-fields-editor";
import { DisplayLabelEditor } from "@board/components/work-items/display-label-editor";
import { SprintSettingsToggle } from "@board/components/work-items/sprint-settings-toggle";
import { TimeTrackingUnitEditor } from "@board/components/work-items/time-tracking-unit-editor";
import { requireTeamRole } from "@board/lib/authz";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { getFieldDefs } from "@board/lib/custom-fields";
import { connectDB } from "@board/lib/mongodb";
import { Team, type TeamDoc } from "@board/models/Team";
import { labelForTeam, labelForType, getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { getStageTracks } from "@board/lib/stage-tracks";

export default async function WorkItemConfigPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");

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
              : "Configuring workflow and fields requires Team Admin (or Org Admin)."
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

  const [workflow, fieldDefs, stageTracks, templates] = await Promise.all([
    getEffectiveWorkflow(teamId, workItemType),
    getFieldDefs(teamId, workItemType),
    getStageTracks(authz.member.organizationId),
    getWorkItemTemplateDefs(authz.member.organizationId),
  ]);
  const typeLabel = labelForTeam(team, templates);
  const journeyTrack = stageTracks.find((t) => t.entityType === "customer");
  const lifecycleTrack = stageTracks.find((t) => t.entityType === "initiative");

  return (

      <div className="space-y-6">
        <p className="text-xs text-slate">
          Statuses, transitions, and custom fields for this Team&apos;s {typeLabel}s (WF-1/WF-2).
          {workflow.isDefault && " Currently using the default 3-status template."}
        </p>

        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-1 font-heading text-sm font-semibold text-ink">Display Label</h2>
          <p className="mb-4 text-xs text-slate">
            What a Work Item is called across this Team&apos;s UI — board, list, detail page, empty
            states, and notifications (ORG-8). Presentation only; never changes the underlying data.
          </p>
          <DisplayLabelEditor
            teamId={teamId}
            initialLabel={team.displayLabel ?? null}
            defaultLabel={labelForType(workItemType, templates)}
          />
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-1 font-heading text-sm font-semibold text-ink">Sprints</h2>
          <p className="mb-4 text-xs text-slate">
            Opt-in Scrum mechanics for this Team — Sprint Planning, a Scrum board, burndown and
            velocity charts (BD-3/BD-4). Off by default; Teams that don&apos;t turn this on never see
            any Sprint UI.
          </p>
          <SprintSettingsToggle teamId={teamId} initialEnabled={team.sprintsEnabled} />
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-1 font-heading text-sm font-semibold text-ink">Time Tracking</h2>
          <p className="mb-4 text-xs text-slate">
            Let this Team log actual time spent on a {typeLabel} per calendar day, and set an
            independent Estimate — pick Story Points or Hours &amp; Minutes. Off by default; a
            Team that never turns this on never sees the Estimate field or the time log. Once any
            time has been logged, the unit is locked — switching it (including back to Off) would
            make historical totals unsummable, so every logged entry for this Team would need to
            be deleted first.
          </p>
          <TimeTrackingUnitEditor teamId={teamId} initialUnit={team.timeTrackingUnit ?? null} />
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-4 font-heading text-sm font-semibold text-ink">Workflow</h2>
          <WorkflowEditor
            teamId={teamId}
            type={workItemType}
            initialStatuses={workflow.statuses}
            initialTransitions={workflow.transitions}
            journeyModuleEnabled={journeyTrack?.enabled ?? false}
            lifecycleModuleEnabled={lifecycleTrack?.enabled ?? false}
            journeyStages={journeyTrack?.stages ?? []}
            lifecycleStages={lifecycleTrack?.stages ?? []}
          />
        </div>

        <div className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-4 font-heading text-sm font-semibold text-ink">Custom Fields</h2>
          <CustomFieldsEditor
            teamId={teamId}
            type={workItemType}
            initialFields={fieldDefs.map((f) => ({
              id: String(f._id),
              key: f.key,
              label: f.label,
              fieldType: f.fieldType,
              options: f.options ?? undefined,
            }))}
          />
        </div>
      </div>
  );
}
