
export default function Loading() {
  return (
    
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-96 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-panel" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-lg border border-border bg-panel" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-panel" />
        </div>
      </div>
  );
}
