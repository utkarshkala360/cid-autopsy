import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";

// The list of clients is the Clients tab.
export default function ClientsIndex() {
  redirect(HEALTH_PATH);
}
