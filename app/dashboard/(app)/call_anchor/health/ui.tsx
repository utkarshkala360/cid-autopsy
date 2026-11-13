import Link from "next/link";

// The health pages' visual parts (owner, 2026-11-13: neat and easy on the eye): a dark hero header
// with its key numbers, stat cells with an icon and a coloured accent, and outline icons.

const ICONS = {
  calls: <path d="M3 14v-3a9 9 0 0 1 18 0v3M3 14a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2zm18 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z" />,
  licenses: <><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" /></>,
  plug: <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  seats: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  logs: <><path d="M8 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></>,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  route: <><circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /></>,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export type Tone = "blue" | "green" | "violet" | "red" | "amber" | "slate";
const TONES: Record<Tone, { border: string; icon: string }> = {
  blue: { border: "border-l-blue-500", icon: "bg-blue-50 text-blue-600 ring-blue-100" },
  green: { border: "border-l-emerald-500", icon: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  violet: { border: "border-l-violet-500", icon: "bg-violet-50 text-violet-600 ring-violet-100" },
  red: { border: "border-l-red-500", icon: "bg-red-50 text-red-600 ring-red-100" },
  amber: { border: "border-l-amber-500", icon: "bg-amber-50 text-amber-600 ring-amber-100" },
  slate: { border: "border-l-slate-300", icon: "bg-slate-50 text-slate-500 ring-slate-200" },
};

// One number with its icon, label and a line under it. Opens its rows when it has an href.
export function StatCell({ icon, tone = "slate", label, value, sub, href }: { icon: IconName; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <div className={`flex h-full items-start gap-3 border-l-4 bg-white px-4 py-3.5 ${TONES[tone].border}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${TONES[tone].icon}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full transition hover:brightness-[0.98] [&>div]:hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    body
  );
}

// A row of stat cells, joined into one card under a hero or on its own.
export function StatStrip({ children, attached = false }: { children: React.ReactNode; attached?: boolean }) {
  return (
    <div className={`grid gap-px overflow-hidden bg-slate-200 sm:grid-cols-2 lg:grid-cols-4 ${attached ? "" : "rounded-2xl border border-slate-200 shadow-sm"}`}>
      {children}
    </div>
  );
}

export type HeroKpi = { label: string; value: React.ReactNode; bar?: number | null; note?: string };

// The dark header of a page: where you are, what it is, its status and its two or three key numbers,
// with a stat strip attached underneath.
export function Hero({
  back,
  eyebrow,
  title,
  badge,
  meta,
  kpis = [],
  actions,
  children,
}: {
  back?: { href: string; label: string };
  eyebrow: { icon: IconName; label: string };
  title: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  kpis?: HeroKpi[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-700 px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            {back && (
              <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-sm text-indigo-100 hover:text-white">
                <Icon name="back" /> {back.label}
              </Link>
            )}
            <p className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-100 ring-1 ring-white/15">
              <Icon name={eyebrow.icon} className="h-3.5 w-3.5" /> {eyebrow.label}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {badge}
            </div>
            {meta && <div className="mt-1 text-sm text-indigo-100/90">{meta}</div>}
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            {actions}
            {kpis.map((k) => (
              <div key={k.label} className="min-w-36 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-100">{k.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
                {k.bar !== undefined && k.bar !== null && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/15">
                    <div
                      className={`h-1.5 rounded-full ${k.bar >= 95 ? "bg-emerald-400" : k.bar >= 80 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${Math.max(2, Math.min(100, k.bar))}%` }}
                    />
                  </div>
                )}
                {k.note && <p className="mt-1 text-[11px] text-indigo-100/80">{k.note}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

// A status pill for the dark hero.
export function HeroPill({ tone, children }: { tone: "green" | "amber" | "red" | "slate"; children: React.ReactNode }) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];
  const dot = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", slate: "bg-slate-400" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

// A number with a ring filled to its share of another (owner, 2026-11-13): seats active of
// purchased, logged in and calling of active. Without a share (`of` unknown or 0) the ring stays
// empty. `tone` follows the share unless given.
export function Ring({ value, of, tone, title }: { value: number | null; of?: number | null; tone?: "indigo" | "green" | "amber" | "red" | "slate"; title?: string }) {
  const share = value !== null && of ? Math.max(0, Math.min(1, value / of)) : null;
  const colour =
    tone ?? (share === null ? "slate" : share >= 0.8 ? "green" : share >= 0.5 ? "amber" : "red");
  const stroke = { indigo: "stroke-indigo-500", green: "stroke-emerald-500", amber: "stroke-amber-500", red: "stroke-red-500", slate: "stroke-slate-300" }[colour];
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2" title={title ?? (share !== null ? `${value} of ${of} (${Math.round(share * 100)}%)` : undefined)}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3.5" className="stroke-slate-100" />
        {share !== null && share > 0 && (
          <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" className={stroke} strokeDasharray={`${share * c} ${c}`} />
        )}
      </svg>
      <span className="tabular-nums font-medium text-slate-900">{value === null ? "—" : value.toLocaleString("en-IN")}</span>
      {share !== null && <span className="text-xs tabular-nums text-slate-400">{Math.round(share * 100)}%</span>}
    </span>
  );
}
