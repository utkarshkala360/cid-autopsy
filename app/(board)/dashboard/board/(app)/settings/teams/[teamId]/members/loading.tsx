
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-3 w-96 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-lg border border-border bg-panel" />
      <div className="rounded-lg border border-border bg-panel p-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border py-3.5 last:border-0">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
