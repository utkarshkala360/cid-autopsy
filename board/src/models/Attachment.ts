import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// IT-9/IT-10/IT-11: file attachments on a Work Item, stored in Vercel Blob.
// Own collection, not embedded on WorkItem — same "reference lives on the
// child" pattern as WorkItemLink/Customer/Initiative. Versioning (basic,
// per the phase brief): every version of "the same" attachment shares
// `groupId` (the `_id` of its first version); re-uploading inserts a new
// document rather than overwriting one, so a previous version stays a real,
// queryable record — `isLatest`/`deletedAt` control what the panel shows by
// default without ever destroying an older row.
const AttachmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    workItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", required: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    blobUrl: { type: String, required: true },
    blobPathname: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    groupId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, default: 1 },
    isLatest: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AttachmentSchema.index({ workItemId: 1, isLatest: 1, deletedAt: 1 });
AttachmentSchema.index({ groupId: 1, version: 1 });

export type AttachmentDoc = InferSchemaType<typeof AttachmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Attachment = models.Attachment || model("Attachment", AttachmentSchema);
