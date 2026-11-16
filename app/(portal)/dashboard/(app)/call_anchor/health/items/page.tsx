import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { ItemsView } from "../_views/items";
import { clientHref } from "../format";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Calls & logs" };

// Items across every client. One client's items live under it, so a ?client= link moves there.
export default async function HealthItemsPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/items">) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/items${moved.rest}`);
  return <ItemsView query={query} clientId={null} />;
}
