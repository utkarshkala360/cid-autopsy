import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { customerPath, getCustomer } from "@/lib/customers";
import { db } from "@/lib/db";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cardClass } from "@/components/ui";
import { DeleteCustomerButton } from "./DeleteCustomerButton";

export async function generateMetadata({ params }: PageProps<"/customers/[id]">): Promise<Metadata> {
  const [, customer] = await Promise.all([requireMember(), params.then(({ id }) => getCustomer(id))]);
  return { title: customer?.name ?? "Customer" };
}

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  // The session check and the data load run together; requireMember redirects before anything renders.
  const [, customer, [salesforce]] = await Promise.all([
    requireMember(),
    getCustomer(id),
    db()`
      SELECT count(*)::int AS orgs,
             count(*) FILTER (WHERE is_sandbox)::int AS sandboxes,
             count(*) FILTER (WHERE status = 'error')::int AS failing
      FROM salesforce_orgs WHERE customer_id = ${id}
    `,
  ]);
  if (!customer) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={[{ href: "/customers", label: "Customers" }]} />
          <h1 className="text-xl font-semibold text-slate-900">{customer.name}</h1>
        </div>
        <DeleteCustomerButton id={customer.id} name={customer.name} />
      </div>

      <h2 className="text-base font-semibold text-slate-900">Integrations</h2>
      <p className="mt-1 text-sm text-slate-500">Connections to {customer.name}&apos;s systems. Credentials are stored encrypted.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={customerPath(customer.id, "integrations", "salesforce")}
          className={`${cardClass} block p-5 transition hover:border-indigo-300 hover:shadow-md`}
        >
          <h3 className="font-semibold text-slate-900">Salesforce</h3>
          <p className="mt-2 text-sm text-slate-500">Production and sandbox orgs, accessed through the Salesforce CLI.</p>
          <p className="mt-3 text-xs font-medium text-slate-600">
            {salesforce.orgs === 0
              ? "Not connected"
              : `${salesforce.orgs - salesforce.sandboxes} production, ${salesforce.sandboxes} sandbox`}
            {salesforce.failing > 0 && <span className="ml-2 text-red-600">{salesforce.failing} failing</span>}
          </p>
        </Link>
      </div>
    </div>
  );
}
