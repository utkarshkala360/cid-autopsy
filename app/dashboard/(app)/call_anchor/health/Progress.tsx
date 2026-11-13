"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

const BASE = "/dashboard/call_anchor/health";
const API = `${BASE}/pull`;
// How often the browser checks on a running pull, and refreshes the page while one runs.
const POLL_MS = 3_000;
const REFRESH_MS = 10_000;
// A scope pulled this recently isn't asked for again on the next page (owner, 2026-11-13: changing
// pages shouldn't start a pull each time). Kept in session storage, so a reload remembers it too;
// the server separately skips streams pulled in the last 5 minutes.
const COOLDOWN_MS = 5 * 60 * 1000;
const DONE_KEY = "ca-health-pulled";
const readDone = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(DONE_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const markDone = (scope: string) => {
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify({ ...readDone(), [scope]: Date.now() }));
  } catch {
    // Private mode or storage off: the in-memory record still covers this tab.
  }
};

type Failure = { label: string; error: string };
type Status = { scope: string; running: boolean; startedAt: string; finishedAt: string | null; total: number; done: number; current: string | null; failures: Failure[] };
type PullState =
  | { phase: "idle" }
  | { phase: "pulling"; done: number; total: number; current: string | null; failures: Failure[] }
  | { phase: "finished"; total: number; failures: Failure[]; seconds: number };

// The pull runs on the server, after the request that started it (owner, 2026-11-13: in the
// background, so changing tabs never waits on it). The browser only asks for it and follows it with
// plain fetches, outside the router, so it carries on across page changes in this tab.
const job = {
  state: { phase: "idle" } as PullState,
  following: false,
  asked: new Map<string, number>(),
  listeners: new Set<() => void>(),
  set(next: PullState) {
    this.state = next;
    for (const l of this.listeners) l();
  },
};
const subscribe = (l: () => void) => {
  job.listeners.add(l);
  return () => job.listeners.delete(l);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const query = (clientId: string | null) => (clientId ? `?client=${encodeURIComponent(clientId)}` : "");

async function follow(clientId: string | null, refresh: () => void) {
  if (job.following) return;
  job.following = true;
  let lastRefresh = Date.now();
  let lastDone = 0;
  try {
    for (;;) {
      await sleep(POLL_MS);
      const res = await fetch(`${API}${query(clientId)}`, { cache: "no-store" });
      if (!res.ok) break;
      const { status } = (await res.json()) as { status: Status | null };
      if (!status) break;
      if (status.running) {
        job.set({ phase: "pulling", done: status.done, total: status.total, current: status.current, failures: status.failures });
        // New data shows in place while it lands: a refresh is a background transition, and a page
        // change always goes first.
        if (status.done > lastDone && Date.now() - lastRefresh >= REFRESH_MS) {
          lastRefresh = Date.now();
          refresh();
        }
        lastDone = status.done;
        continue;
      }
      const seconds = status.finishedAt ? Math.round((Date.parse(status.finishedAt) - Date.parse(status.startedAt)) / 1000) : 0;
      job.set({ phase: "finished", total: status.total, failures: status.failures, seconds });
      markDone(status.scope);
      refresh();
      // The server recomputes from the new data after that read; show the result once it's ready.
      setTimeout(refresh, 8_000);
      break;
    }
  } catch {
    job.set({ phase: "idle" });
  } finally {
    job.following = false;
  }
}

async function start(clientId: string | null, verifyHref: string, refresh: () => void) {
  const scope = clientId ?? "fleet";
  job.asked.set(scope, Date.now());
  try {
    const res = await fetch(`${API}${query(clientId)}`, { method: "POST", cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { verify?: true; state?: "started" | "running" | "nothing"; status?: Status | null };
    if (body.verify) return window.location.assign(verifyHref);
    if (body.state === "nothing") {
      markDone(scope);
      return;
    }
    if (body.status?.running) job.set({ phase: "pulling", done: body.status.done, total: body.status.total, current: body.status.current, failures: body.status.failures });
    void follow(clientId, refresh);
  } catch {
    // Offline or the server restarted: the next page asks again.
    job.asked.delete(scope);
  }
}

// Asks the server to pull what's new from CallAnchor and shows how far it got, small, in the corner
// (owner, 2026-11-13). Fleet pages pull every client; a client's pages pull only that client. The
// page underneath already shows the stored data and stays usable throughout.
export function PullProgress({ verifyHref }: { verifyHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const clientId = pathname.startsWith(`${BASE}/clients/`) ? decodeURIComponent(pathname.split("/")[5] ?? "") || null : null;
  const scope = clientId ?? "fleet";
  const state = useSyncExternalStore(subscribe, () => job.state, () => job.state);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A pull being followed carries on, whatever page it was started from; a fleet pull covers every
    // client.
    if (job.following) return;
    const stored = readDone();
    const recent = (s: string) => Date.now() - Math.max(job.asked.get(s) ?? 0, stored[s] ?? 0) < COOLDOWN_MS;
    if (recent(scope) || recent("fleet")) return;
    void start(clientId, verifyHref, () => router.refresh());
  }, [scope, clientId, verifyHref, router]);

  // The "finished" note fades after a few seconds unless something failed.
  useEffect(() => {
    if (state.phase !== "finished" || state.failures.length) return;
    const t = setTimeout(() => job.set({ phase: "idle" }), 5000);
    return () => clearTimeout(t);
  }, [state]);

  if (state.phase === "idle") return null;
  const failed = state.failures.length;
  const box = "fixed bottom-4 right-4 z-40 w-72 rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur";
  if (state.phase === "finished") {
    return (
      <div role="status" className={`${box} ${failed ? "border-amber-200 text-amber-900" : "border-emerald-200 text-emerald-800"}`}>
        <div className="flex items-start justify-between gap-2">
          <p>
            {failed
              ? `Pulled ${state.total} streams in ${state.seconds}s; ${failed} failed and are retried on the next pull.`
              : `Up to date: pulled ${state.total} stream${state.total === 1 ? "" : "s"} in ${state.seconds}s.`}
          </p>
          <button type="button" onClick={() => job.set({ phase: "idle" })} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {failed > 0 && <FailureList failures={state.failures} />}
      </div>
    );
  }
  const percent = Math.round((state.done / Math.max(1, state.total)) * 100);
  return (
    <div role="status" aria-live="polite" className={`${box} border-indigo-200 text-slate-700`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          Updating from CallAnchor in the background
        </span>
        <span className="font-semibold tabular-nums text-indigo-700">{percent}%</span>
      </button>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-indigo-50">
        <div className="h-1 rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      {open && (
        <p className="mt-1.5 text-slate-500">
          {state.done} of {state.total} streams{state.current ? ` · now: ${state.current}` : ""}
        </p>
      )}
      {failed > 0 && <FailureList failures={state.failures} live />}
    </div>
  );
}

// What failed, by step: the same error grouped, with the streams it hit.
function FailureList({ failures, live = false }: { failures: Failure[]; live?: boolean }) {
  const groups = new Map<string, string[]>();
  for (const f of failures) groups.set(f.error, [...(groups.get(f.error) ?? []), f.label]);
  return (
    <details className="mt-1.5 text-xs" open={!live}>
      <summary className="cursor-pointer font-medium text-amber-800">
        {failures.length} failed{live ? " so far" : ""}: see why
      </summary>
      <ul className="mt-1 space-y-1">
        {[...groups].map(([error, labels]) => (
          <li key={error} className="rounded-md bg-white/70 px-2 py-1 text-amber-900 ring-1 ring-amber-200">
            <span className="font-mono">{error}</span>
            <span className="text-amber-700"> · {labels.length} stream{labels.length === 1 ? "" : "s"}: {labels.slice(0, 6).join(", ")}{labels.length > 6 ? `, +${labels.length - 6} more` : ""}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// A store read can't report its steps, so this estimates: it rises quickly, then slows, and never
// claims 100% until the page arrives. `expectMs` is how long such a read usually takes.
export function EstimatedProgress({ text, expectMs = 4000 }: { text: string; expectMs?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 200);
    return () => clearInterval(t);
  }, []);
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / expectMs))));
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true" role="status">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">{text}</p>
        <p className="font-semibold tabular-nums text-indigo-700">{percent}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-50">
        <div className="h-2 rounded-full bg-indigo-600 transition-all duration-200" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-400">{Math.round(elapsed / 1000)}s</p>
    </div>
  );
}
