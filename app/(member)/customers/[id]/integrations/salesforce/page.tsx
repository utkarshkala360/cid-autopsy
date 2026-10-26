import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { customerPath, getCustomer } from "@/lib/customers";
import { listOrgs } from "@/lib/salesforce/orgs";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FormMessage } from "@/components/FormMessage";
import { SalesforceOrgTable } from "@/components/SalesforceOrgTable";
import { primaryButtonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Salesforce" };

export default async function CustomerSalesforcePage({
  params,
  searchParams,
}: PageProps<"/customers/[id]/integrations/salesforce">) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  // The session check and the data load run together; requireMember redirects before anything renders.
  const [, customer, orgs, { connected, error }] = await Promise.all([
    requireMember(),
    getCustomer(id),
    listOrgs(id),
    searchParams,
  ]);
  if (!customer) notFound();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs
            items={[
              { href: "/customers", label: "Customers" },
              { href: customerPath(customer.id), label: customer.name },
            ]}
          />
          <h1 className="text-xl font-semibold text-slate-900">Salesforce</h1>
        </div>
        <Link href={customerPath(customer.id, "integrations", "salesforce", "connect")} className={primaryButtonClass}>
          + Connect Salesforce
        </Link>
      </div>

      {(typeof connected === "string" || typeof error === "string") && (
        <div className="mb-4">
          <FormMessage
            state={
              typeof error === "string"
                ? { error: error.slice(0, 300) }
                : { success: `Connected “${String(connected).slice(0, 80)}”. Salesforce CLI verified the login.` }
            }
          />
        </div>
      )}

      <SalesforceOrgTable
        customerId={customer.id}
        orgs={orgs}
        emptyMessage={`No orgs connected for ${customer.name} yet. Connect their production org and any sandboxes.`}
      />
    </div>
  );
}
