"use client";

import { deleteCustomerAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { dangerButtonClass } from "@/components/ui";

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteCustomerAction}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name} and disconnect all of its Salesforce orgs? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton className={dangerButtonClass} pendingLabel="Deleting…">Delete customer</SubmitButton>
    </form>
  );
}
