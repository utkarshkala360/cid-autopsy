import type { Metadata } from "next";
import { LicensesView } from "../../../_views/licenses";

export const metadata: Metadata = { title: "Licenses" };

export default async function ClientLicensesPage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/licenses">) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  return <LicensesView query={query} clientId={clientId} />;
}
