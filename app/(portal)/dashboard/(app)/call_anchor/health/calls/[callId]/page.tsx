import type { Metadata } from "next";
import { CallView } from "../../_views/call";

export const metadata: Metadata = { title: "Call journey" };

// A call opened by id alone: the view moves to /health/clients/<client>/calls/<call> once it knows
// the call's client.
export default async function CallPage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/calls/[callId]">) {
  const [{ callId }, query] = await Promise.all([params, searchParams]);
  return <CallView callId={callId} clientId={null} query={query} />;
}
