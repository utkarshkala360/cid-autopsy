import type { Metadata } from "next";
import { SeatsView } from "../../../_views/seats";

export const metadata: Metadata = { title: "Seats" };

export default async function ClientSeatsPage({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/seats">) {
  return <SeatsView clientId={(await params).clientId} />;
}
