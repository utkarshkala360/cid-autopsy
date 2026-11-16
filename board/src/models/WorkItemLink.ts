import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { LINK_TYPES } from "@board/lib/link-types";

// IT-2/ORG-6: a directed link between two Work Items, which may belong to
// different Teams (ORG-6 extends IT-2 across Team boundaries — same
// mechanism, no separate cross-team model). `type` is stored in one
// canonical direction (fromWorkItemId <type> toWorkItemId, e.g. "from
// blocks to"); the inverse label ("is blocked by") is derived at read time
// by src/lib/work-item-links.ts rather than stored as a fourth type, so
// there's one row per link, not two.
const WorkItemLinkSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    fromWorkItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", required: true },
    toWorkItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", required: true },
    type: { type: String, enum: LINK_TYPES, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

WorkItemLinkSchema.index({ fromWorkItemId: 1 });
WorkItemLinkSchema.index({ toWorkItemId: 1 });

export type WorkItemLinkDoc = InferSchemaType<typeof WorkItemLinkSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WorkItemLink = models.WorkItemLink || model("WorkItemLink", WorkItemLinkSchema);
