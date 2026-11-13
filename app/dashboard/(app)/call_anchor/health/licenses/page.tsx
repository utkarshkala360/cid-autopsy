import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { LicensesView } from "../_views/licenses";
import { clientHref } from "../format";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Licenses" };

// Every client's licenses. A ?client= link (from before the hierarchy) opens that client's tab.
export default async function LicensesPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/licenses">) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/licenses${moved.rest}`);
  return <LicensesView query={query} clientId={null} />;
}
