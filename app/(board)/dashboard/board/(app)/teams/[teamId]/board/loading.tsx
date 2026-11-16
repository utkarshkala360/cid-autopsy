
export default function Loading() {
  return (
    
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="flex gap-3 overflow-x-hidden">
          {[...Array(3)].map((_, col) => (
            <div key={col} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface/60">
              <div className="border-b border-border px-3 py-2.5">
                <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex flex-col gap-2 p-2.5">
                {[...Array(3)].map((_, card) => (
                  <div key={card} className="h-20 animate-pulse rounded-md border border-border bg-panel" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
