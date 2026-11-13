import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { PortalError } from "@/lib/callanchor/portal";
import { planPull, runPullStep, type PullStep } from "@/lib/callanchor/store";
import { refreshHealthCache } from "@/lib/callanchor/health";

// Pulling CallAnchor into the store in the background (owner, 2026-11-13: changing pages must not
// wait on pulls). A page asks for a pull; the server plans it, answers at once and runs the steps
// after its response, a few at a time, saving its progress in ca_pull_jobs for pages to poll. Pages
// keep reading the store as it stands. GETs to CallAnchor only, with the member's own session.

const BATCH = 4;
// Renewed every batch. A job cut off by the function's time limit frees its scope this soon after.
const LEASE_SECONDS = 120;
// No new batch after this, inside the route's 300 s; what's left is pulled on the next visit.
const BUDGET_MS = 240_000;

export type PullFailure = { label: string; error: string };
export type PullStatus = {
  scope: string;
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  done: number;
  current: string | null;
  failures: PullFailure[];
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

// The job a scope's pages follow: a running fleet job covers every client.
export async function readPullJob(clientId: string | null): Promise<PullStatus | null> {
  const scope = clientId ?? "fleet";
  const rows = await db()`
    SELECT scope, started_at, finished_at, total, done, current, failures, coalesce(lease_until > now(), false) AS running
    FROM ca_pull_jobs WHERE scope IN (${scope}, 'fleet')`;
  const r = rows.find((x) => x.scope === "fleet" && x.running) ?? rows.find((x) => x.scope === scope);
  if (!r) return null;
  return {
    scope: r.scope,
    running: r.running === true,
    startedAt: iso(r.started_at)!,
    finishedAt: iso(r.finished_at),
    total: r.total,
    done: r.done,
    current: r.current,
    failures: typeof r.failures === "string" ? JSON.parse(r.failures) : (r.failures ?? []),
  };
}

// Starts a pull unless one is running for the scope (or the fleet) or nothing is due.
export async function startPullJob(cookie: string, clientId: string | null): Promise<"started" | "running" | "nothing"> {
  const scope = clientId ?? "fleet";
  const busy = await db()`SELECT 1 FROM ca_pull_jobs WHERE scope IN (${scope}, 'fleet') AND lease_until > now()`;
  if (busy.length) return "running";
  const steps = await planPull(clientId);
  if (steps.length === 0) return "nothing";
  const claimed = await db()`
    INSERT INTO ca_pull_jobs (scope, started_at, finished_at, lease_until, total, done, current, failures)
    VALUES (${scope}, now(), NULL, now() + make_interval(secs => ${LEASE_SECONDS}), ${steps.length}, 0, NULL, '[]'::jsonb)
    ON CONFLICT (scope) DO UPDATE SET started_at = now(), finished_at = NULL, lease_until = EXCLUDED.lease_until,
      total = EXCLUDED.total, done = 0, current = NULL, failures = '[]'::jsonb
    WHERE ca_pull_jobs.lease_until IS NULL OR ca_pull_jobs.lease_until <= now()
    RETURNING scope`;
  if (claimed.length === 0) return "running";
  after(() => runJob(cookie, clientId, scope, steps));
  return "started";
}

async function runJob(cookie: string, clientId: string | null, scope: string, planned: PullStep[]) {
  const started = Date.now();
  const labels = new Map<string, string>([["snapshots", "Client list"]]);
  const failures: PullFailure[] = [];
  let total = planned.length;
  let done = 0;
  const save = (current: string | null, finished = false) => db()`
    UPDATE ca_pull_jobs SET done = ${done}, total = ${total}, current = ${current}, failures = ${JSON.stringify(failures)}::jsonb,
      lease_until = CASE WHEN ${finished}::boolean THEN NULL ELSE now() + make_interval(secs => ${LEASE_SECONDS}) END,
      finished_at = CASE WHEN ${finished}::boolean THEN now() ELSE NULL END
    WHERE scope = ${scope}`;
  // Errors come back as "<step key>: <message>"; keep them by the step's name.
  const record = (errors: (string | null)[]) => {
    for (const e of errors) {
      if (!e) continue;
      const i = e.indexOf(": ");
      const key = i > 0 ? e.slice(0, i) : "";
      failures.push({ label: labels.get(key) ?? (key || "Pull"), error: i > 0 ? e.slice(i + 2) : e });
    }
  };
  const run = async (batch: PullStep[]) => {
    for (const s of batch) labels.set(s.key, s.label);
    await save(batch.map((s) => s.label).join(", "));
    record(await Promise.all(batch.map((s) => runPullStep(cookie, s.key))));
    done += batch.length;
  };

  try {
    let steps = planned;
    // The very first pull: the client list alone, then everything else can be planned.
    if (steps.length === 1 && steps[0].key === "snapshots") {
      await run(steps);
      steps = await planPull(clientId);
      total = done + steps.length;
    }
    for (let i = 0; i < steps.length; i += BATCH) {
      if (Date.now() - started > BUDGET_MS) {
        failures.push({ label: "Pull", error: `stopped at the time limit; ${steps.length - i} streams are pulled on the next visit` });
        break;
      }
      await run(steps.slice(i, i + BATCH));
    }
  } catch (error) {
    failures.push({
      label: "Pull",
      error: error instanceof PortalError && error.rejected ? "CallAnchor sign-in expired: verify again to keep pulling" : "stopped unexpectedly; the next visit tries again",
    });
    if (!(error instanceof PortalError)) console.error("[pull] background job failed", error);
  } finally {
    if (done > 0) refreshHealthCache();
    await save(null, true).catch((error) => console.error("[pull] couldn't save the job's end", error));
  }
}
