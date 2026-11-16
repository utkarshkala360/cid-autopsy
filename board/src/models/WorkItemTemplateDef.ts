import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// WT-1/WT-2 (Phase 16, Design 3): the Work Item template list, generalized
// from the hardcoded WORK_ITEM_TEMPLATES = ["task","ticket"] const array
// (src/lib/work-item-templates.ts, deleted this phase) into an Org-Admin-
// managed registry. `requiresCustomer` generalizes the one hardcoded
// `type === "ticket"` special case that used to live directly in the Work
// Item POST/PATCH routes and the create form (ORG-4/Non-Negotiable #6 — a
// new template is now pure config, not a new code path).
const WorkItemTemplateDefSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    requiresCustomer: { type: Boolean, required: true, default: false },
    // Not `required` — the two seed rows (see SEED_WORK_ITEM_TEMPLATES,
    // src/lib/work-item-templates.ts) are self-healed into existence on
    // first read of an Organization with none yet (including one that
    // predates this registry), lazily, without a specific Member driving
    // that particular request being a meaningful "creator."
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", default: null },
  },
  { timestamps: true }
);

WorkItemTemplateDefSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export type WorkItemTemplateDefDoc = InferSchemaType<typeof WorkItemTemplateDefSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WorkItemTemplateDef =
  models.WorkItemTemplateDef || model("WorkItemTemplateDef", WorkItemTemplateDefSchema);
