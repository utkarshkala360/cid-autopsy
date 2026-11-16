"use client";

import * as HoverCard from "@radix-ui/react-hover-card";

/**
 * Wraps any rendered member name across the app (history feed, assignee/
 * reporter, uploader, mention chips) with a hover card showing their
 * profile — just name + email today, deliberately shaped to take more
 * fields (avatar, role, team) later without changing every call site.
 */
export function MemberHoverCard({
  name,
  email,
  children,
}: {
  name: string;
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <HoverCard.Root openDelay={250} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span className="decoration-border cursor-default underline decoration-dotted underline-offset-2">
          {children}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={6}
          className="radix-content border-border bg-panel z-50 w-60 rounded-lg border p-3 shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-ink truncate text-xs font-semibold">
                {name}
              </p>
              {email && (
                <p className="text-slate truncate text-[11px]">{email}</p>
              )}
            </div>
          </div>
          <HoverCard.Arrow className="fill-panel" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
