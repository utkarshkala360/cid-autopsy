// Shared by the audit note widget, its action and the admin review page.

export const NOTE_KINDS = {
  bug: "Bug / broken",
  confusing: "Confusing",
  wrong_data: "Data looks wrong",
  missing: "Missing info",
  idea: "Idea",
  other: "Other",
} as const;

export type NoteKind = keyof typeof NOTE_KINDS;

export const NOTE_STATUSES = { open: "Open", done: "Done", wontfix: "Won't fix" } as const;

export type NoteStatus = keyof typeof NOTE_STATUSES;

export const MAX_COMMENT_LENGTH = 4000;

// What the browser sends with a note. Everything but the comment is captured automatically.
export type AuditNoteInput = {
  kind: string;
  comment: string;
  url: string;
  title: string;
  metadata: {
    heading?: string;
    query?: Record<string, string>;
    selection?: string;
    referrer?: string;
    viewport?: string;
    userAgent?: string;
    timeZone?: string;
  };
};
