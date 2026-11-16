// Plain types + a sort helper — no Mongoose, no "server-only". XM-2: a
// Timeline view per Customer/Initiative is "no new data store; a filtered
// read of what's already being logged" — each page loader (Customer/
// Initiative detail) builds this entry list itself from data it already
// fetches (linked Work Items, ChangeHistory rows), since the merge needs
// context (team names, resolved status labels, member names) each loader
// already has on hand. This file only holds the shared shape + the one bit
// of logic (chronological sort) both loaders would otherwise duplicate.
export type TimelineEntry = {
  id: string;
  createdAt: string; // ISO
  kind: "stage_change" | "item_created" | "item_status_change" | "item_comment";
  memberName: string;
  itemId?: string;
  itemKey?: string;
  itemTitle?: string;
  teamId?: string;
  oldLabel?: string | null;
  newLabel?: string | null;
  commentPreview?: string;
};

export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
