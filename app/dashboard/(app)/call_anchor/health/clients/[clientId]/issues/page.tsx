import { redirect } from "next/navigation";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../../../format";

// A client's issues are listed on its health page.
export default async function ClientIssuesIndex({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/issues">) {
  redirect(`${clientHref(HEALTH_PATH, (await params).clientId)}#s-issues`);
}
