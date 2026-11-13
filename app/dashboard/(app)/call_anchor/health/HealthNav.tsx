"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { setShowInternalAction } from "./actions";
import { trailFor } from "./trail";
import { Icon, type IconName } from "./ui";

const BASE = "/dashboard/call_anchor/health";

const VIEWS = [
  { key: "overview", label: "Overview", path: "/overview" },
  { key: "clients", label: "Clients", path: "" },
  { key: "licenses", label: "Licenses", path: "/licenses" },
  { key: "seats", label: "Seats", path: "/seats" },
  { key: "settings", label: "Settings", path: "/settings", adminOnly: true },
] as const;

type PageSection = { id: string; label: string };

export function HealthTrail({ clients, phones }: { clients: Record<string, string>; phones: Record<string, string> }) {
  const crumbs = trailFor(usePathname(), useSearchParams().get("back"), clients, phones);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-slate-500">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-x-1.5">
            {i > 0 && <span aria-hidden className="text-slate-300">›</span>}
            {c.href ? (
              <Link href={c.href} className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900">{c.label}</Link>
            ) : (
              <span aria-current="page" className="px-1 font-medium text-slate-900">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// The left menu beside the page. Client pages put it under the client's name and tabs (their layout
// wraps itself in it), so here it frames only the other health pages.
export function SectionsFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:gap-8">
      <HealthSections />
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}

export function HealthBody({ children }: { children: React.ReactNode }) {
  const inClient = usePathname().startsWith(`${BASE}/clients/`);
  return inClient ? <>{children}</> : <SectionsFrame>{children}</SectionsFrame>;
}

// One client's tabs, under its name: Health, Licenses, Seats, Calls & logs. A phone opens under
// Licenses, a call under Calls & logs, an issue under Health.
export function ClientTabs({ root }: { root: string }) {
  const pathname = usePathname();
  const rest = pathname.slice(root.length);
  const current = rest.startsWith("/licenses") ? "licenses" : rest.startsWith("/seats") ? "seats" : rest.startsWith("/items") || rest.startsWith("/calls") ? "items" : "health";
  const tabs: { key: string; label: string; href: string; icon: IconName }[] = [
    { key: "health", label: "Health", href: root, icon: "grid" },
    { key: "licenses", label: "Licenses", href: `${root}/licenses`, icon: "licenses" },
    { key: "seats", label: "Seats", href: `${root}/seats`, icon: "seats" },
    { key: "items", label: "Calls & logs", href: `${root}/items?kind=calls&stage=all&window=1`, icon: "logs" },
  ];
  return (
    <nav aria-label="This client" className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-4">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3.5 text-sm font-medium ${
            t.key === current ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
        >
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// Which view a path belongs to. Client, call, issue and item pages sit under Clients.
function viewOf(pathname: string) {
  for (const v of VIEWS) if (v.path && (pathname === BASE + v.path || pathname.startsWith(`${BASE}${v.path}/`))) return v.key;
  return "clients";
}

// The health views as a bar frozen under the site header, with the internal-clients switch.
export function HealthSubBar({ isAdmin, showInternal }: { isAdmin: boolean; showInternal: boolean }) {
  const current = viewOf(usePathname());
  const views = VIEWS.filter((v) => !("adminOnly" in v) || isAdmin);
  return (
    <div className="sticky top-14 z-20 -mx-4 -mt-8 mb-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-400 sm:inline">Client health</span>
        <nav aria-label="Client health" className="flex gap-1">
          {views.map((v) => (
            <Link
              key={v.key}
              href={BASE + v.path}
              aria-current={v.key === current ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                v.key === current ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form action={`${BASE}/find`} className="ml-auto shrink-0" role="search">
          <input
            name="id"
            placeholder="Find by ID"
            aria-label="Find a call or phone by any id"
            className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs focus:w-56 focus:border-indigo-500 focus:outline-none sm:w-44"
          />
        </form>
        <form action={setShowInternalAction} className="shrink-0">
          <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-slate-600">
            <input
              type="checkbox"
              name="show"
              value="1"
              defaultChecked={showInternal}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
            />
            Show internal clients
          </label>
        </form>
      </div>
    </div>
  );
}

// The page's sections as the left menu. One section shows at a time: the first until another is
// picked (the others are hidden, a collapsed one opens). There is no whole-page view (owner,
// 2026-11-13). Sections are read from the
// elements Section and Collapsed mark with data-section; they stream in after the page shell, so the
// list follows the DOM. The choice lives in the URL hash, so a link or reload keeps it.
export function HealthSections() {
  const pathname = usePathname();
  const [sections, setSections] = useState<PageSection[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // The picked section belongs to the page it was picked on; another page starts on its first.
  const [chosen, setChosen] = useState<{ path: string; id: string | null }>(() => ({
    path: pathname,
    id: typeof window !== "undefined" && window.location.hash.startsWith("#s-") ? window.location.hash.slice(1) : null,
  }));
  const focus = chosen.path === pathname ? chosen.id : null;

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const apply = () => {
      const elements = [...main.querySelectorAll<HTMLElement>("[data-section]")];
      const found = elements.map((el) => ({ id: el.id, label: el.dataset.section ?? "" }));
      setSections((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found));
      const shown = focus && elements.some((el) => el.id === focus) ? focus : (elements[0]?.id ?? null);
      setActive(shown);
      for (const el of elements) {
        el.hidden = el.id !== shown;
        if (shown === el.id && el instanceof HTMLDetailsElement) el.open = true;
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, focus]);

  if (sections.length === 0) return null;

  const pick = (id: string) => {
    setChosen({ path: pathname, id });
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  };
  const item = (active: boolean) =>
    `-ml-px block w-full border-l-2 py-1.5 pl-3 text-left text-sm ${
      active ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900"
    }`;

  return (
    <aside className="mb-6 lg:sticky lg:w-44 lg:shrink-0 lg:top-32 lg:mb-0 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
      <ul className="mt-2 flex flex-wrap gap-x-3 border-slate-200 lg:block lg:border-l">
        {sections.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => pick(s.id)} aria-pressed={active === s.id} className={item(active === s.id)}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
