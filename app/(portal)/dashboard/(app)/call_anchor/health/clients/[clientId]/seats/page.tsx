import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../../../format";

// Seats merged into Licenses (owner, 2026-11-13): old links open this client's unused licenses.
export default async function ClientSeatsPage({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/seats">) {
  redirect(`${clientHref(HEALTH_PATH, (await params).clientId)}/licenses?use=unused`);
}
