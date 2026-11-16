// Plain constants only — no Mongoose import, no "server-only". XM-3: which
// macro-stage entity a Team's local status can suggest advancing. Client
// components (the workflow config screen's per-status picker) need this;
// the Workflow model and stage-nudge.ts need it for storage/validation.
// Same lesson as link-types.ts / origin-types.ts.
export const STAGE_NUDGE_ENTITIES = ["journeyStage", "lifecycleStage"] as const;
export type StageNudgeEntity = (typeof STAGE_NUDGE_ENTITIES)[number];

export const STAGE_NUDGE_ENTITY_LABEL: Record<StageNudgeEntity, string> = {
  journeyStage: "Customer Journey Stage",
  lifecycleStage: "Initiative Lifecycle Stage",
};
