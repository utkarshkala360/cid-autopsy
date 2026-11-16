import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

export const ORG_ROLES = ["org_admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const MemberSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  // Absent for members who only ever sign in via an OAuth provider (Google).
  passwordHash: { type: String },
  avatarUrl: { type: String, default: null },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  orgRole: { type: String, enum: ORG_ROLES, required: true, default: "member" },
  createdAt: { type: Date, required: true, default: Date.now },
});

export type MemberDoc = InferSchemaType<typeof MemberSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Member = models.Member || model("Member", MemberSchema);
