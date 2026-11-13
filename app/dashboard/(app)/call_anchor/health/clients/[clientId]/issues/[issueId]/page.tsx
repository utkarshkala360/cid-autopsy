import type { Metadata } from "next";
import { IssueView } from "../../../../_views/issue";

export const metadata: Metadata = { title: "Issue" };

export default async function ClientIssuePage({ params }: PageProps<"/dashboard/call_anchor/health/clients/[clientId]/issues/[issueId]">) {
  const { clientId, issueId } = await params;
  return <IssueView issueId={issueId} clientId={clientId} />;
}
