import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

const TeamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    active: { type: Boolean, required: true, default: true },
    // Which Work Item template (WT-1) this Team's Work Items page/board
    // query by default — the mechanism Phase 6 adds so a new Team (Support,
    // Ticket) is pure config, not a new page/component (ORG-4/Non-Negotiable #6).
    // Was a fixed `enum: ["task","ticket"]`; changed to a plain trimmed
    // string, Phase 16 (Design 3) — validated at the API layer
    // (PATCH /api/teams/[teamId]) against the live WorkItemTemplateDef
    // registry instead, so a new Org-Admin-added template needs no schema
    // migration to become selectable.
    primaryWorkItemType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      default: "task",
    },
    // ORG-8: what this Team calls a Work Item in its own UI (e.g. "Ticket"
    // for Support). Presentation only — never touches WorkItem.type or any
    // API field name. null/absent means "use the template default" — see
    // labelForTeam() in src/lib/work-item-templates.ts.
    displayLabel: { type: String, trim: true, default: null },
    // Phase 16 (Design 1, StageTrack generalization): the org-wide macro-
    // stage layer on a Team itself, same shape as Customer.journeyStage/
    // Initiative.lifecycleStage. null unless the "team" StageTrack is
    // enabled and an Org Admin has set one. Editable only by Org Admin via
    // PATCH /api/teams/[teamId]/macro-stage.
    macroStage: { type: String, default: null },
    // BD-3: Scrum mechanics are opt-in per Team, off by default — a Team
    // that never turns this on never sees Sprint UI anywhere (Sprint
    // Planning page, the Sprint field on a Work Item, the nav link).
    // Team-Admin-editable via PATCH /api/teams/[teamId]/sprint-settings.
    sprintsEnabled: { type: Boolean, required: true, default: false },
    // Time Tracking (WL-1, direct user override of REQUIREMENTS.md's former
    // "Time tracking / worklogs" non-goal — see ARCHITECTURE.md Build Log).
    // null = feature invisible for this Team, same "invisible, not
    // disabled" precedent as sprintsEnabled/macroStage/every StageTrack. A
    // Team Admin picks exactly one unit — Work Item Estimate and every
    // WorkLog entry for this Team are interpreted in it. Locked once any
    // WorkLog row exists for the Team (see PATCH /api/teams/[teamId]/time-settings)
    // so historical Actuals can never straddle two incompatible units.
    timeTrackingUnit: {
      type: String,
      enum: ["story_points", "hours_minutes"],
      default: null,
    },
    // Org+Team scoped queries (Non-Negotiable #4) — v1 has exactly one
    // Organization, but every Team query is still scoped by it.
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  },
  { timestamps: true }
);

export type TeamDoc = InferSchemaType<typeof TeamSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Team = models.Team || model("Team", TeamSchema);
