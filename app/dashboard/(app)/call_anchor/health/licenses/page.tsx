import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadFleetLicenses } from "@/lib/callanchor/health";
import { HEALTH_PATH, requireCallAnchorSession, showInternal } from "@/lib/callanchor/session";
import { clientHref, int } from "../format";
import { Hero } from "../ui";
import { LoadingNote } from "../parts";
import { LicensesPanel, licenseFilters } from "../_views/licenses";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Licenses" };
export const maxDuration = 300;

const PATH = `${HEALTH_PATH}/licenses`;
type Query = Record<string, string | string[] | undefined>;

// The Licenses tab (owner, 2026-11-13): every license, by module (Health & use, Calls & CRM, Device),
// with Health and Use as filters in the left menu. A ?client= link opens that client's Licenses tab.
export default async function LicensesTab({ searchParams }: PageProps<"/dashboard/call_anchor/health/licenses">) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/licenses${moved.rest}`);
  const { href } = licenseFilters(query, PATH);
  const { profile } = await requireCallAnchorSession(href({}));
  return (
    <div>
      {!profile && <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>}
      {profile && (
        <Suspense fallback={<LoadingNote text="Reading every license…" expectMs={20000} />}>
          <Licenses query={query} />
        </Suspense>
      )}
    </div>
  );
}

async function Licenses({ query }: { query: Query }) {
  const { filters, href } = licenseFilters(query, PATH);
  const { licenses, clients, hiddenInternal, unusedAfterMs, loadedAt } = await loadFleetLicenses(await showInternal());
  const calling = licenses.filter((h) => h.seat.state === "calling").length;
  const needs = licenses.filter((h) => h.status === "critical" || h.status === "warning").length;
  return (
    <>
      <Hero
        eyebrow={{ icon: "licenses", label: "Client health" }}
        title="Licenses"
        meta="Every license (seat) across clients by module: its health and use, its calls and CRM syncs, or its device."
        kpis={[
          { label: "Licenses", value: int(licenses.length), note: `${int(needs)} need action` },
          { label: "Calling", value: int(calling), note: `of ${int(licenses.length)}` },
        ]}
      />
      <LicensesPanel
        licenses={licenses}
        clients={clients}
        filters={filters}
        href={href}
        clientId={null}
        now={Date.parse(loadedAt)}
        unusedAfterMs={unusedAfterMs}
        hiddenInternal={hiddenInternal}
      />
    </>
  );
}
