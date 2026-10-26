import { cardClass } from "@/components/ui";

// Shown instantly on navigation while the next page's data loads.
export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-3 h-6 w-56 rounded bg-slate-200" />
      <div className={`${cardClass} mt-6 space-y-4 p-5`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
