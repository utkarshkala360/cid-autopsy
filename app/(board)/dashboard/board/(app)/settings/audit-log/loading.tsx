
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-2 rounded-lg border border-border bg-panel p-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
