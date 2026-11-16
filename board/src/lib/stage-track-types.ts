// Plain constants/types only — no Mongoose import (see team-roles.ts for
// why: client components need these at runtime without pulling in the
// mongodb driver). Design 1 (Phase 16): generalizes the old fixed
// JOURNEY_STAGES/LIFECYCLE_STAGES arrays (src/lib/module-stages.ts, deleted
// this phase) into one entity-type enum plus seed content for the two
// tracks that already existed as Module A/Module B.
export const STAGE_TRACK_ENTITY_TYPES = ["customer", "initiative", "team", "work_item"] as const;
export type StageTrackEntityType = (typeof STAGE_TRACK_ENTITY_TYPES)[number];

export const STAGE_TRACK_ENTITY_LABEL: Record<StageTrackEntityType, string> = {
  customer: "Customer",
  initiative: "Initiative",
  team: "Team",
  work_item: "Work Item",
};

export type StageDef = { key: string; label: string };

// Seed content used both by bootstrap and by the self-healing read path
// (src/lib/stage-tracks.ts) — byte-for-byte the former JOURNEY_STAGES/
// LIFECYCLE_STAGES arrays (§8/§9). `team`/`work_item` seed empty and
// disabled — genuinely new tracks (MG-3).
export const SEED_STAGE_TRACKS: Record<StageTrackEntityType, { name: string; stages: StageDef[] }> = {
  customer: {
    name: "Customer Journey",
    stages: [
      { key: "lead", label: "Lead" },
      { key: "onboarding", label: "Onboarding" },
      { key: "active", label: "Active" },
      { key: "renewal_expansion", label: "Renewal/Expansion" },
      { key: "offboarding", label: "Offboarding" },
    ],
  },
  initiative: {
    name: "Product Lifecycle",
    stages: [
      { key: "idea", label: "Idea" },
      { key: "planned", label: "Planned" },
      { key: "in_development", label: "In Development" },
      { key: "qa", label: "QA" },
      { key: "released", label: "Released" },
      { key: "maintenance", label: "Maintenance" },
    ],
  },
  team: { name: "Team Stage", stages: [] },
  work_item: { name: "Work Item Stage", stages: [] },
};
