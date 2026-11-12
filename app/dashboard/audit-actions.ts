"use server";

import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_COMMENT_LENGTH, NOTE_KINDS, type AuditNoteInput } from "@/lib/audit-notes";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Saves an auditor's note with the page it was written on. Only members with the auditor
// permission may save; the author comes from the session, never from the browser.
export async function saveAuditNoteAction(input: AuditNoteInput): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember();
  if (!member.isAuditor) return { ok: false, error: "You don't have the auditor permission." };

  const comment = text(input?.comment, MAX_COMMENT_LENGTH + 1);
  if (!comment) return { ok: false, error: "Write a comment first." };
  if (comment.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_COMMENT_LENGTH} characters.` };
  }
  const kind = text(input?.kind, 20);
  if (!(kind in NOTE_KINDS)) return { ok: false, error: "Choose a type." };

  let url: URL;
  try {
    url = new URL(text(input?.url, 2000));
  } catch {
    return { ok: false, error: "Couldn't read the page address." };
  }

  const m = input?.metadata ?? {};
  const query =
    m.query && typeof m.query === "object"
      ? Object.fromEntries(
          Object.entries(m.query)
            .slice(0, 30)
            .map(([k, v]) => [text(k, 100), text(v, 500)]),
        )
      : {};
  const metadata = {
    heading: text(m.heading, 300),
    query,
    selection: text(m.selection, 1000),
    referrer: text(m.referrer, 2000),
    viewport: text(m.viewport, 20),
    userAgent: text(m.userAgent, 400),
    timeZone: text(m.timeZone, 60),
    // Tells local and preview notes apart from production ones.
    host: url.host,
    role: member.role,
  };

  await db()`
    INSERT INTO audit_notes (member_id, author, kind, comment, url, path, page_title, metadata)
    VALUES (
      ${member.id}, ${member.username}, ${kind}, ${comment},
      ${url.pathname + url.search + url.hash}, ${url.pathname}, ${text(input?.title, 300) || null},
      ${JSON.stringify(metadata)}::jsonb
    )
  `;
  return { ok: true };
}
