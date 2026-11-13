import { notFound, redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../format";

// The client page moved under /health/clients/<client>; old links land there.
export default async function OldClientPage({ params, searchParams }: PageProps<"/dashboard/call_anchor/health/[clientId]">) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  if (!/^[\w-]{1,100}$/.test(clientId)) notFound();
  const rest = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))));
  redirect(`${clientHref(HEALTH_PATH, clientId)}${rest.size ? `?${rest}` : ""}`);
}
