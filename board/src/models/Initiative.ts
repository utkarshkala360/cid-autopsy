import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { ORIGIN_KINDS } from "@board/lib/origin-types";
import { INITIATIVE_SPRINT_STATUSES } from "@board/lib/sprint-status";

// ORG-5: an Org-level tag grouping Work Items across Teams around one
// cross-team effort (e.g. "Q4 Launch"). Creatable by any Team Admin or Org
// Admin (requireAnyTeamAdmin, same rule as Customer — see Phase 6). No
// denormalized `workItemIds` list, same rationale as Customer's linked
// Tickets: WorkItem.initiativeId is the reference, and "an Initiative's
// Work Items" is a live query, not a list kept in sync.
//
// Phase 16 (Design 2, Sprint/Initiative unification, by direct user
// request): the `Sprint` model is deleted; its time-boxing/lifecycle fields
// (teamId/sprintGoal/startDate/endDate/sprintStatus below) fold into this
// model, active only when `teamId` is set (a "Team-run Initiative" — the
// role Sprint used to play). An ordinary `teamId: null` Initiative keeps
// behaving exactly as the original ORG-5 cross-team tag always has.
const InitiativeSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    // null = an ordinary cross-team tag (unchanged ORG-5 shape). Set = this
    // Initiative is Team-run: time-boxed and owned by one Team (the shape
    // Sprint used to have). Set at creation only — not changeable
    // afterward, same as Sprint.teamId was implicitly fixed.
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    // Was Sprint.goal. Meaningful only when teamId is set.
    sprintGoal: { type: String, default: "", trim: true },
    // Was Sprint.startDate/endDate (previously required) — now nullable
    // since an ordinary tag Initiative never sets them. Required at
    // creation only when teamId is set (API-layer validation, ORG-4-style).
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    // Was Sprint.status. "none" for every ordinary tag Initiative; the
    // planned/active/completed cycle is exercised only when teamId is set.
    sprintStatus: { type: String, enum: INITIATIVE_SPRINT_STATUSES, required: true, default: "none" },
    // PL-1 (Module B, Phase 10): same null-unless-track-on-and-set pattern
    // as Customer.journeyStage — PL-5 requires the tag stay flat (ORG-5)
    // with no macro stage when the track is off. Was a fixed
    // `enum: LIFECYCLE_STAGE_KEYS`; changed to a plain string, Phase 16
    // (Design 1, StageTrack generalization) — validated at the API layer
    // against the live `initiative` StageTrack instead.
    lifecycleStage: { type: String, default: null },
    // XM-1: same "originated from" reference WorkItem gets — marks that
    // this Initiative explicitly originated from a Customer or a Work Item
    // (e.g. a Ticket/piece of feedback that became this Initiative).
    originatedFromKind: { type: String, enum: ORIGIN_KINDS, default: null },
    originatedFromId: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

InitiativeSchema.index({ organizationId: 1, name: 1 });
// Carried over verbatim from Sprint's own indexes (Phase 16).
InitiativeSchema.index({ teamId: 1, sprintStatus: 1 });
InitiativeSchema.index({ teamId: 1, startDate: 1 });

export type InitiativeDoc = InferSchemaType<typeof InitiativeSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Initiative = models.Initiative || model("Initiative", InitiativeSchema);
