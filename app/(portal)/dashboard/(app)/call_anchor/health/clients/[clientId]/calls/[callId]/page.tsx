import type { Metadata } from "next";
import { CallView } from "../../../../_views/call";

export const metadata: Metadata = { title: "Call journey" };

export default async function ClientCallPage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/calls/[callId]">) {
  const [{ clientId, callId }, query] = await Promise.all([params, searchParams]);
  return <CallView callId={callId} clientId={clientId} query={query} />;
}
