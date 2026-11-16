"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { uploadFilesFromEvent } from "@board/lib/attachment-upload";
import { NotOnTeamBadge } from "@board/components/ui/not-on-team-badge";

type MentionableMember = { id: string; name: string; email?: string };

export function CommentForm({
  teamId,
  itemId,
  teamMembers = [],
  realTeamMemberIds,
  teamName = "this Team",
  onSubmit,
}: {
  teamId: string;
  itemId: string;
  // Every active Org Member, not just people on this Team — @mentions can
  // reach anyone (see getOrgMentionCandidates). realTeamMemberIds (if given)
  // is only used to flag the ones who aren't actually on this Team.
  teamMembers?: MentionableMember[];
  realTeamMemberIds?: Set<string>;
  teamName?: string;
  onSubmit: (text: string) => Promise<{ error?: string }>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention typeahead. `teamMembers` arrives as a prop — already fetched
  // server-side alongside the rest of the Work Item detail page (see
  // getTeamMentionCandidates() in the page loader) — so opening the dropdown
  // never triggers its own fetch, just a client-side filter of preloaded data.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const mentionMatches =
    mentionStart === null
      ? []
      : teamMembers
          .filter((m) =>
            m.name.toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 6);
  const mentionOpen = mentionStart !== null && mentionMatches.length > 0;

  // Finds the nearest unclosed "@" before the cursor — a run of non-whitespace
  // characters right after it is the in-progress mention query. Matches the
  // exact "@Full Name" substring convention extractMentionedMemberIds() uses
  // server-side (src/lib/mentions.ts), so what gets inserted here is always
  // something the server will actually resolve.
  function updateMentionState(value: string, cursor: number) {
    const uptoCursor = value.slice(0, cursor);
    const at = uptoCursor.lastIndexOf("@");
    if (at === -1) {
      setMentionStart(null);
      return;
    }
    const between = uptoCursor.slice(at + 1);
    if (/\s/.test(between)) {
      setMentionStart(null);
      return;
    }
    setMentionStart(at);
    setMentionQuery(between);
    setActiveIndex(0);
  }

  function selectMention(member: MentionableMember) {
    if (mentionStart === null) return;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursor);
    const insertion = `@${member.name} `;
    setText(`${before}${insertion}${after}`);
    setMentionStart(null);
    setMentionQuery("");
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  // A6: same paste/drop-to-attachment behavior as the description field —
  // uploads the file (logged to history) and inserts a Markdown image/link
  // reference at the cursor, leaving plain-text paste untouched.
  async function handleFiles(files: FileList | File[]) {
    const { markdown, errors } = await uploadFilesFromEvent(
      teamId,
      itemId,
      files
    );
    if (errors.length) setError(errors[0]);
    if (!markdown) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((prev) => `${prev.slice(0, start)}${markdown}\n${prev.slice(end)}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    setError(null);
    const result = await onSubmit(text.trim());
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateMentionState(e.target.value, e.target.selectionStart);
          }}
          onKeyUp={(e) =>
            updateMentionState(
              e.currentTarget.value,
              e.currentTarget.selectionStart
            )
          }
          onClick={(e) =>
            updateMentionState(
              e.currentTarget.value,
              e.currentTarget.selectionStart
            )
          }
          onKeyDown={(e) => {
            if (!mentionOpen) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % mentionMatches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex(
                (i) => (i - 1 + mentionMatches.length) % mentionMatches.length
              );
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              selectMention(mentionMatches[activeIndex]);
            } else if (e.key === "Escape") {
              setMentionStart(null);
            }
          }}
          onBlur={() => setMentionStart(null)}
          onPaste={(e) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              handleFiles(e.clipboardData.files);
            }
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length > 0) {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          rows={3}
          placeholder="Add a comment… use @Name to mention a teammate"
          className="border-border bg-surface text-ink placeholder:text-slate focus:border-primary focus:ring-primary w-full resize-y rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
        {mentionOpen && (
          <div className="border-border bg-panel absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-md border py-1 shadow-md">
            {mentionMatches.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  // Keep the textarea focused (and its selectionStart valid)
                  // instead of letting the click blur it first.
                  e.preventDefault();
                  selectMention(m);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  i === activeIndex
                    ? "bg-muted text-ink"
                    : "text-ink hover:bg-muted"
                }`}
              >
                <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  {m.name}
                  {m.email && (
                    <span className="text-slate font-normal">{m.email}</span>
                  )}
                  {realTeamMemberIds && !realTeamMemberIds.has(m.id) && (
                    <NotOnTeamBadge teamName={teamName} />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p className="text-status-blocked text-xs font-medium">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-3 w-3" />
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
