import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { STATUS_CATEGORIES } from "@board/lib/status-categories";
import { STAGE_NUDGE_ENTITIES } from "@board/lib/stage-nudge-types";

// XM-3: "where a Team wants its own local workflow status to signal a
// macro stage change... that mapping is configured by the Team Admin, the
// same way status/priority normalization already works (ORG-7) — never
// hardcoded into the platform." A stageNudge is a per-status, Team-Admin-
// configured SUGGESTION only — it never writes Customer.journeyStage or
// Initiative.lifecycleStage itself (CJ-3/PL-3's "no automation" rule is
// absolute); see src/lib/stage-nudge.ts for where the suggestion actually
// surfaces.
const StageNudgeSchema = new Schema(
  {
    entity: { type: String, enum: STAGE_NUDGE_ENTITIES, required: true },
    stage: { type: String, required: true },
  },
  { _id: false }
);

const StatusSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    category: { type: String, enum: STATUS_CATEGORIES, required: true },
    stageNudge: { type: StageNudgeSchema, default: null },
    // BD-5: optional per-column WIP limit, Team-Admin-configured on this
    // same workflow config screen. Soft enforcement only — the spec calls
    // for "optional enforcement," so the board (kanban-board.tsx) shows a
    // visual warning past this count rather than blocking the drop.
    wipLimit: { type: Number, default: null, min: 1 },
  },
  { _id: false }
);

const TransitionSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    // WF-4: "requires these fields filled" — a Team-Admin-configured rule
    // per transition, enforced in the same PATCH route isValidTransition
    // already runs in (see src/lib/transition-requirements.ts for the
    // allowed field set and the missing-fields check).
    requiredFields: { type: [String], default: [] },
  },
  { _id: false }
);

// Per-Team, per-Work-Item-type workflow (WF-1). Absence of a row for a given
// (teamId, type) means "use the default 3-status template" — see
// src/lib/workflow.ts — so a Team is usable before anyone configures it.
const WorkflowSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: { type: String, required: true, trim: true, lowercase: true },
    statuses: { type: [StatusSchema], required: true },
    transitions: { type: [TransitionSchema], required: true },
  },
  { timestamps: true }
);

WorkflowSchema.index({ teamId: 1, type: 1 }, { unique: true });

export type WorkflowDoc = InferSchemaType<typeof WorkflowSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Workflow = models.Workflow || model("Workflow", WorkflowSchema);
