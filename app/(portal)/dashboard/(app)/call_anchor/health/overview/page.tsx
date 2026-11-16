import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";

// Overview merged into the Client health page (owner, 2026-11-13).
export default function OverviewPage() {
  redirect(HEALTH_PATH);
}
