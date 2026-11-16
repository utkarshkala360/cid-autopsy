import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { CUSTOM_FIELD_TYPES } from "@board/lib/status-categories";

// Per-Team, per-Work-Item-type custom field definitions (WF-2). WorkItem
// stores values keyed by `key` in its own `customFields` object.
const CustomFieldDefSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: { type: String, required: true, trim: true, lowercase: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    fieldType: { type: String, enum: CUSTOM_FIELD_TYPES, required: true },
    // Only used when fieldType === "dropdown".
    options: { type: [String], default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

CustomFieldDefSchema.index({ teamId: 1, type: 1, key: 1 }, { unique: true });

export type CustomFieldDefDoc = InferSchemaType<typeof CustomFieldDefSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomFieldDef =
  models.CustomFieldDef || model("CustomFieldDef", CustomFieldDefSchema);
