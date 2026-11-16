import type { Metadata } from "next";
import { EntityTab } from "../../../_views/entities";

export const metadata: Metadata = { title: "Licenses" };
export const maxDuration = 300;

// One client's Licenses tab: the fleet Licenses table scoped to this client (owner, 2026-11-13).
export default async function ClientLicensesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  return <EntityTab entity="licenses" query={query} clientId={clientId} />;
}
