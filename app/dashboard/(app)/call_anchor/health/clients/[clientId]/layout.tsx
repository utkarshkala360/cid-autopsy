import { notFound } from "next/navigation";
import { loadClientSummary } from "@/lib/callanchor/health";
import { readSnapshots } from "@/lib/callanchor/store";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { ago, clientHref, int, pct } from "../../format";
import { ClientTabs, SectionsFrame } from "../../HealthNav";
import { Hero, HeroPill, StatCell, StatStrip } from "../../ui";

const ID_PATTERN = /^[\w-]{1,100}$/;
const LEVEL_PILL = { critical: ["red", "Critical"], warning: ["amber", "Warning"], healthy: ["green", "Healthy"], idle: ["slate", "Idle"], unknown: ["slate", "Unknown"] } as const;

// Everything about one client sits under /health/clients/<client>: its health, licenses (and each
// phone), seats, calls & logs, calls and issues. This frame names the client once, with its key numbers
// and its own tabs, under the health tabs and the breadcrumb (owner, 2026-11-13). Pages still check
// the session. Before the client's first pull there are no numbers yet, and the frame says so.
export default async function ClientLayout({ children, params }: LayoutProps<"/dashboard/call_anchor/health/clients/[clientId]">) {
  const { clientId } = await params;
  if (!ID_PATTERN.test(clientId)) notFound();
  const [[snapshot], summary] = await Promise.all([readSnapshots(clientId), loadClientSummary(clientId)]);
  const root = clientHref(HEALTH_PATH, clientId);
  const now = summary ? Date.parse(summary.loadedAt) : 0;
  const pill = summary ? LEVEL_PILL[summary.level] : null;
  const reach = summary?.reached.share ?? null;
  const unused = summary ? summary.seats.idle + summary.seats.loggedOut + summary.seats.unassigned : 0;
  const needs = summary ? summary.licenses.critical + summary.licenses.warning : 0;

  return (
    <>
      <Hero
        back={{ href: HEALTH_PATH, label: "Back to Clients" }}
        eyebrow={{ icon: "building", label: "Client account" }}
        title={snapshot?.companyName ?? "Client"}
        badge={pill && <HeroPill tone={pill[0]}>{pill[1]}</HeroPill>}
        meta={
          <>
            {snapshot?.status ?? "Not pulled yet"}
            {summary && (
              <>
                {" · "}
                {summary.hasIntegration ? "CRM integration on" : "No CRM integration"}
                {" · last call through "}
                {summary.lastComplete ? ago(summary.lastComplete.at, now) : "never"}
              </>
            )}
          </>
        }
        kpis={
          summary
            ? [
                { label: "Reached CRM, 24h", value: pct(reach), bar: reach, note: summary.reached.due ? `${int(summary.reached.delivered)} of ${int(summary.reached.due)} due` : "nothing due" },
                { label: "Calls, 24h", value: int(summary.calls24h) },
              ]
            : []
        }
      >
        {summary ? (
          <StatStrip attached>
            <StatCell
              icon="alert"
              tone={summary.criticalIssues ? "red" : summary.openIssues ? "amber" : "green"}
              label="Open issues"
              value={int(summary.openIssues)}
              sub={summary.criticalIssues ? `${int(summary.criticalIssues)} critical` : summary.openIssues ? "warnings only" : "nothing needs action"}
              href={`${root}#s-issues`}
            />
            <StatCell
              icon="licenses"
              tone={summary.licenses.critical ? "red" : summary.licenses.warning ? "amber" : "green"}
              label="Licenses"
              value={int(summary.licenses.total)}
              sub={needs ? `${int(needs)} need action` : "all fine"}
              href={`${root}/licenses`}
            />
            <StatCell
              icon="seats"
              tone={unused ? "amber" : "blue"}
              label="Licenses calling"
              value={`${int(summary.seats.calling)} / ${int(summary.seats.active)}`}
              sub={`${summary.seats.purchased !== null ? `${int(summary.seats.purchased)} purchased · ` : ""}${int(unused)} unused`}
              href={`${root}/licenses?use=unused`}
            />
            <StatCell
              icon="activity"
              tone="violet"
              label="Last good CRM sync"
              value={summary.lastSyncAt ? ago(summary.lastSyncAt, now) : "never"}
              sub="any call accepted by the CRM"
              href={`${root}/items?kind=syncs&status=delivered&window=1`}
            />
          </StatStrip>
        ) : (
          <p className="px-6 py-3 text-sm text-slate-500">No stored data for this client yet. Its Health tab pulls it from CallAnchor.</p>
        )}
        <ClientTabs root={root} />
      </Hero>
      <div className="mt-6">
        <SectionsFrame>{children}</SectionsFrame>
      </div>
    </>
  );
}
