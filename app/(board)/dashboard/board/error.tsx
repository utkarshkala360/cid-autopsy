"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Root error boundary (Non-Negotiable #7 — no screen may show nothing or
// spin forever, including on a thrown error). Next.js requires this to be a
// Client Component. It replaces the route segment below the root layout, so
// AppShell's Sidebar/TopNav chrome isn't present here — same tradeoff as any
// route-level error boundary in the App Router.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-status-blocked-bg text-status-blocked">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="font-heading text-lg font-bold text-ink">Something went wrong</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate">
          An unexpected error occurred while loading this page. You can try again, or head back
          to the dashboard.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
          >
            Try again
          </button>
          <a
            href="/dashboard/board/dashboard"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-ink transition-colors hover:bg-muted"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
