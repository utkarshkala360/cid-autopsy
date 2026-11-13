import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { clientHref } from "../format";
import { EntityTab } from "../_views/entities";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Issues" };
export const maxDuration = 300;

// The Issues tab: one row per issue or error. Same columns as every entity tab (owner, 2026-11-13). A ?client= link
// opens the client's own Issues tab.
export default async function IssuesTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/issues${moved.rest}`);
  const { profile } = await requireCallAnchorSession(`${HEALTH_PATH}/issues`);
  if (!profile) return <p className="text-sm text-slate-500">CallAnchor can&apos;t be reached right now.</p>;
  return <EntityTab entity="issues" query={query} clientId={null} />;
}
