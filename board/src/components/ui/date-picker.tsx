"use client";

import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Replaces native <input type="date"> — the browser's own calendar popup
// (OS-rendered) can't be restyled, so this reimplements it as a themed Radix
// Popover. Value/onChange use the same "YYYY-MM-DD" | null shape a native
// date input works with, so it's a drop-in swap at call sites.
export function DatePicker({
  value,
  onChange,
  disabled,
  className = "h-8 w-full",
  todayLabel = false,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  // When true, renders "Today" instead of the formatted date for today's
  // value — used by compact quick-entry triggers (e.g. AddTimePopover).
  todayLabel?: boolean;
}) {
  const selected = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);
  const today = new Date();
  const isSelectedToday = selected !== null && toISODate(selected) === toISODate(today);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setViewDate(selected ?? new Date());
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`${className} flex items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-2.5 text-left text-xs shadow-2xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className={selected ? "text-ink" : "text-slate"}>
            {selected
              ? todayLabel && isSelectedToday
                ? "Today"
                : selected.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
              : "Set a date"}
          </span>
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className="radix-content border-border bg-panel z-50 w-64 rounded-lg border p-3 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">
              {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-slate">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const isSelected = selected !== null && toISODate(d) === toISODate(selected);
              const isToday = toISODate(d) === toISODate(today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(toISODate(d));
                    setOpen(false);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
                    isSelected
                      ? "bg-primary font-semibold text-primary-foreground"
                      : isToday
                        ? "border border-primary/50 text-ink"
                        : "text-ink hover:bg-muted"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="border-border mt-2 flex items-center justify-between border-t pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="text-slate hover:text-ink text-xs font-medium"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                onChange(toISODate(t));
                setViewDate(t);
                setOpen(false);
              }}
              className="text-primary hover:text-primary-hover text-xs font-medium"
            >
              Today
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
