"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCustomerAction } from "./actions";
import { FormMessage } from "@/components/FormMessage";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";

export function CreateCustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="customer-name" className={labelClass}>Name</label>
        <input id="customer-name" name="name" required maxLength={120} autoComplete="off" className={inputClass} />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
        {pending ? "Creating…" : "Create customer"}
      </button>
    </form>
  );
}
