import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientViews } from "../../../parts";

// A client's calls are listed on its Calls & logs tab.
export default async function ClientCallsIndex({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/calls">) {
  redirect(clientViews(HEALTH_PATH, (await params).clientId).items);
}
