import Link from "next/link";
import { int, toneDot, toneText, type Tone } from "./format";

// The left menu of the Overview, Clients and Licenses tabs (owner, 2026-11-13): groups of filters
// (Module, then Health or Use), each option with its count. An option with nothing behind it is
// hidden, unless it's picked; "All" always shows. Options are links (server pages) or buttons (the
// Clients table, which filters in the browser).
export type MenuItem = {
  key: string;
  label: string;
  active: boolean;
  count?: number;
  tone?: Tone;
  title?: string;
  href?: string;
  onClick?: () => void;
  // Shown even with a count of 0 (the "All" option, a module).
  always?: boolean;
};
export type MenuGroup = { title: string; items: MenuItem[] };

export function MenuLayout({ groups, children }: { groups: MenuGroup[]; children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:gap-8">
      <FilterMenu groups={groups} />
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}

export function FilterMenu({ groups }: { groups: MenuGroup[] }) {
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.always || i.active || i.count === undefined || i.count > 0) })).filter((g) => g.items.length > 0);
  return (
    <aside className="mb-6 lg:sticky lg:top-32 lg:mb-0 lg:max-h-[calc(100vh-9rem)] lg:w-56 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:pr-1">
      {shown.map((g, gi) => (
        <nav key={g.title} aria-label={g.title} className={gi > 0 ? "mt-5 border-t border-slate-200 pt-4" : ""}>
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((i) => (
              <li key={i.key}>
                <MenuRow item={i} />
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </aside>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const cls = `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
    item.active ? "bg-indigo-50 font-medium text-indigo-800 ring-1 ring-indigo-200" : "text-slate-700 hover:bg-slate-50"
  }`;
  const body = (
    <>
      {item.tone && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${toneDot[item.tone]}`} />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className={`shrink-0 text-xs font-medium tabular-nums ${item.count === 0 ? "text-slate-400" : item.tone ? toneText[item.tone] : "text-slate-500"}`}>{int(item.count)}</span>
      )}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} aria-current={item.active ? "page" : undefined} title={item.title} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} aria-pressed={item.active} title={item.title} className={cls}>
      {body}
    </button>
  );
}
