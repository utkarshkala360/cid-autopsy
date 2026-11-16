import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { TEAM_ROLES, type TeamRole } from "@board/lib/team-roles";

export { TEAM_ROLES };
export type { TeamRole };

const TeamMembershipSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    role: { type: String, enum: TEAM_ROLES, required: true, default: "member" },
  },
  { timestamps: true }
);

// A Member has exactly one role per Team (MB-1).
TeamMembershipSchema.index({ teamId: 1, memberId: 1 }, { unique: true });

export type TeamMembershipDoc = InferSchemaType<typeof TeamMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TeamMembership =
  models.TeamMembership || model("TeamMembership", TeamMembershipSchema);
