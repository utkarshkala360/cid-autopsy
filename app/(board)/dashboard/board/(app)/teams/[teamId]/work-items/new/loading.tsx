
export default function Loading() {
  return (
          <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-panel p-5">
          <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
  );
}
