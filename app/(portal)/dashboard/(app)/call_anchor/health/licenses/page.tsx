import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { clientHref } from "../format";
import { EntityTab } from "../_views/entities";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Licenses" };
export const maxDuration = 300;

// The Licenses tab: one row per license, across clients. Same columns as every entity tab (owner, 2026-11-13). A ?client= link
// opens the client's own Licenses tab.
export default async function LicensesTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/licenses${moved.rest}`);
  // Before the entity tabs, license health was ?status=.
  if (typeof query.status === "string" && !query.health) {
    const { status, ...rest } = query;
    const params = new URLSearchParams(Object.entries({ ...rest, health: status }).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`${HEALTH_PATH}/licenses?${params}`);
  }
  const { profile } = await requireCallAnchorSession(`${HEALTH_PATH}/licenses`);
  if (!profile) return <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>;
  return <EntityTab entity="licenses" query={query} clientId={null} />;
}
