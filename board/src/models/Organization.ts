import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

/**
 * v1 provisions exactly one Organization (ORG-1). The unique `key` gives the
 * bootstrap flow an atomic find-or-create target instead of a race-prone
 * count check.
 */
const OrganizationSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "singleton" },
  name: { type: String, required: true, trim: true },
  // MG-1/MG-2 (Phase 10): Modules are additive and off by default — turning
  // one on only adds the macro stage field to Customer/Initiative (CJ-5/
  // PL-5), never changes a Team's own workflow/fields/board/data.
  moduleJourneyEnabled: { type: Boolean, required: true, default: false },
  moduleLifecycleEnabled: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
});

export type OrganizationDoc = InferSchemaType<typeof OrganizationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Organization =
  models.Organization || model("Organization", OrganizationSchema);
