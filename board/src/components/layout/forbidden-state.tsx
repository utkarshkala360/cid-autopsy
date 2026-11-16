import { ShieldAlert } from "lucide-react";

export function ForbiddenState({
  title = "You don't have access to this page",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-8 text-center shadow-xs">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-status-blocked-bg text-status-blocked mb-4">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate">
        {message}
      </p>
    </div>
  );
}
