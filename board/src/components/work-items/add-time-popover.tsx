"use client";

import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { DatePicker } from "@board/components/ui/date-picker";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDurationPreview(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0 && m === 0) return "";
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} min`);
  return parts.join(" ");
}

// Quick-entry replacement for the old separate hours/minutes number inputs:
// one "minutes worked" field (people think in stretches like "80", not
// "1h 20m") with a live duration chip confirming the parse, matching the
// compact add-time popover pattern the user asked to match.
export function AddTimePopover({
  memberInitial,
  onSubmit,
  disabled,
}: {
  memberInitial: string;
  onSubmit: (minutes: number, date: string, note?: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [minutesInput, setMinutesInput] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedMinutes = Number(minutesInput);
  const isValid = minutesInput.trim() !== "" && !Number.isNaN(parsedMinutes) && parsedMinutes > 0;
  const preview = isValid ? formatDurationPreview(parsedMinutes) : "";

  function reset() {
    setMinutesInput("");
    setDate(todayIso());
    setNote("");
    setShowNote(false);
    setError(null);
  }

  async function handleAdd() {
    if (!isValid) {
      setError("Enter the minutes worked.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const ok = await onSubmit(parsedMinutes, date, note.trim() || undefined);
    setSubmitting(false);
    if (ok) {
      reset();
      setOpen(false);
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Clock className="h-3.5 w-3.5" />
          Log time
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          align="start"
          className="radix-content border-border bg-panel z-50 w-80 rounded-lg border p-4 shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <input
              type="number"
              min={0}
              autoFocus
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              placeholder="0"
              aria-label="Minutes worked"
              className="text-ink placeholder:text-slate/40 min-w-0 flex-1 border-none bg-transparent text-2xl font-medium outline-none"
            />
            <div className="flex shrink-0 items-center gap-2">
              <DatePicker
                value={date}
                onChange={(v) => setDate(v ?? todayIso())}
                todayLabel
                className="h-7 w-auto text-[11px]"
              />
              <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                {memberInitial}
              </span>
            </div>
          </div>

          <div className="mt-3 flex min-h-[26px] items-center">
            {preview ? (
              <span className="bg-muted text-ink inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium">
                {preview}
              </span>
            ) : (
              <span className="text-slate text-xs">Enter time worked</span>
            )}
          </div>

          {showNote ? (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
              maxLength={500}
              autoFocus
              className="border-border bg-surface text-ink placeholder:text-slate focus:border-primary focus:ring-primary mt-3 h-8 w-full rounded-md border px-2.5 text-xs focus:outline-none focus:ring-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-slate hover:text-ink mt-3 text-xs font-medium"
            >
              + Add note
            </button>
          )}

          {error && <p className="text-status-blocked mt-2 text-xs font-medium">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="text-slate hover:bg-muted hover:text-ink h-8 rounded-md px-3 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isValid || submitting}
              onClick={handleAdd}
              className="bg-primary text-primary-foreground hover:bg-primary-hover h-8 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add time
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
