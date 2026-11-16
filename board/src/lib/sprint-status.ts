// Plain constants/types only — no Mongoose import (see team-roles.ts for why:
// client components need these at runtime without pulling in the mongodb driver).
//
// Phase 16 (Design 2, Sprint/Initiative unification): `Initiative.sprintStatus`
// generalizes the old `Sprint.status` with one extra value, "none" — the
// state every ordinary (teamId: null) cross-team-tag Initiative sits in,
// since the planned/active/completed cycle only ever applies to a Team-run
// Initiative (teamId set).
export const INITIATIVE_SPRINT_STATUSES = ["none", "planned", "active", "completed"] as const;
export type InitiativeSprintStatus = (typeof INITIATIVE_SPRINT_STATUSES)[number];

// Kept as the exact former Sprint.status subset — every Team-run-Initiative
// UI surface (start/complete actions, status badges) only ever deals with
// these three, never "none" (a Team-run Initiative is always created
// straight into "planned").
export const SPRINT_STATUSES = ["planned", "active", "completed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
};
