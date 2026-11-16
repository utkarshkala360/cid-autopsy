// Plain constants only — no Mongoose import, no "server-only". XM-1: an
// "originated from" reference, distinct from the general link set
// (blocks/relates_to/duplicates, link-types.ts) — marks that a Work Item or
// an Initiative explicitly originated from a Customer or from another Work
// Item (e.g. a Ticket, or a piece of feedback logged as one). Client
// components (the origin picker) need these; origin-links.ts and the
// WorkItem/Initiative models need them for storage/labels. Same lesson as
// link-types.ts / team-roles.ts: don't import a value a client component
// needs from a Mongoose model file.
export const ORIGIN_KINDS = ["customer", "work_item"] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

export const ORIGIN_KIND_LABEL: Record<OriginKind, string> = {
  customer: "Customer",
  work_item: "Work Item",
};
