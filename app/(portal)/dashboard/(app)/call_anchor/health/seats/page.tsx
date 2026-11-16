import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../format";
import { withoutClient } from "../_views/query";

// Seats merged into Licenses (owner, 2026-11-13): a seat is a license, so old Seats links open the
// unused licenses.
export default async function SeatsPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/seats">) {
  const moved = withoutClient(await searchParams);
  redirect(moved ? `${clientHref(HEALTH_PATH, moved.client)}/licenses?use=unused` : `${HEALTH_PATH}/licenses?use=unused`);
}
