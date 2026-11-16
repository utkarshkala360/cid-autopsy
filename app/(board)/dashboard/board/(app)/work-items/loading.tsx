
export default function Loading() {
  return (
          <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="rounded-lg border border-border bg-panel p-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
  );
}
