import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

export const GUEST_GRANT_SCOPES = ["work_item", "initiative"] as const;
export type GuestGrantScope = (typeof GUEST_GRANT_SCOPES)[number];

// MB-3: a Guest grant is its own record type, narrower than Team membership —
// it attaches one Member to one specific Work Item or one Initiative, never
// to a whole Team. Not a hacked-down TeamMembership row: there is no `role`
// here and no team-wide visibility, by construction (see src/lib/guest-access.ts).
const GuestGrantSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true }, // the Guest
    scope: { type: String, enum: GUEST_GRANT_SCOPES, required: true },

    // scope === "work_item"
    workItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", default: null },
    // Denormalized from workItemId at grant time — lets a Team Admin/Member's
    // grant-permission check and any team-scoped listing skip a join.
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },

    // scope === "initiative"
    initiativeId: { type: Schema.Types.ObjectId, ref: "Initiative", default: null },

    grantedBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

// One grant per Member per Work Item, and one per Member per Initiative —
// re-granting the same target is idempotent (see the POST routes' upsert).
GuestGrantSchema.index(
  { memberId: 1, workItemId: 1 },
  { unique: true, partialFilterExpression: { workItemId: { $type: "objectId" } } }
);
GuestGrantSchema.index(
  { memberId: 1, initiativeId: 1 },
  { unique: true, partialFilterExpression: { initiativeId: { $type: "objectId" } } }
);
GuestGrantSchema.index({ workItemId: 1 });
GuestGrantSchema.index({ initiativeId: 1 });

export type GuestGrantDoc = InferSchemaType<typeof GuestGrantSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const GuestGrant = models.GuestGrant || model("GuestGrant", GuestGrantSchema);
