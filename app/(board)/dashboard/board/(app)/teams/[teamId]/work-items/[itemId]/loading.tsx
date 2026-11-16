
export default function Loading() {
  return (
    
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-32 animate-pulse rounded-lg border border-border bg-panel" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-panel" />
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-border bg-panel" />
      </div>
  );
}
