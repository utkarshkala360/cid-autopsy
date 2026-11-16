// Plain constants only — no Mongoose import, no "server-only". The link
// form (client component) needs these for its relation dropdown; the
// WorkItemLink model and work-item-links.ts need them for storage/labels.
// Same lesson as team-roles.ts (Phase 3): don't import runtime values a
// client component needs from a Mongoose model file.

// Canonical stored directions — "is blocked by" is the inverse of "blocks"
// read from the other side, not a fourth stored type.
export const LINK_TYPES = ["blocks", "relates_to", "duplicates"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const FORWARD_LINK_LABEL: Record<LinkType, string> = {
  blocks: "Blocks",
  relates_to: "Relates to",
  duplicates: "Duplicates",
};

export const INVERSE_LINK_LABEL: Record<LinkType, string> = {
  blocks: "Blocked by",
  relates_to: "Relates to",
  duplicates: "Duplicated by",
};

// What the "Add link" form offers — "Is blocked by" swaps from/to and
// stores type "blocks" (see the POST route), so there are 4 UI choices but
// only 3 stored types.
export const LINK_FORM_OPTIONS: { value: string; label: string; type: LinkType; swap: boolean }[] = [
  { value: "blocks", label: "Blocks", type: "blocks", swap: false },
  { value: "is_blocked_by", label: "Is blocked by", type: "blocks", swap: true },
  { value: "relates_to", label: "Relates to", type: "relates_to", swap: false },
  { value: "duplicates", label: "Duplicates", type: "duplicates", swap: false },
];
