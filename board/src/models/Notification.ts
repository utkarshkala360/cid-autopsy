import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// §7.11 / MB-5: @mentions, assignment, and status changes — delivered
// identically whether the recipient is a full Member or a Guest with access
// to that item (same collection, same routes, same UI; see src/lib/notifications.ts).
export const NOTIFICATION_TYPES = ["mention", "assignment", "status_change"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const NotificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    workItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", required: true },
    // Snapshot, not a live join — so a notification still renders sensibly
    // if the Work Item is later renamed or deleted (same "outlives its
    // subject" precedent as ChangeHistory not being cascade-deleted).
    workItemTitle: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // kind === "status_change" only — already-resolved status labels
    // (e.g. "To Do"), not raw status keys, so rendering never needs to
    // re-load the Team's workflow.
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    read: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Notification = models.Notification || model("Notification", NotificationSchema);
