export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-lg border border-border bg-panel p-5">
        <div className="overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
