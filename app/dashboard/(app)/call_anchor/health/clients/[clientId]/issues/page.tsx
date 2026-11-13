import type { Metadata } from "next";
import { EntityTab } from "../../../_views/entities";

export const metadata: Metadata = { title: "Issues" };
export const maxDuration = 300;

// One client's Issues tab: the fleet Issues table scoped to this client (owner, 2026-11-13).
export default async function ClientIssuesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  return <EntityTab entity="issues" query={query} clientId={clientId} />;
}
