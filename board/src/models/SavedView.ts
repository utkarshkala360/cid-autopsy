import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// A named, persisted filter/sort/group-by config (ViewConfig, in
// src/lib/work-item-views.ts) for one Team's Work Items of one type.
// "self" visibility = only the creator ever sees it in their Views menu;
// "team" = every Member with access to this Team sees it too ("for all").
const SavedViewSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    visibility: { type: String, enum: ["self", "team"], required: true, default: "self" },
    // ViewConfig — { filters, sort, groupBy } — stored as-is rather than
    // normalized into columns; it's read/written wholesale, never queried
    // field-by-field, so Mixed is the right fit (same reasoning as
    // WorkItem.customFields).
    config: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

SavedViewSchema.index({ teamId: 1, type: 1 });

export type SavedViewDoc = InferSchemaType<typeof SavedViewSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SavedView = models.SavedView || model("SavedView", SavedViewSchema);
