"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@board/components/ui/button";

/**
 * Themed replacement for the native confirm() this codebase used for every
 * destructive action (Phase 12) — same "are you sure" gate, but styled,
 * keyboard/focus-trapped, and dismissible with Escape/outside-click like
 * the rest of the UI, via Radix's Dialog primitive.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay bg-ink/40 fixed inset-0 z-50" />
        <Dialog.Content className="radix-content border-border bg-panel fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-lg focus:outline-none">
          <Dialog.Title className="text-ink text-sm font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-slate mt-1.5 text-xs leading-relaxed">
            {description}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" size="sm" disabled={pending}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              variant={destructive ? "destructive" : "primary"}
              size="sm"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
