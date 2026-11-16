import type { Metadata } from "next";
import { ItemsView } from "../../../_views/items";

export const metadata: Metadata = { title: "Calls & logs" };

export default async function ClientItemsPage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/items">) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  return <ItemsView query={query} clientId={clientId} />;
}
