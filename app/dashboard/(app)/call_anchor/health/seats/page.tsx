import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { SeatsView } from "../_views/seats";
import { clientHref } from "../format";
import { withoutClient } from "../_views/query";

export const metadata: Metadata = { title: "Seats" };

// Every client's seats. A ?client= link (from before the hierarchy) opens that client's tab.
export default async function SeatsPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/seats">) {
  const moved = withoutClient(await searchParams);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/seats`);
  return <SeatsView clientId={null} />;
}
