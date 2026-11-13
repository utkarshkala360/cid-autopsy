import type { Metadata } from "next";
import { IssueView } from "../../_views/issue";

export const metadata: Metadata = { title: "Issue" };

// Fleet-wide issues live here; a client's issue moves under its client.
export default async function IssuePage({ params }: PageProps<"/dashboard/call_anchor/health/issues/[issueId]">) {
  return <IssueView issueId={(await params).issueId} clientId={null} />;
}
