import { Suspense } from "react";
import { requireMember } from "@/lib/auth";
import { HEALTH_PATH, showInternal, verifyUrl } from "@/lib/callanchor/session";
import { readClientNames, readLicenses } from "@/lib/callanchor/store";
import { phoneText } from "@/lib/callanchor/labels";
import { HealthBody, HealthSubBar, HealthTrail } from "./HealthNav";
import { PullProgress } from "./Progress";
import { InstantTips } from "./Tips";

// Every health page gets the same frame (owner, 2026-11-13): the health tabs frozen under the site
// header, a breadcrumb that follows the URL's hierarchy, then the page. A client's pages add its name
// and tabs (clients/[clientId]/layout.tsx); the open page's sections are the left menu, each opening on
// its own. Pages still check the CallAnchor session themselves.
export default async function HealthLayout({ children }: LayoutProps<"/dashboard/call_anchor/health">) {
  const [member, internal, names, licenses] = await Promise.all([requireMember(), showInternal(), readClientNames(), readLicenses()]);
  const phones = Object.fromEntries(licenses.map((l) => [l.licenseId, phoneText(l)]));
  return (
    <>
      <Suspense>
        <HealthSubBar isAdmin={member.role === "admin"} showInternal={internal} />
      </Suspense>
      <Suspense>
        <HealthTrail clients={Object.fromEntries(names)} phones={phones} />
      </Suspense>
      <PullProgress verifyHref={verifyUrl(HEALTH_PATH)} />
      <HealthBody>{children}</HealthBody>
      <InstantTips />
    </>
  );
}
