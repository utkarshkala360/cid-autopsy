import { requireMember } from "@/lib/auth";
import { showInternal } from "@/lib/callanchor/session";
import { HealthNav } from "./HealthNav";

// Every health page gets the same left menu: the health views first, then the open page's sections
// (audit note 4). Pages still check the CallAnchor session themselves.
export default async function HealthLayout({ children }: LayoutProps<"/dashboard/call_anchor_config/health">) {
  const [member, internal] = await Promise.all([requireMember(), showInternal()]);
  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
      <HealthNav isAdmin={member.role === "admin"} showInternal={internal} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
