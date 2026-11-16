import type { LucideIcon } from "lucide-react";

type Tone = "neutral" | "done" | "blocked" | "in-progress";

// A single headline number, not a chart — DB-1's open/closed/overdue counts
// are magnitudes best read as text, per the dataviz form heuristic ("is it
// even a chart?"). Color is a status token, never color-alone: the number
// and label are always present as text.
export function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    neutral: "bg-muted text-slate",
    done: "bg-status-done-bg text-status-done",
    blocked: "bg-status-blocked-bg text-status-blocked",
    "in-progress": "bg-status-in-progress-bg text-status-in-progress",
  };

  return (
    <div className="rounded-lg border border-border bg-panel p-5 shadow-2xs">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${toneClasses[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="text-xs font-medium text-slate">{label}</p>
    </div>
  );
}
