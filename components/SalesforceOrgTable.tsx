import type { SalesforceOrg } from "@/lib/salesforce/orgs";
import { formatDate } from "@/lib/format";
import { badgeClass, cardClass } from "@/components/ui";
import { SalesforceOrgActions } from "@/components/SalesforceOrgActions";

type Props = { customerId: string; orgs: SalesforceOrg[]; emptyMessage: string };

export function SalesforceOrgTable({ customerId, orgs, emptyMessage }: Props) {
  return (
    <div className={`${cardClass} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Org</th>
            <th className="px-4 py-3 font-medium">Environment</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Last checked</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orgs.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-500">{emptyMessage}</td>
            </tr>
          )}
          {orgs.map((o) => (
            <tr key={o.id} className="align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{o.label}</div>
                <div className="break-all text-xs text-slate-500">{o.username}</div>
                <div className="break-all font-mono text-xs text-slate-400">
                  {o.org_id} · {new URL(o.instance_url).host}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`${badgeClass} ${o.is_sandbox ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                  {o.is_sandbox ? "Sandbox" : "Production"}
                </span>
                {o.org_type && <div className="mt-1 text-xs text-slate-500">{o.org_type}</div>}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`${badgeClass} ${o.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                >
                  {o.status === "connected" ? "Connected" : "Error"}
                </span>
                {o.last_error && <div className="mt-1 max-w-xs text-xs text-red-600">{o.last_error}</div>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(o.last_verified_at)}</td>
              <td className="px-4 py-3">
                <SalesforceOrgActions id={o.id} customerId={customerId} label={o.label} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
