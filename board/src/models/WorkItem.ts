import mongoose, { Schema, type InferSchemaType, models, model } from "mongoose";
import { PRIORITIES } from "@board/lib/status-categories";
import { ORIGIN_KINDS } from "@board/lib/origin-types";

// The generic Work Item engine (IT-1). `type` is a plain string key (e.g.
// "task", later "ticket") — deliberately not an enum and not a separate
// template registry model, so a new Work Item type is pure config, never a
// new code path (Non-Negotiable #6 / ORG-4).
const WorkItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: { type: String, required: true, trim: true, lowercase: true },

    // Human-readable, permanent identifier (e.g. "DEV-42") — assigned once at
    // creation from an atomic per-Team counter (see nextWorkItemSeq in
    // lib/work-item-key.ts) and never reused, even after this item is
    // deleted.
    key: { type: String, required: true, unique: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" }, // Markdown

    status: { type: String, required: true },
    priority: { type: String, enum: PRIORITIES, required: true, default: "medium" },

    assignee: { type: Schema.Types.ObjectId, ref: "Member", default: null },
    reporter: { type: Schema.Types.ObjectId, ref: "Member", required: true },

    // Any active Org Member (not Team-restricted, same reach as @mentions —
    // see getOrgMentionCandidates) who wants to be notified of this item's
    // status/assignment changes without being the assignee or reporter.
    // Being a collaborator does NOT grant view access on its own — same
    // "notify, don't grant access" distinction as an @mention; visibility
    // still comes from Team membership or a Guest grant (MB-3/MB-4).
    collaborators: { type: [Schema.Types.ObjectId], ref: "Member", default: [] },

    // Optional even for type: "ticket" (WT-1) — a Work Item can stand on its
    // own without linking to a Customer or any other module. Settable only
    // for "ticket" at the API layer, not the schema, since a generic engine
    // can't hard-code "ticket" here (ORG-4). Null for every other type.
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },

    labels: { type: [String], default: [] },
    dueDate: { type: Date, default: null },

    // ORG-5: optional Org-level Initiative tag, shared across every Team —
    // nullable for every type, set the same way customerId is (a plain
    // reference on the child, no denormalized list on Initiative).
    initiativeId: { type: Schema.Types.ObjectId, ref: "Initiative", default: null },

    // BD-3: which Team-run Initiative (formerly Sprint) this item is
    // planned into, if any — null means "on the backlog." Only meaningful
    // for a Team with sprintsEnabled, but not schema-restricted to one (same
    // "generic engine" pattern as every other optional reference on this
    // model — ORG-4). Renamed from `sprintId` (`ref: "Sprint"`), Phase 16
    // (Design 2, Sprint/Initiative unification) — same field semantics, now
    // pointing at an `Initiative` document with `teamId` set. Independent
    // of `initiativeId` below: a Work Item can reference two different
    // `Initiative` docs at once (its Team-run Initiative, and its
    // cross-team tag).
    teamInitiativeId: { type: Schema.Types.ObjectId, ref: "Initiative", default: null },

    // Keyed by CustomFieldDef.key; values are loosely typed per fieldType.
    customFields: { type: Schema.Types.Mixed, default: {} },

    // Sub-tasks: a Work Item pointing at another Work Item on the SAME Team
    // (never cross-team — keeps this inside the existing Team-scoped model
    // instead of reopening the "single Project per Team" boundary). Capped
    // at one level deep — a parent can't itself have a parentId, and a Work
    // Item with children of its own can't become someone else's child — see
    // validateSubtaskParent in lib/work-item-subtasks.ts, the only place
    // this invariant is enforced.
    parentId: { type: Schema.Types.ObjectId, ref: "WorkItem", default: null },

    // Fractional rank used for Board column ordering and Backlog
    // drag-to-reorder (BD-2/BD-7). Purely a display concern — not part of
    // the audited field set in work-item-history.ts (see PATCH route).
    order: { type: Number, required: true, default: 0 },

    // XM-1: "originated from" — distinct from the general link set
    // (blocks/relates_to/duplicates, WorkItemLink). Marks that this Work
    // Item explicitly originated from a Customer or from another Work Item
    // (e.g. a Ticket/piece of feedback that became this Dev Task). Not a
    // WorkItemLink row since one side (Customer) isn't a Work Item at all —
    // resolved/validated in lib/origin-links.ts. Both null together or both
    // set together (enforced at the API layer, ORG-4).
    originatedFromKind: { type: String, enum: ORIGIN_KINDS, default: null },
    originatedFromId: { type: Schema.Types.ObjectId, default: null },

    // IT-8: "Epic" is a semantic label on a parent-capable Work Item, not a
    // second parent/child mechanism alongside sub-tasks — an Epic's children
    // are just ordinary sub-tasks (parentId pointing here). Mutually
    // exclusive with having a parentId of its own (enforced at the API
    // layer, mirroring validateSubtaskParent's "no grandchildren" rule) —
    // a sub-task can't itself be an Epic.
    isEpic: { type: Boolean, default: false },

    // Phase 16 (Design 1, StageTrack generalization): the org-wide macro-
    // stage layer on a Work Item itself, distinct from `status` above (the
    // per-Team Workflow-driven field, WF-1) — gives a real target to the
    // Workflow.statuses[].stageNudge hook (XM-3), which always anticipated
    // a Team status nudging a macro stage but never had a Work-Item-level
    // field to nudge before this. null unless the "work_item" StageTrack is
    // enabled and an Org Admin has set one. Editable only by Org Admin via
    // PATCH /api/teams/[teamId]/work-items/[itemId]/macro-stage.
    macroStage: { type: String, default: null },

    // Time Tracking (WL-2): independent of Actual. Interpreted using the
    // owning Team's current `timeTrackingUnit` — a plain number of story
    // points, or total minutes for hours/minutes (the UI splits/joins H+M;
    // only one number is ever persisted). null until a Team Member sets
    // one; hidden entirely in the UI when the Team has no timeTrackingUnit
    // configured.
    estimate: { type: Number, default: null },

    // WL-4: denormalized sum of this item's WorkLog rows — recomputed and
    // written back automatically (recomputeWorkItemActualTotal in
    // src/lib/work-log-reports.ts) every time a WorkLog entry is added,
    // edited, or deleted, so the number in the database is always
    // up-to-date without a person ever having to trigger anything (real-time,
    // automatic, per direct user request — not a live-aggregate-on-read
    // value, and not a scheduled/cron recompute). Deliberately excluded from
    // the diffWorkItemFields audited set, same "display/derived data, not a
    // business field a person edits" treatment `order` already gets — the
    // underlying WorkLog add/edit/remove events are what's actually audited
    // (recordWorkLogChange), not this rollup.
    actualTotal: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

WorkItemSchema.index({ teamId: 1, status: 1 });
WorkItemSchema.index({ teamId: 1, type: 1, order: 1 });
WorkItemSchema.index({ customerId: 1 });
WorkItemSchema.index({ organizationId: 1, initiativeId: 1 });
WorkItemSchema.index({ parentId: 1 });
WorkItemSchema.index({ teamId: 1, teamInitiativeId: 1 });
// Pagination-performance pass (query engine rewrite): covers the Work Items
// list's default "last updated" sort/pagination (previously uncovered — a
// bare .sort({updatedAt:-1}) with no supporting index) and per-column Board
// pagination (the existing {teamId,type,order} index above lacks `status` in
// the prefix for a column-scoped query — {status, order} together — to use
// it efficiently once Board pages one column at a time).
WorkItemSchema.index({ teamId: 1, type: 1, updatedAt: -1 });
WorkItemSchema.index({ teamId: 1, type: 1, status: 1, order: 1 });

export type WorkItemDoc = InferSchemaType<typeof WorkItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WorkItem = models.WorkItem || model("WorkItem", WorkItemSchema);
