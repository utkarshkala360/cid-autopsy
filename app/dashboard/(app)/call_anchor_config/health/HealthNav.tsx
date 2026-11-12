"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setShowInternalAction } from "./actions";

const BASE = "/dashboard/call_anchor_config/health";

const VIEWS = [
  { key: "clients", label: "Clients", path: "" },
  { key: "licenses", label: "Licenses", path: "/licenses" },
  { key: "seats", label: "Seats", path: "/seats" },
  { key: "settings", label: "Settings", path: "/settings", adminOnly: true },
] as const;

type PageSection = { id: string; label: string };

// Which view a path belongs to. Client, call, issue and item pages sit under Clients.
function viewOf(pathname: string) {
  for (const v of VIEWS) if (v.path && (pathname === BASE + v.path || pathname.startsWith(`${BASE}${v.path}/`))) return v.key;
  return "clients";
}

// The page's sections, read from the elements Section and Collapsed mark with data-section. They
// stream in after the page shell, so the list follows the DOM.
function usePageSections(pathname: string) {
  const [sections, setSections] = useState<PageSection[]>([]);
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const read = () => {
      const found = [...main.querySelectorAll<HTMLElement>("[data-section]")].map((el) => ({ id: el.id, label: el.dataset.section ?? "" }));
      setSections((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return sections;
}

export function HealthNav({ isAdmin, showInternal }: { isAdmin: boolean; showInternal: boolean }) {
  const pathname = usePathname();
  const current = viewOf(pathname);
  const sections = usePageSections(pathname);
  const views = VIEWS.filter((v) => !("adminOnly" in v) || isAdmin);

  return (
    <aside className="mb-6 lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client health</p>
      <nav aria-label="Client health" className="mt-2 flex flex-wrap gap-1 lg:flex-col">
        {views.map((v) => (
          <Link
            key={v.key}
            href={BASE + v.path}
            aria-current={v.key === current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              v.key === current ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <form action={setShowInternalAction} className="mt-3 px-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
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

      {sections.length > 0 && (
        <div className="mt-6 hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
          <ul className="mt-2 space-y-0.5 border-l border-slate-200">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => {
                    // A collapsed section opens when it's jumped to.
                    const el = document.getElementById(s.id);
                    if (el instanceof HTMLDetailsElement) el.open = true;
                  }}
                  className="-ml-px block border-l border-transparent py-1 pl-3 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-900"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
