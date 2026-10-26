import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CreateCustomerForm } from "./CreateCustomerForm";

export const metadata: Metadata = { title: "Customers" };

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  org_count: number;
  sandbox_count: number;
  error_count: number;
};

export default async function CustomersPage() {
  // The session check and the data load run together; requireMember redirects before anything renders.
  const [, customers] = (await Promise.all([
    requireMember(),
    db()`
      SELECT c.id, c.name, c.created_at,
             count(o.id)::int AS org_count,
             count(o.id) FILTER (WHERE o.is_sandbox)::int AS sandbox_count,
             count(o.id) FILTER (WHERE o.status = 'error')::int AS error_count
      FROM customers c LEFT JOIN salesforce_orgs o ON o.customer_id = c.id
      GROUP BY c.id ORDER BY lower(c.name)
    `,
  ])) as [unknown, CustomerRow[]];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <span className="text-sm text-slate-500">{customers.length} total</span>
        </div>
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Salesforce orgs</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
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
          <p className="mt-1 text-sm text-slate-500">Then connect their Salesforce orgs from the customer page.</p>
          <CreateCustomerForm />
        </div>
      </aside>
    </div>
  );
}
