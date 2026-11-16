"use client";

import { Toaster as Sonner } from "sonner";

/** Themed sonner mount point (Phase 12) — one instance in the root layout. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-start gap-2.5 w-full rounded-lg border border-border bg-panel px-3.5 py-3 text-xs shadow-lg",
          title: "font-semibold text-ink",
          description: "text-slate mt-0.5",
          success: "[&_[data-icon]]:text-status-done",
          error: "[&_[data-icon]]:text-status-blocked",
          actionButton:
            "!bg-primary !text-primary-foreground !rounded-md !text-[11px] !font-semibold !px-2.5 !h-7",
          cancelButton:
            "!bg-muted !text-ink !rounded-md !text-[11px] !font-medium !px-2.5 !h-7",
        },
      }}
    />
  );
}
