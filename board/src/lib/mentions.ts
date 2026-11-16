// Pure string logic, no server/DB imports — used by both the comment form
// (client, for live highlighting) and the comment API route (server, to
// resolve @mentions into Member ids for the history record).

export type MentionableMember = { id: string; name: string; email?: string };

/**
 * Matches "@Full Name" against known Team members (case-insensitive, longest
 * name first so "@Jane Doe" doesn't get shadowed by a shorter "@Jane").
 * Deliberately simple — no typeahead widget, just a plain-text convention.
 */
export function extractMentionedMemberIds(
  text: string,
  members: MentionableMember[]
): string[] {
  const lowerText = text.toLowerCase();
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);

  const matchedIds = new Set<string>();
  for (const member of sorted) {
    const needle = `@${member.name}`.toLowerCase();
    if (lowerText.includes(needle)) {
      matchedIds.add(member.id);
    }
  }
  return [...matchedIds];
}

/** Splits comment text into plain segments and recognized @mention segments, for rendering. */
export type MentionSegment = { text: string; isMention: boolean };

export function splitMentionSegments(
  text: string,
  members: MentionableMember[]
): MentionSegment[] {
  const names = [...members]
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (names.length === 0) return [{ text, isMention: false }];

  const pattern = new RegExp(
    `@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    segments.push({ text: match[0], isMention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false });
  }
  return segments;
}
