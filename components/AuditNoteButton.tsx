"use client";

import { useState, useTransition } from "react";
import { saveAuditNoteAction } from "@/app/dashboard/audit-actions";
import { MAX_COMMENT_LENGTH, NOTE_KINDS, type NoteKind } from "@/lib/audit-notes";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// Read when the note is saved, so it describes the page as the auditor sees it at that moment.
function pageContext(selection: string) {
  const heading = document.querySelector("main h1")?.textContent?.trim() ?? "";
  return {
    url: window.location.href,
    title: document.title,
    metadata: {
      heading,
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      selection,
      referrer: document.referrer,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

// Floating button shown to auditors on every dashboard page.
export function AuditNoteButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NoteKind>("confusing");
  const [comment, setComment] = useState("");
  const [selection, setSelection] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function openPanel() {
    // Text the auditor highlighted before opening is kept as the part of the page they mean.
    setSelection(window.getSelection()?.toString().trim().slice(0, 1000) ?? "");
    setMessage(null);
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const result = await saveAuditNoteAction({ kind, comment, ...pageContext(selection) });
      if (result.ok) {
        setComment("");
        setSelection("");
        setMessage({ ok: true, text: "Saved. Thanks!" });
      } else {
        setMessage({ ok: false, text: result.error ?? "Couldn't save." });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // keep the page's text selection
        onClick={openPanel}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-amber-400"
      >
        Audit note
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Audit note"
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Audit note</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-900">
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Saved with this page&apos;s address, tab and filters, so it can be found again.
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="audit-kind" className={labelClass}>Type</label>
          <select
            id="audit-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind)}
            className={inputClass}
          >
            {Object.entries(NOTE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {selection && (
          <div>
            <div className={labelClass}>About the highlighted text</div>
            <div className="flex items-start gap-2">
              <blockquote className="line-clamp-3 flex-1 border-l-2 border-amber-400 pl-2 text-xs text-slate-600">
                {selection}
              </blockquote>
              <button type="button" onClick={() => setSelection("")} className="text-xs text-slate-500 hover:text-slate-900">
                Remove
              </button>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="audit-comment" className={labelClass}>Comment</label>
          <textarea
            id="audit-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="What's wrong, unclear or missing here? What did you expect?"
            className={inputClass}
            autoFocus
          />
        </div>
        {message && (
          <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !comment.trim()}
            className={primaryButtonClass}
          >
            {pending ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
