"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { planPullAction, pullBatchAction } from "./actions";

const BASE = "/dashboard/call_anchor/health";
const BATCH = 4;
// A scope pulled this recently isn't planned again on the next page (owner, 2026-11-13: changing
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
type PullState =
  | { phase: "idle" }
  | { phase: "pulling"; done: number; total: number; current: string[]; failures: Failure[]; started: number }
  | { phase: "finished"; total: number; failures: Failure[]; seconds: number };

// One pull job for the whole tab, outside React: navigating between health pages, or a re-render,
// shows the job already running instead of starting another.
const job = {
  state: { phase: "idle" } as PullState,
  scope: null as string | null,
  running: false,
  doneAt: new Map<string, number>(),
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

// Errors come back as "<step key>: <message>"; show them by the step's name.
const failuresOf = (errors: string[], labels: Map<string, string>) =>
  errors.map((e) => {
    const i = e.indexOf(": ");
    const key = i > 0 ? e.slice(0, i) : "";
    return { label: labels.get(key) ?? key ?? "Pull", error: i > 0 ? e.slice(i + 2) : e };
  });

async function runJob(clientId: string | null, verifyHref: string, refresh: () => void) {
  const scope = clientId ?? "fleet";
  job.running = true;
  job.scope = scope;
  const started = Date.now();
  const labels = new Map<string, string>([["snapshots", "Client list"]]);
  let failures: Failure[] = [];
  let done = 0;
  try {
    let plan = await planPullAction(clientId);
    if ("verify" in plan) return window.location.assign(verifyHref);
    // The very first pull: the client list alone, then everything else can be planned.
    if (plan.steps.length === 1 && plan.steps[0].key === "snapshots") {
      job.set({ phase: "pulling", done: 0, total: 1, current: ["Client list"], failures, started });
      const first = await pullBatchAction(["snapshots"]);
      if ("verify" in first) return window.location.assign(verifyHref);
      failures = failuresOf(first.errors, labels);
      plan = await planPullAction(clientId);
      if ("verify" in plan) return window.location.assign(verifyHref);
      done = 1;
    }
    for (const s of plan.steps) labels.set(s.key, s.label);
    const steps = plan.steps;
    const total = steps.length + done;
    if (total === 0) {
      job.set({ phase: "idle" });
    } else {
      for (let i = 0; i < steps.length; i += BATCH) {
        const batch = steps.slice(i, i + BATCH);
        job.set({ phase: "pulling", done, total, current: batch.map((s) => s.label), failures, started });
        const result = await pullBatchAction(batch.map((s) => s.key));
        if ("verify" in result) return window.location.assign(verifyHref);
        failures = [...failures, ...failuresOf(result.errors, labels)];
        done += batch.length;
      }
      job.set({ phase: "finished", total, failures, seconds: Math.round((Date.now() - started) / 1000) });
      refresh();
    }
    job.doneAt.set(scope, Date.now());
    markDone(scope);
  } catch {
    job.set({ phase: "finished", total: done, failures: [...failures, { label: "Pull", error: "stopped unexpectedly; reload to try again" }], seconds: 0 });
  } finally {
    job.running = false;
  }
}

// Pulls what's new from CallAnchor a batch at a time, with a progress bar and percentage, then
// refreshes the page from the store (owner, 2026-11-13). Fleet pages pull every client; a client's
// pages pull only that client. The page underneath already shows the stored data.
export function PullProgress({ verifyHref }: { verifyHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const clientId = pathname.startsWith(`${BASE}/clients/`) ? decodeURIComponent(pathname.split("/")[5] ?? "") || null : null;
  const scope = clientId ?? "fleet";
  const state = useSyncExternalStore(subscribe, () => job.state, () => job.state);
  const [, setTick] = useState(0);

  useEffect(() => {
    // A running job carries on, whatever page it was started from; a fleet pull covers every client.
    if (job.running) return;
    const stored = readDone();
    const recent = (s: string) => Date.now() - Math.max(job.doneAt.get(s) ?? 0, stored[s] ?? 0) < COOLDOWN_MS;
    if (recent(scope) || recent("fleet")) return;
    void runJob(clientId, verifyHref, () => router.refresh()).then(() => setTick((t) => t + 1));
  }, [scope, clientId, verifyHref, router]);

  // The "finished" line fades after a few seconds unless something failed.
  useEffect(() => {
    if (state.phase !== "finished" || state.failures.length) return;
    const t = setTimeout(() => job.set({ phase: "idle" }), 6000);
    return () => clearTimeout(t);
  }, [state]);

  if (state.phase === "idle") return null;
  if (state.phase === "finished") {
    const failed = state.failures.length;
    return (
      <div role="status" className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${failed ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        <div className="flex items-center justify-between gap-3">
          <p>
            {failed
              ? `Pulled ${state.total} streams in ${state.seconds}s; ${failed} failed and will be retried on the next pull.`
              : `Up to date: pulled ${state.total} stream${state.total === 1 ? "" : "s"} from CallAnchor in ${state.seconds}s.`}
          </p>
          {failed > 0 && (
            <button type="button" onClick={() => job.set({ phase: "idle" })} className="text-xs font-medium text-amber-800 hover:underline">
              Dismiss
            </button>
          )}
        </div>
        {failed > 0 && <FailureList failures={state.failures} />}
      </div>
    );
  }
  const percent = Math.round((state.done / Math.max(1, state.total)) * 100);
  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium text-slate-800">
          Pulling the latest from CallAnchor · {state.done} of {state.total} streams
        </p>
        <p className="font-semibold tabular-nums text-indigo-700">{percent}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-50">
        <div className="h-2 rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-500">
        Now: {state.current.join(", ")}
      </p>
      {state.failures.length > 0 && <FailureList failures={state.failures} live />}
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
