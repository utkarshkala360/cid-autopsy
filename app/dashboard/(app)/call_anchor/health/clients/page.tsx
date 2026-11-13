import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadFleetHealth, type Level } from "@/lib/callanchor/health";
import { MODULES, issueModule, type Issue, type IssueModule } from "@/lib/callanchor/issues";
import { PortalError } from "@/lib/callanchor/portal";
import { HEALTH_PATH, requireCallAnchorSession, showInternal, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { FleetTable } from "../FleetTable";
import { Hero } from "../ui";
import { CLIENT_VIEWS, ago, int, pct, type ClientView } from "../format";
import { CoverageNote, LoadingNote } from "../parts";

export const metadata: Metadata = { title: "Clients" };
export const maxDuration = 300;

const PATH = `${HEALTH_PATH}/clients`;
const MODULE_IDS = Object.keys(MODULES) as IssueModule[];

// The Clients tab (owner, 2026-11-13): one row per client, by module (Call journey, Licenses, Issues)
// picked in the left menu, with Health under it counted for that module.
export default async function ClientsTab({ searchParams }: PageProps<"/dashboard/call_anchor/health/clients">) {
  const { profile } = await requireCallAnchorSession(PATH);
  const query = await searchParams;
  return (
    <div>
      {!profile && <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>}
      {profile && (
        <Suspense fallback={<LoadingNote text="Reading the stored data. Only the first read after the server starts waits." expectMs={20000} />}>
          <Clients query={query} />
        </Suspense>
      )}
    </div>
  );
}

// A worst-first level from issues: critical, warning, or none.
const worst = (issues: Issue[]): Level | null =>
  issues.some((i) => i.level === "critical") ? "critical" : issues.some((i) => i.level === "warning") ? "warning" : null;

async function Clients({ query }: { query: Record<string, string | string[] | undefined> }) {
  const { member } = await requireCallAnchorSession(PATH);
  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(PATH));
  let data;
  try {
    data = await loadFleetHealth(cookie, member.id, await showInternal());
  } catch (error) {
    if (error instanceof PortalError && error.rejected) redirect(verifyUrl(PATH));
    console.error("[health] clients failed to load", error);
    return <p className="mt-6 text-sm text-red-700">Couldn&apos;t load the stored health data. Reload to try again.</p>;
  }

  const now = Date.parse(data.loadedAt);
  const { rows, totals } = data;
  const reach = totals.due ? Math.round((totals.reached / totals.due) * 1000) / 10 : null;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const view: ClientView = CLIENT_VIEWS.find((v) => v.id === one(query.view))?.id ?? "journey";
  const health = one(query.health) ?? "all";

  return (
    <>
      <Hero
        eyebrow={{ icon: "building", label: "Client health" }}
        title="Clients"
        meta="Every client by module: its call journey, its licenses, or its issues. Health is judged within the module you pick."
        kpis={[
          { label: "Clients", value: int(totals.clients), note: `${int(totals.inactive)} inactive${data.hiddenInternal ? ` · ${data.hiddenInternal} internal hidden` : ""}` },
          { label: "Reached CRM, 24h", value: pct(reach), bar: reach, note: `${int(totals.reached)} of ${int(totals.due)} due` },
        ]}
      />
      <CoverageNote store={data.store} coverage={data.coverage} pullErrors={data.pullErrors} now={now} tookMs={data.tookMs} />
      <div className="mt-6">
        <FleetTable
          basePath={HEALTH_PATH}
          path={PATH}
          initialView={view}
          initialHealth={health}
          rows={rows.map(({ issues, ...r }) => {
            const open = issues.filter((i) => i.level !== "info" && !i.rolledUp);
            // Health per module (owner, 2026-11-13). Call journey: the issues that break the journey
            // (all but usage), else healthy with calls and idle without. Licenses: the worst license,
            // else healthy with a phone calling and idle without. Issues: the client's overall level.
            const unknown = r.level === "unknown";
            const journey: Level = unknown ? "unknown" : (worst(open.filter((i) => issueModule(i.kind) !== "usage")) ?? (r.calls24h > 0 ? "healthy" : "idle"));
            const licenses: Level = r.licenses.critical ? "critical" : r.licenses.warning ? "warning" : r.licenses.total === 0 ? (unknown ? "unknown" : "idle") : r.seats.calling > 0 ? "healthy" : "idle";
            return {
              ...r,
              internal: data.internal.includes(r.clientId),
              lastActivityLabel: ago(r.lastActivityAt, now),
              lastSyncLabel: r.lastSyncAt ? ago(r.lastSyncAt, now) : "never",
              lastCompleteLabel: r.lastComplete ? ago(r.lastComplete.at, now) : null,
              topIssue: issues.find((i) => i.level !== "info")?.title ?? null,
              issueModules: Object.fromEntries(MODULE_IDS.map((m) => [m, open.filter((i) => issueModule(i.kind) === m).length])) as Record<IssueModule, number>,
              levels: { journey, licenses, issues: r.level },
            };
          })}
        />
      </div>
    </>
  );
}
