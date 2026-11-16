
export default function Loading() {
  return (
    
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-80 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-24 animate-pulse rounded-lg border border-border bg-panel" />
        <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-1/4 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
  );
}
