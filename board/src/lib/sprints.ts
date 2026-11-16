import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { WorkItem } from "@board/models/WorkItem";
import { getEffectiveWorkflow } from "@board/lib/workflow";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import { recordFieldChanges } from "@board/lib/work-item-history";

// Phase 16 (Design 2, Sprint/Initiative unification): the `Sprint` model is
// deleted — every function below keeps its exact former name/signature/
// invariant, now querying `Initiative` filtered by `{teamId, sprintStatus}`
// (a "Team-run Initiative") instead of a separate `Sprint` collection.

export async function getActiveSprint(teamId: string): Promise<InitiativeDoc | null> {
  await connectDB();
  return Initiative.findOne({ teamId, sprintStatus: "active" }).lean<InitiativeDoc>();
}

/**
 * BD-4: starting a Team-run Initiative requires no other one already active
 * on this Team — the standard single-active-sprint Scrum rule, unchanged.
 * Returns null on success, or an error message to surface to the caller.
 */
export async function startSprint(teamId: string, initiativeId: string): Promise<string | null> {
  await connectDB();
  const initiative = await Initiative.findOne({ _id: initiativeId, teamId });
  if (!initiative) return "Sprint not found.";
  if (initiative.sprintStatus !== "planned") return "Only a planned Sprint can be started.";

  const alreadyActive = await Initiative.exists({ teamId, sprintStatus: "active" });
  if (alreadyActive) return "This Team already has an active Sprint — complete it first.";

  initiative.sprintStatus = "active";
  await initiative.save();
  return null;
}

/**
 * BD-4: completing a Team-run Initiative moves every incomplete item
 * (status category !== "done") to the next planned Team-run Initiative for
 * this Team (earliest startDate) if one exists, else back to the backlog
 * (teamInitiativeId: null). Completed items stay assigned to the closed
 * Initiative — that's what makes velocity (src/lib/sprint-reports.ts) a
 * plain count query instead of a snapshot. Same invariants as the former
 * Sprint.completeSprint(), verbatim.
 */
export async function completeSprint(
  teamId: string,
  initiativeId: string,
  actorId: string | mongoose.Types.ObjectId
): Promise<string | null> {
  await connectDB();
  const initiative = await Initiative.findOne({ _id: initiativeId, teamId });
  if (!initiative) return "Sprint not found.";
  if (initiative.sprintStatus !== "active") return "Only an active Sprint can be completed.";

  const items = await WorkItem.find({ teamId, teamInitiativeId: initiative._id }).lean<
    { _id: mongoose.Types.ObjectId; type: string; status: string }[]
  >();

  if (items.length > 0) {
    const combos = new Map<string, string>();
    for (const item of items) combos.set(item.type, item.type);
    const workflowByType = new Map(
      await Promise.all(
        [...combos.keys()].map(async (type) => [type, await getEffectiveWorkflow(teamId, type)] as const)
      )
    );

    const incompleteItems = items.filter((item) => {
      const workflow = workflowByType.get(item.type)!;
      return resolveStatusMeta(workflow.statuses, item.status).category !== "done";
    });

    if (incompleteItems.length > 0) {
      const nextInitiative = await Initiative.findOne({ teamId, sprintStatus: "planned" })
        .sort({ startDate: 1 })
        .lean<InitiativeDoc>();
      const nextInitiativeId = nextInitiative ? nextInitiative._id : null;

      await WorkItem.updateMany(
        { _id: { $in: incompleteItems.map((i) => i._id) } },
        { teamInitiativeId: nextInitiativeId }
      );

      // Rollover is a real planning event, not display metadata (unlike
      // `order`) — recorded the same way a manual teamInitiativeId edit
      // would be, just attributed to whoever clicked "Complete Sprint"
      // (CT-1). Field renamed from "sprintId" to "teamInitiativeId" along
      // with the WorkItem schema field itself.
      await Promise.all(
        incompleteItems.map((item) =>
          recordFieldChanges({
            workItemId: item._id,
            teamId,
            memberId: actorId,
            diffs: [
              {
                field: "teamInitiativeId",
                oldValue: String(initiative._id),
                newValue: nextInitiativeId ? String(nextInitiativeId) : null,
              },
            ],
          })
        )
      );
    }
  }

  initiative.sprintStatus = "completed";
  await initiative.save();
  return null;
}
