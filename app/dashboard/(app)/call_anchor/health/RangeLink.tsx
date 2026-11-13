"use client";

import Link, { useLinkStatus } from "next/link";

// One option of the range picker. While its range loads, the current table stays on screen and the
// picked option shows a small spinner (owner, 2026-11-13: switching range shouldn't look like a reload).
export function RangeLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
      <Pending />
    </Link>
  );
}

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-label="Loading" className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700" /> : null;
}
