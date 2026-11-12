import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { CreateCustomerForm } from "./CreateCustomerForm";
import { InternalMark } from "@/components/InternalMark";
import { setCustomerInternalAction } from "./actions";

export const metadata: Metadata = { title: "Customers" };

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  product: string | null;
  callanchor_client_id: string | null;
  internal: boolean;
  org_count: number;
  sandbox_count: number;
  error_count: number;
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  // Internal customers (our own test and demo accounts) are hidden unless asked for (owner, 2026-11-12).
  const showInternal = (await searchParams).internal === "1";
  // The session check and the data load run together; requireMember redirects before anything renders.
  const [member, all] = (await Promise.all([
    requireMember(),
    db()`
      SELECT c.id, c.name, c.created_at, c.product, c.callanchor_client_id, coalesce(f.internal, false) AS internal,
             count(o.id)::int AS org_count,
             count(o.id) FILTER (WHERE o.is_sandbox)::int AS sandbox_count,
             count(o.id) FILTER (WHERE o.status = 'error')::int AS error_count
      FROM customers c LEFT JOIN salesforce_orgs o ON o.customer_id = c.id
      LEFT JOIN ca_client_flags f ON f.client_id = c.callanchor_client_id
      GROUP BY c.id, f.internal ORDER BY lower(c.name)
    `,
  ])) as [Awaited<ReturnType<typeof requireMember>>, CustomerRow[]];
  const internalCount = all.filter((c) => c.internal).length;
  const customers = showInternal ? all : all.filter((c) => !c.internal);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link
              href={showInternal ? "/customers" : "/customers?internal=1"}
              role="checkbox"
              aria-checked={showInternal}
              className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900"
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none text-white ${
                  showInternal ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
                }`}
              >
                {showInternal ? "✓" : ""}
              </span>
              Show internal ({internalCount})
            </Link>
            <span>
              {customers.length} shown{!showInternal && internalCount > 0 ? ` · ${internalCount} internal hidden` : ""}
            </span>
          </div>
        </div>
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Internal / External</th>
                <th className="px-4 py-3 font-medium">Salesforce orgs</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No customers yet. Create one to start connecting their Salesforce orgs.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-indigo-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.product ?? <span className="text-slate-400">—</span>}
                    {c.callanchor_client_id && (
                      <Link href={`${HEALTH_PATH}/${c.callanchor_client_id}`} className="block text-xs text-indigo-700 hover:underline">
                        Client health
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.callanchor_client_id ? (
                      <InternalMark name={c.name} internal={c.internal} canEdit={member.role === "admin"} action={setCustomerInternalAction} fields={{ id: c.id }} />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.org_count === 0 ? (
                      <span className="text-slate-400">None</span>
                    ) : (
                      <>
                        {c.org_count - c.sandbox_count} production, {c.sandbox_count} sandbox
                        {c.error_count > 0 && <span className="ml-2 text-red-600">{c.error_count} failing</span>}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className={`${cardClass} p-5`}>
          <h2 className="text-base font-semibold text-slate-900">New customer</h2>
          <p className="mt-1 text-sm text-slate-500">
            Then connect their Salesforce orgs from the customer page. Every client CallAnchor lists is added here on its own, with product
            CallAnchor. Every client starts External; admins mark our own test and demo accounts Internal, which client health then hides
            unless asked.
          </p>
          <CreateCustomerForm />
        </div>
      </aside>
    </div>
  );
}
