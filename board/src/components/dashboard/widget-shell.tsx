import type { ReactNode } from "react";

// The one card wrapper every Dashboard widget renders through — extracted
// from what used to be 4 copy-pasted `rounded-lg border ... p-5` divs
// directly in dashboard/page.tsx. This is what makes the widget grid
// genuinely config-driven: a widget is "a title + WidgetShell + whatever
// it renders," not a bespoke block of markup per kind.
export function WidgetShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
