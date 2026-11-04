import Link from "next/link";
import type { Drill, Flag, Level } from "@/lib/callanchor/health";
import type { StoreStatus } from "@/lib/callanchor/store";
import { badgeClass, cardClass } from "@/components/ui";
import { FLAG_TEXT, LEVELS, ago, formatDay, formatHour, formatTime, int } from "./format";

// Where the numbers came from: the store's last pull and refresh, and how far back it goes.
export function StoreNote({ store, pullErrors, now, tookMs }: { store: StoreStatus; pullErrors: string[]; now: number; tookMs: number }) {
  const since = [store.callsSince, store.logsSince].filter(Boolean).sort()[0] ?? null;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-slate-400">
      <p>
        Latest changes pulled {ago(store.pulledAt, now)} · last 5-day refresh {ago(store.refreshedAt, now)} · client
        details {ago(store.snapshotAt, now)} · stored history from {formatTime(since)} IST · loaded in {(tookMs / 1000).toFixed(1)}s
      </p>
      {pullErrors.length > 0 && (
        <p className="text-amber-700">Couldn&apos;t pull everything new, so some numbers may be behind: {pullErrors.join("; ")}.</p>
      )}
    </div>
  );
}

export function HealthBadge({ level }: { level: Level }) {
  const { label, icon, className } = LEVELS[level];
  return (
    <span className={`${badgeClass} inline-flex items-center gap-1 whitespace-nowrap ring-1 ${className}`}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

// A flag with items behind it links to them.
export function FlagText({ flag, href }: { flag: Flag; href?: (drill: Drill) => string }) {
  return flag.drill && href ? (
    <Link href={href(flag.drill)} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
      {flag.text}
    </Link>
  ) : (
    flag.text
  );
}

export function Flags({ flags, href }: { flags: Flag[]; href?: (drill: Drill) => string }) {
  if (flags.length === 0) return <p className="text-sm text-slate-500">Nothing needs attention.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {flags.map((flag) => (
        <li key={flag.text} className={FLAG_TEXT[flag.level]}>
          <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">{flag.level}</span>
          <FlagText flag={flag} href={href} />
        </li>
      ))}
    </ul>
  );
}

// Text that opens the items behind it.
export function ItemLink({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`underline decoration-dotted underline-offset-2 hover:decoration-solid ${className}`}>
      {children}
    </Link>
  );
}

export function Tile({ label, value, detail, href }: { label: string; value: React.ReactNode; detail?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${href ? "text-indigo-700" : "text-slate-900"}`}>{value}</p>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${cardClass} block p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${cardClass} p-4`}>{body}</div>
  );
}

export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-4 text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export const td = "whitespace-nowrap px-3 py-2 align-top text-slate-700";

export function LoadingNote({ text }: { text: string }) {
  return (
    <div className={`${cardClass} mt-6 animate-pulse p-6`} aria-busy="true">
      <p className="text-sm text-slate-500">{text}</p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${95 - i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

// Delivered and failed syncs per bucket, stacked. Colours are the status pair, labelled in the legend.
const DELIVERED = "#0ca30c";
const FAILED = "#d03b3b";

export function SyncTrend({ buckets, hourly }: { buckets: { start: string; delivered: number; failed: number }[]; hourly: boolean }) {
  const max = Math.max(1, ...buckets.map((b) => b.delivered + b.failed));
  const label = (start: string) => (hourly ? formatHour(start) : formatDay(start));
  const every = Math.ceil(buckets.length / 8);
  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: DELIVERED }} />Delivered</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: FAILED }} />Failed</span>
        <span className="ml-auto text-slate-400">Peak {int(max)} per {hourly ? "hour" : "day"}</span>
      </div>
      <div className="mt-3 flex h-36 items-end gap-0.5 border-b border-slate-300">
        {buckets.map((b) => {
          const total = b.delivered + b.failed;
          return (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px] hover:opacity-80"
              title={`${label(b.start)}: ${int(b.delivered)} delivered, ${int(b.failed)} failed`}
            >
              {b.failed > 0 && <div className="rounded-t" style={{ height: `${(b.failed / max) * 100}%`, background: FAILED }} />}
              {b.delivered > 0 && (
                <div className={b.failed > 0 ? "" : "rounded-t"} style={{ height: `${(b.delivered / max) * 100}%`, background: DELIVERED }} />
              )}
              {total === 0 && <div className="h-px" />}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-400">
        {buckets.map((b, i) => (
          <span key={b.start} className="min-w-0 flex-1 truncate">{i % every === 0 ? label(b.start) : ""}</span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500">Show as a table</summary>
        <table className="mt-2 text-xs">
          <tbody>
            {buckets.map((b) => (
              <tr key={b.start}>
                <td className="pr-4 text-slate-500">{label(b.start)}</td>
                <td className="pr-4">{int(b.delivered)} delivered</td>
                <td>{int(b.failed)} failed</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
