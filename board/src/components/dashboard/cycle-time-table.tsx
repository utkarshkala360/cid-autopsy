import type { CycleTimeStat } from "@board/lib/cycle-time";
import { labelForType, type TemplateDefLite } from "@board/lib/work-item-templates";

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// RP-3: average lead time (creation → done) and cycle time (work-start →
// done) per Work-Item-type, reconstructed by computeCycleTime() from the
// existing status ChangeHistory trail — no new tracking, just a different
// read of it (same "one audit engine, many reports" principle as RP-1's
// burndown). `templates` comes from the parent (labelForType is now
// registry-backed, Phase 16 Design 3, so it can no longer resolve a label
// from a fixed const map on its own).
export function CycleTimeTable({ stats, templates }: { stats: CycleTimeStat[]; templates: TemplateDefLite[] }) {
  if (stats.length === 0) {
    return <p className="text-xs text-slate">No completed Work Items in this scope yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
            <th className="pb-2 pr-4 font-semibold">Type</th>
            <th className="pb-2 pr-4 font-semibold">Done items</th>
            <th className="pb-2 pr-4 font-semibold">Avg. lead time</th>
            <th className="pb-2 pr-4 font-semibold">Avg. cycle time</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.type} className="border-b border-border last:border-0">
              <td className="py-2.5 pr-4 font-medium text-ink">{labelForType(s.type, templates)}</td>
              <td className="py-2.5 pr-4 text-slate">{s.count}</td>
              <td className="py-2.5 pr-4 text-slate">{formatHours(s.avgLeadTimeHours)}</td>
              <td className="py-2.5 pr-4 text-slate">{formatHours(s.avgCycleTimeHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
