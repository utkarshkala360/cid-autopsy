"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

// Shared dropdown primitive — replaces native <select>/<option> everywhere
// so every dropdown in the app shares one look (matches HoverCard/Popover's
// radix-content/radix-overlay animation, already themed in globals.css).
//
// Radix disallows an Item with value="" (it collides with "no selection"
// internally) — for a "None"/"Unassigned"/clear option, give it a sentinel
// value (e.g. "__none__") and translate to/from "" or null at the call site's
// onValueChange, or use the `placeholder` prop instead if nothing should be
// selectable as "empty".
export function Select({
  value,
  onValueChange,
  disabled,
  placeholder,
  className = "h-8 w-full",
  triggerClassName,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={`${className} ${triggerClassName ?? ""} flex items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-2.5 text-left text-xs text-ink shadow-2xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-slate`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="radix-content border-border bg-panel z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border shadow-md"
        >
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 text-slate">
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1 text-slate">
            <ChevronDown className="h-3.5 w-3.5" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectOption({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className="relative flex h-8 cursor-pointer items-center rounded-md px-2.5 pr-7 text-xs text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-primary">
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
