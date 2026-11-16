import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { getStageTrack, stageLabel } from "@board/lib/stage-tracks";
import type { WorkflowStatus } from "@board/lib/workflow";

export type StageNudgeSuggestion = {
  entity: "journeyStage" | "lifecycleStage";
  targetId: string;
  targetLabel: string;
  targetHref: string;
  currentStageLabel: string;
  suggestedStage: string;
  suggestedStageLabel: string;
};

/**
 * XM-3: "where a Team wants its own local workflow status to signal a
 * macro stage change... that mapping is configured by the Team Admin...
 * never hardcoded into the platform." This only ever returns a
 * *suggestion* for the caller to surface — it never writes
 * Customer.journeyStage or Initiative.lifecycleStage itself. CJ-3/PL-3's
 * "no automation, manual only" rule is absolute; only the existing
 * Org-Admin-only stage-PATCH routes (Phase 10) ever change a stage.
 */
export async function computeStageNudgeSuggestion(params: {
  newStatusKey: string;
  statuses: WorkflowStatus[];
  organizationId: string;
  customerId: string | null;
  initiativeId: string | null;
}): Promise<StageNudgeSuggestion | null> {
  const nudge = params.statuses.find((s) => s.key === params.newStatusKey)?.stageNudge;
  if (!nudge) return null;

  await connectDB();

  if (nudge.entity === "journeyStage") {
    if (!params.customerId) return null;
    const track = await getStageTrack(params.organizationId, "customer");
    if (!track?.enabled) return null;
    const customer = await Customer.findOne(
      { _id: params.customerId, organizationId: params.organizationId },
      "name journeyStage"
    ).lean<{ name: string; journeyStage: string | null }>();
    if (!customer || (customer.journeyStage ?? null) === nudge.stage) return null;
    return {
      entity: "journeyStage",
      targetId: params.customerId,
      targetLabel: customer.name,
      targetHref: `/dashboard/board/customers/${params.customerId}`,
      currentStageLabel: stageLabel(track, customer.journeyStage),
      suggestedStage: nudge.stage,
      suggestedStageLabel: stageLabel(track, nudge.stage),
    };
  }

  if (!params.initiativeId) return null;
  const track = await getStageTrack(params.organizationId, "initiative");
  if (!track?.enabled) return null;
  const initiative = await Initiative.findOne(
    { _id: params.initiativeId, organizationId: params.organizationId },
    "name lifecycleStage"
  ).lean<{ name: string; lifecycleStage: string | null }>();
  if (!initiative || (initiative.lifecycleStage ?? null) === nudge.stage) return null;
  return {
    entity: "lifecycleStage",
    targetId: params.initiativeId,
    targetLabel: initiative.name,
    targetHref: `/dashboard/board/initiatives/${params.initiativeId}`,
    currentStageLabel: stageLabel(track, initiative.lifecycleStage),
    suggestedStage: nudge.stage,
    suggestedStageLabel: stageLabel(track, nudge.stage),
  };
}
