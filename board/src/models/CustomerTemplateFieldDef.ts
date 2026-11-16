import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { CUSTOM_FIELD_TYPES } from "@board/lib/status-categories";

// Per-CustomerTemplate field definitions — mirrors CustomFieldDef (WF-2)
// exactly, scoped by customerTemplateId instead of teamId+type. `defaultValue`
// is the one addition beyond CustomFieldDef: what the create-Customer form
// pre-fills a field with when a template is selected, still editable before
// submit. Customer stores submitted values keyed by `key` in its own
// `customFields` object, same shape WorkItem.customFields already uses.
const CustomerTemplateFieldDefSchema = new Schema(
  {
    customerTemplateId: { type: Schema.Types.ObjectId, ref: "CustomerTemplateDef", required: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    fieldType: { type: String, enum: CUSTOM_FIELD_TYPES, required: true },
    // Only used when fieldType === "dropdown".
    options: { type: [String], default: undefined },
    defaultValue: { type: Schema.Types.Mixed, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

CustomerTemplateFieldDefSchema.index({ customerTemplateId: 1, key: 1 }, { unique: true });

export type CustomerTemplateFieldDefDoc = InferSchemaType<typeof CustomerTemplateFieldDefSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomerTemplateFieldDef =
  models.CustomerTemplateFieldDef || model("CustomerTemplateFieldDef", CustomerTemplateFieldDefSchema);
