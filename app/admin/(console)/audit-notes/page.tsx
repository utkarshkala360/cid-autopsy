import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { NOTE_KINDS, NOTE_STATUSES, type NoteKind, type NoteStatus } from "@/lib/audit-notes";
import { setAuditNoteStatusAction } from "@/app/admin/actions";

export const metadata: Metadata = { title: "Audit notes" };

type NoteRow = {
  id: string;
  author: string;
  full_name: string | null;
  kind: NoteKind;
  comment: string;
  url: string;
  path: string;
  page_title: string | null;
  metadata: { heading?: string; selection?: string; viewport?: string; host?: string };
  status: NoteStatus;
  resolution: string | null;
  created_at: string;
};

const FILTERS = ["open", "done", "wontfix", "all"] as const;

export default async function AuditNotesPage({ searchParams }: PageProps<"/admin/audit-notes">) {
  const raw = (await searchParams).status;
  const filter = FILTERS.find((f) => f === raw) ?? "open";

  const [, notes, counts] = (await Promise.all([
    requireAdmin(),
    db()`
      SELECT n.id, n.author, m.full_name, n.kind, n.comment, n.url, n.path, n.page_title, n.metadata,
             n.status, n.resolution, n.created_at
      FROM audit_notes n LEFT JOIN members m ON m.id = n.member_id
      WHERE ${filter} = 'all' OR n.status = ${filter}
      ORDER BY n.created_at DESC
      LIMIT 500
    `,
    db()`SELECT status, count(*)::int AS n FROM audit_notes GROUP BY status`,
  ])) as unknown as [unknown, NoteRow[], { status: string; n: number }[]];

  const countOf = (s: string) =>
    s === "all" ? counts.reduce((a, c) => a + c.n, 0) : (counts.find((c) => c.status === s)?.n ?? 0);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Audit notes</h1>
        <nav className="flex gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "open" ? "/admin/audit-notes" : `/admin/audit-notes?status=${f}`}
              className={
                f === filter
                  ? "rounded-md bg-slate-900 px-3 py-1 text-white"
                  : "rounded-md px-3 py-1 text-slate-600 hover:bg-slate-100"
              }
            >
              {f === "all" ? "All" : NOTE_STATUSES[f]} ({countOf(f)})
            </Link>
          ))}
        </nav>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Left by members with the auditor permission, with the page they were on. Reviewed weekly to improve the
        dashboard.
      </p>

      <div className="space-y-3">
        {notes.length === 0 && (
          <div className={`${cardClass} px-4 py-10 text-center text-sm text-slate-500`}>No notes here.</div>
        )}
        {notes.map((n) => (
          <article key={n.id} className={`${cardClass} p-4`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                {NOTE_KINDS[n.kind] ?? n.kind}
              </span>
              <span>#{n.id}</span>
              <span>{n.full_name ?? n.author}</span>
              <span>{formatDate(n.created_at)}</span>
              {n.metadata?.host && <span className="font-mono">{n.metadata.host}</span>}
            </div>
            <Link href={n.url} className="mt-2 block break-all text-sm font-medium text-indigo-600 hover:underline">
              {n.metadata?.heading || n.page_title || n.path}
              <span className="ml-2 font-mono text-xs font-normal text-slate-500">{n.url}</span>
            </Link>
            {n.metadata?.selection && (
              <blockquote className="mt-2 border-l-2 border-amber-400 pl-2 text-xs text-slate-600">
                {n.metadata.selection}
              </blockquote>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{n.comment}</p>
            {n.resolution && (
              <p className="mt-2 text-xs text-emerald-700">Resolution: {n.resolution}</p>
            )}
            <form action={setAuditNoteStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={n.id} />
              <select name="status" defaultValue={n.status} className={`${secondaryButtonClass} w-auto`}>
                {Object.entries(NOTE_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                name="resolution"
                placeholder="What changed (optional)"
                maxLength={2000}
                className={`${inputClass} max-w-sm flex-1 py-1 text-xs`}
              />
              <button type="submit" className={secondaryButtonClass}>Update</button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
