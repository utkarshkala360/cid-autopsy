import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

export const WORK_LOG_UNITS = ["story_points", "hours_minutes"] as const;
export type WorkLogUnit = (typeof WORK_LOG_UNITS)[number];

// Time Tracking (WL-3): a per-day, per-person log entry against a Work
// Item — a direct user override of REQUIREMENTS.md's former "Time tracking
// / worklogs" non-goal (see ARCHITECTURE.md Build Log). Deliberately NOT a
// new ChangeHistory `kind`: ChangeHistory is a hard, append-only invariant
// (Non-Negotiable #5 — no update/delete route exists for it, for any role),
// but a logged entry must be correctable by the person who logged it (or a
// Team Admin) — a genuinely different, ordinary mutable model. Multiple
// entries per person/item/day are allowed on purpose (confirmed with the
// user) — this is one row per logged entry, not one row per (item, member,
// day).
const WorkLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    workItemId: { type: Schema.Types.ObjectId, ref: "WorkItem", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    // Calendar day the work was done, stored at UTC midnight — day
    // granularity, not a timestamp. Deliberately computed in UTC rather
    // than the server's local timezone, unlike the pre-existing
    // startOfDay/endOfDay bug noted in computeBurndown (src/lib/sprint-reports.ts).
    date: { type: Date, required: true },
    // Value in `unit` below — story points, or minutes for hours/minutes.
    amount: { type: Number, required: true, min: 0 },
    // Snapshotted at entry time, not read live from Team.timeTrackingUnit —
    // protects historical entries if a Team's unit is ever changed (though
    // the unit-change route rejects a change while any WorkLog row exists
    // for that Team, so in practice every row for a Team always agrees).
    unit: { type: String, enum: WORK_LOG_UNITS, required: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

WorkLogSchema.index({ workItemId: 1, date: 1 });
WorkLogSchema.index({ teamId: 1, date: 1 });

export type WorkLogDoc = InferSchemaType<typeof WorkLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WorkLog = models.WorkLog || model("WorkLog", WorkLogSchema);
