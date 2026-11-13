import { notFound } from "next/navigation";
import { readSnapshots } from "@/lib/callanchor/store";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { clientHref } from "../../format";
import { ClientTabs, SectionsFrame } from "../../HealthNav";

const ID_PATTERN = /^[\w-]{1,100}$/;

// Everything about one client sits under /health/clients/<client>: its health, licenses (and each
// phone), seats, calls & logs, calls and issues. This frame names the client once and gives it its own
// tabs, under the health tabs and the breadcrumb (owner, 2026-11-13). Pages still check the session.
export default async function ClientLayout({ children, params }: LayoutProps<"/dashboard/call_anchor/health/clients/[clientId]">) {
  const { clientId } = await params;
  if (!ID_PATTERN.test(clientId)) notFound();
  const [snapshot] = await readSnapshots(clientId);
  if (!snapshot) notFound();
  return (
    <>
      <div className="mb-5 border-b border-slate-200">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-slate-900">{snapshot.companyName ?? clientId}</h1>
          <span className="text-sm text-slate-500">{snapshot.status ?? "unknown status"}</span>
        </div>
        <ClientTabs root={clientHref(HEALTH_PATH, clientId)} />
      </div>
      <SectionsFrame>{children}</SectionsFrame>
    </>
  );
}
