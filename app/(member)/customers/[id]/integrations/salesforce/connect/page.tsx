import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { customerPath, getCustomer } from "@/lib/customers";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cardClass } from "@/components/ui";
import { ConnectSalesforceForm } from "./ConnectSalesforceForm";

export const metadata: Metadata = { title: "Connect Salesforce" };

export default async function ConnectSalesforcePage({ params }: PageProps<"/customers/[id]/integrations/salesforce/connect">) {
  const [, customer] = await Promise.all([requireMember(), params.then(({ id }) => getCustomer(id))]);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs
        items={[
          { href: "/customers", label: "Customers" },
          { href: customerPath(customer.id), label: customer.name },
          { href: customerPath(customer.id, "integrations", "salesforce"), label: "Salesforce" },
        ]}
      />
      <h1 className="text-xl font-semibold text-slate-900">Connect Salesforce</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect one of {customer.name}&apos;s orgs. The Salesforce CLI logs in to confirm access, then the credential is
        stored encrypted.
      </p>

      <div className={`${cardClass} mt-6 p-6`}>
        <ConnectSalesforceForm customerId={customer.id} />
      </div>
    </div>
  );
}
