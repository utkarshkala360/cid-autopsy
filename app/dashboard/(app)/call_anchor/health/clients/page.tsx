import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { clientHref } from "../format";
import { EntityTab } from "../_views/entities";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Clients" };
export const maxDuration = 300;

// The Clients tab: one row per client. Same columns as every entity tab (owner, 2026-11-13). A ?client= link
// opens the client's own Clients tab.
export default async function ClientsTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/clients${moved.rest}`);
  const { profile } = await requireCallAnchorSession(`${HEALTH_PATH}/clients`);
  if (!profile) return <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>;
  return <EntityTab entity="clients" query={query} clientId={null} />;
}
