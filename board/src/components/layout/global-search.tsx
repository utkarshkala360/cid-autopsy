"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

type SearchResult = {
  id: string;
  key: string;
  title: string;
  teamId: string;
  teamName: string;
  typeLabel: string;
};

// §7.1: Team-scoped search — the API only ever returns Work Items on Teams
// the current Member has a role on (see /api/search). Debounced client-side;
// no results fetch fires until the query is 2+ characters.
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const res = await fetch(`/dashboard/board/api/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goTo(result: SearchResult) {
    setOpen(false);
    setQuery("");
    router.push(`/dashboard/board/teams/${result.teamId}/work-items/${result.id}`);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="text-slate absolute top-2.5 left-2.5 h-4 w-4" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results[0]) goTo(results[0]);
        }}
        placeholder="Search Work Items by title or key…"
        className="border-border bg-surface text-ink placeholder:text-slate focus:border-primary focus:ring-primary h-9 w-full rounded-md border pr-3 pl-9 text-xs focus:ring-1 focus:outline-none"
      />
      {showDropdown && (
        <div className="border-border bg-panel absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-md border py-1 shadow-md">
          {loading ? (
            <div className="text-slate flex items-center gap-2 px-3 py-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-slate px-3 py-2 text-xs">No matching Work Items.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goTo(r)}
                className="text-ink hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs"
              >
                <span className="min-w-0 truncate">
                  <span className="text-slate mr-1.5 font-mono text-[10px]">{r.key}</span>
                  {r.title}
                </span>
                <span className="text-slate shrink-0 text-[10px]">
                  {r.teamName} · {r.typeLabel}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
