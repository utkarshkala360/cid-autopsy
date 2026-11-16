"use client";

import { useState } from "react";
import Link from "next/link";
import { int, toneDot, toneText, type Tone } from "./format";

// The left menu of the entity tabs (owner, 2026-11-13): groups of filters, each multi-select. A
// group is collapsed and shows only what's picked (or "All" with its count); opening it lists every
// option as a tick box with its count, one group open at a time. It stays open while you tick
// several, since the menu stays mounted across those page changes. Options are links, so a pick is in
// the URL (`?health=critical,warning`).
export type MenuItem = {
  key: string;
  label: string;
  active: boolean;
  count?: number;
  tone?: Tone;
  title?: string;
  href: string;
  // Shown even with a count of 0 (the "All" option).
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
  const [open, setOpen] = useState<string | null>(null);
  return (
    <aside className="mb-6 lg:sticky lg:top-32 lg:mb-0 lg:max-h-[calc(100vh-9rem)] lg:w-56 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:pr-1">
      {groups.map((g, gi) => {
        const all = g.items.find((i) => i.key === "all");
        const options = g.items.filter((i) => i.key !== "all");
        const picked = options.filter((i) => i.active);
        const isOpen = open === g.title;
        return (
          <nav key={g.title} aria-label={g.title} className={gi > 0 ? "mt-3 border-t border-slate-200 pt-3" : ""}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : g.title)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-slate-50"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                {!isOpen && (picked.length ? `${picked.length} picked` : "All")}
                <span aria-hidden className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
              </span>
            </button>
            {isOpen ? (
              <ul className="mt-1 space-y-0.5">
                {all && <li><Row item={{ ...all, active: picked.length === 0 }} box /></li>}
                {options
                  .filter((i) => i.always || i.active || i.count === undefined || i.count > 0)
                  .map((i) => (
                    <li key={i.key}>
                      <Row item={i} box />
                    </li>
                  ))}
              </ul>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {picked.length ? (
                  picked.map((i) => (
                    <li key={i.key}>
                      <Row item={i} remove />
                    </li>
                  ))
                ) : (
                  all && <li><Row item={{ ...all, active: true }} /></li>
                )}
              </ul>
            )}
          </nav>
        );
      })}
    </aside>
  );
}

// One option. In an open group it's a tick box; in a closed one a picked option shows a ✕ that
// removes it (its link toggles it off).
function Row({ item, box = false, remove = false }: { item: MenuItem; box?: boolean; remove?: boolean }) {
  const cls = `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
    item.active ? "bg-indigo-50 font-medium text-indigo-800 ring-1 ring-indigo-200" : "text-slate-700 hover:bg-slate-50"
  }`;
  return (
    <Link href={item.href} scroll={false} aria-current={item.active ? "true" : undefined} title={item.title} className={cls}>
      {box && (
        <span aria-hidden className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${item.active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>
          {item.active ? "✓" : ""}
        </span>
      )}
      {item.tone && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${toneDot[item.tone]}`} />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className={`shrink-0 text-xs font-medium tabular-nums ${item.count === 0 ? "text-slate-400" : item.tone ? toneText[item.tone] : "text-slate-500"}`}>{int(item.count)}</span>
      )}
      {remove && <span aria-label={`Remove ${item.label}`} className="shrink-0 text-xs text-slate-400 hover:text-slate-700">✕</span>}
    </Link>
  );
}
