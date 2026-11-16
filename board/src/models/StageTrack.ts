import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { STAGE_TRACK_ENTITY_TYPES } from "@board/lib/stage-track-types";

const StageDefSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

// Design 1 (Phase 16): generalizes Organization.moduleJourneyEnabled/
// moduleLifecycleEnabled plus the fixed JOURNEY_STAGES/LIFECYCLE_STAGES
// arrays into one model — one document per (organizationId, entityType).
// MG-3 realized literally: a 5th entity type is a new row + a new
// `stages`-driven macroStage field on that entity, not a new subsystem.
const StageTrackSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    entityType: { type: String, enum: STAGE_TRACK_ENTITY_TYPES, required: true },
    // Editable display name (e.g. "Customer Journey") — was a hardcoded
    // label in the old ModuleToggles UI copy; now data.
    name: { type: String, required: true, trim: true },
    // Same "invisible, not disabled" semantics moduleJourneyEnabled/
    // moduleLifecycleEnabled/Team.sprintsEnabled already established.
    enabled: { type: Boolean, required: true, default: false },
    // Fully CRUD-editable — add/rename/reorder/remove — unlike the old
    // fixed JOURNEY_STAGES/LIFECYCLE_STAGES const arrays. Array order is
    // display/progression order, no separate `order` field.
    stages: { type: [StageDefSchema], required: true, default: [] },
    // Not `required` — the two seed rows self-heal into existence on first
    // read of an Organization with fewer than 4 (see getStageTracks(),
    // src/lib/stage-tracks.ts), lazily, without a specific Member driving
    // that particular request being a meaningful "creator."
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

StageTrackSchema.index({ organizationId: 1, entityType: 1 }, { unique: true });

export type StageTrackDoc = InferSchemaType<typeof StageTrackSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StageTrack = models.StageTrack || model("StageTrack", StageTrackSchema);
