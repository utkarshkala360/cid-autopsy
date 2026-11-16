"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";

export type MultiSelectOption = { value: string; label: string };

// Radix's own Select is single-value only — this is the multi-value
// counterpart, same visual language (radix-content animation, border/shadow
// tokens) as Select/DatePicker, built on Popover since there's no
// multi-select primitive in Radix to wrap.
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  className = "h-8 w-full",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  function toggle(value: string) {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? placeholder)
        : `${selected.length} selected`;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={`${className} border-border bg-surface text-ink focus:border-primary focus:ring-primary flex items-center justify-between gap-1.5 rounded-md border px-2.5 text-left text-xs shadow-2xs outline-none transition-colors focus:ring-1`}
        >
          <span className={selected.length === 0 ? "text-slate truncate" : "truncate"}>
            {label}
          </span>
          <ChevronDown className="text-slate h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="radix-content border-border bg-panel z-50 max-h-64 w-56 overflow-y-auto rounded-lg border p-1 shadow-md"
        >
          {options.length === 0 ? (
            <p className="text-slate px-2 py-1.5 text-xs">No options.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="text-ink hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    selected.includes(o.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {selected.includes(o.value) && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
