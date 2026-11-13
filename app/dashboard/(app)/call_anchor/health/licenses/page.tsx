import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../format";
import { withoutClient } from "../_views/query";

// Licenses merged into the Client health page (owner, 2026-11-13); its filters carry over and the
// page opens on the Licenses section. A ?client= link opens that client's Licenses tab.
export default async function LicensesPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/licenses">) {
  const query = await searchParams;
  const moved = withoutClient(query);
  if (moved) redirect(`${clientHref(HEALTH_PATH, moved.client)}/licenses${moved.rest}`);
  const rest = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`${HEALTH_PATH}${rest.size ? `?${rest}` : ""}#s-licenses`);
}
