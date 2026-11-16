import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

export const CHANGE_HISTORY_KINDS = ["field_change", "comment", "attachment", "work_log"] as const;
export type ChangeHistoryKind = (typeof CHANGE_HISTORY_KINDS)[number];

export const ATTACHMENT_ACTIONS = ["added", "removed"] as const;
export type AttachmentAction = (typeof ATTACHMENT_ACTIONS)[number];

export const WORK_LOG_ACTIONS = ["added", "edited", "removed"] as const;
export type WorkLogAction = (typeof WORK_LOG_ACTIONS)[number];

// Append-only field-level audit trail (CT-1/CT-2/CT-4), the comment feed
// (§7.1 IT-3), attachment add/remove events (IT-9, Phase 10), and Module A/B
// macro-stage changes (CJ-2/PL-2, Phase 10) share this one collection/model
// — one audit engine, not four. Non-Negotiable #5: no route anywhere may
// update or delete a document here, for any role. Only a create path exists
// (see src/lib/work-item-history.ts). `workItemId`/`teamId` are optional as
// of Phase 10 — a stage-change row is scoped by `customerId` or
// `initiativeId` instead, since neither entity belongs to one Team; exactly
// one of `workItemId`/`customerId`/`initiativeId` is set on any given row.
const ChangeHistorySchema = new Schema(
  {
    workItemId: { type: Schema.Types.ObjectId, ref: "WorkItem" },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    initiativeId: { type: Schema.Types.ObjectId, ref: "Initiative" },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    kind: { type: String, enum: CHANGE_HISTORY_KINDS, required: true },

    // kind === "field_change"
    field: { type: String },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },

    // kind === "comment"
    commentText: { type: String },
    mentions: { type: [Schema.Types.ObjectId], ref: "Member", default: undefined },

    // kind === "attachment"
    attachmentAction: { type: String, enum: ATTACHMENT_ACTIONS },
    attachmentId: { type: Schema.Types.ObjectId, ref: "Attachment" },
    attachmentFilename: { type: String },

    // kind === "work_log" — an audit breadcrumb only (WL-3); the mutable
    // WorkLog row itself is the source of truth, same division of
    // responsibility attachments already have (file lives in its own
    // collection/Blob, add/remove is logged here).
    workLogAction: { type: String, enum: WORK_LOG_ACTIONS },
    workLogEntryId: { type: Schema.Types.ObjectId, ref: "WorkLog" },
    workLogAmount: { type: Number },
    workLogUnit: { type: String },
    workLogDate: { type: Date },

    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false }
);

ChangeHistorySchema.index({ workItemId: 1, createdAt: 1 });
ChangeHistorySchema.index({ customerId: 1, createdAt: 1 }, { sparse: true });
ChangeHistorySchema.index({ initiativeId: 1, createdAt: 1 }, { sparse: true });

export type ChangeHistoryDoc = InferSchemaType<typeof ChangeHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ChangeHistory =
  models.ChangeHistory || model("ChangeHistory", ChangeHistorySchema);
