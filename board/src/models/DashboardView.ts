import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";

// A named, persisted selection + order of Dashboard/Team Dashboard widget
// INSTANCES (DashboardViewConfig, in src/lib/dashboard-views.ts). `teamId`
// null = an Org-level view (the `/dashboard/board/dashboard` page); set = a Team-level view
// (that Team's own `/dashboard/board/teams/[teamId]/dashboard`) — one model serves both
// surfaces rather than forking a second one, since the only real difference
// is which scope a view belongs to. "self" visibility = only the creator
// ever sees it in their Widgets menu; "shared" = every Member who can see
// that same surface sees it too ("for all") — on the Org surface (teamId
// null) that means every Member in the Organization, on a Team surface it
// means every Member with access to that Team.
//
// Sharing an Org-level view has NO Org-Admin/Team-Admin gate at create time
// — a deliberate, direct-user-requested override of REQUIREMENTS.md's DB-3
// "Won't (v1)" call (see ARCHITECTURE.md's "Dashboard Views" Build Log
// entry). Sharing a TEAM-level view was never granted that same override —
// it falls back to the exact rule SavedView.visibility: "team" already
// uses (Team Member+ required), since a Team-scoped DashboardView is, in
// every way that matters for RBAC, the same kind of resource a SavedView
// already is.
const DashboardViewSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    visibility: { type: String, enum: ["self", "shared"], required: true, default: "self" },
    // DashboardViewConfig — { widgets: WidgetInstance[] } — stored as-is and
    // read/written wholesale, same reasoning SavedView.config already
    // documents. Array order IS display order; no separate order field.
    config: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

DashboardViewSchema.index({ organizationId: 1, teamId: 1, visibility: 1 });

export type DashboardViewDoc = InferSchemaType<typeof DashboardViewSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DashboardView = models.DashboardView || model("DashboardView", DashboardViewSchema);
