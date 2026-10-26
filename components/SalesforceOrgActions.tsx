"use client";

import {
  disconnectSalesforceOrgAction,
  verifySalesforceOrgAction,
} from "@/app/(member)/customers/[id]/integrations/salesforce/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { dangerButtonClass, secondaryButtonClass } from "@/components/ui";

export function SalesforceOrgActions({ id, customerId, label }: { id: string; customerId: string; label: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <form action={verifySalesforceOrgAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="customerId" value={customerId} />
        <SubmitButton className={secondaryButtonClass} pendingLabel="Testing…">Test</SubmitButton>
      </form>
      <form
        action={disconnectSalesforceOrgAction}
        onSubmit={(e) => {
          if (!confirm(`Disconnect ${label}? Its stored credentials will be deleted.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="customerId" value={customerId} />
        <SubmitButton className={dangerButtonClass} pendingLabel="Disconnecting…">Disconnect</SubmitButton>
      </form>
    </div>
  );
}
