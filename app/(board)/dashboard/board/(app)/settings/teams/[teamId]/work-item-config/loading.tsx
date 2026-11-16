
export default function Loading() {
  return (
          <div className="space-y-6">
        <div className="h-3 w-96 animate-pulse rounded bg-muted" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-panel p-5">
            <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
  );
}
