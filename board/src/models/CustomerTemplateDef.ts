import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// Org-Admin-managed registry of Customer templates (one per product/line of
// business the org sells), mirroring WorkItemTemplateDef's shape — a new
// product is pure config (Non-Negotiable #6), not a new code path. Unlike
// WorkItemTemplateDef's task/ticket, there's no universal default product,
// so this collection is never self-healed/seeded — an Organization starts
// with zero rows until an Org Admin adds one, same "usable before
// configuration" floor Workflow/CustomFieldDef already have.
const CustomerTemplateDefSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

CustomerTemplateDefSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export type CustomerTemplateDefDoc = InferSchemaType<typeof CustomerTemplateDefSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomerTemplateDef =
  models.CustomerTemplateDef || model("CustomerTemplateDef", CustomerTemplateDefSchema);
