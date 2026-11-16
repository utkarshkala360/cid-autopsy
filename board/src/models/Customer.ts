import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// CU-1: a single, Org-level record — Sales, CS, and Support all reference the
// same Customer rather than creating separate copies. Deliberately no
// denormalized `linkedWorkItems` array here: like Team.organizationId and
// WorkItem.teamId elsewhere in this schema, the reference lives on the child
// (WorkItem.customerId) and "a Customer's linked Tickets" is a live query
// (`WorkItem.find({ customerId })`), not a list that has to be kept in sync.
const ContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const CustomerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true, trim: true },
    contacts: { type: [ContactSchema], default: [] },
    // CJ-1 (Module A, Phase 10): null unless Org Admin has both turned the
    // `customer` StageTrack on org-wide and set a stage on this Customer —
    // CJ-5 requires the record stay a flat CU-1 entity with no macro stage
    // when the track is off, which "null by default, never auto-populated"
    // gives for free. Was a fixed `enum: JOURNEY_STAGE_KEYS`; changed to a
    // plain string, Phase 16 (Design 1, StageTrack generalization) —
    // validated at the API layer (PATCH /api/customers/[customerId]/journey-stage)
    // against the live `customer` StageTrack instead.
    journeyStage: { type: String, default: null },
    // Optional — not required, same "a Customer can stand on its own"
    // precedent WorkItem.customerId/initiativeId already established.
    // null = created without a template (every pre-existing Customer, and
    // any future one created without picking a product).
    customerTemplateId: { type: Schema.Types.ObjectId, ref: "CustomerTemplateDef", default: null },
    // Values keyed by CustomerTemplateFieldDef.key, same Mixed-object shape
    // WorkItem.customFields already uses.
    customFields: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ organizationId: 1, name: 1 });

export type CustomerDoc = InferSchemaType<typeof CustomerSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Customer = models.Customer || model("Customer", CustomerSchema);
