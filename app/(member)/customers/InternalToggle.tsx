"use client";

import { setCustomerInternalAction } from "./actions";

// A CallAnchor customer's Internal tick box. Saves on change.
export function InternalToggle({ id, internal, label = false }: { id: string; internal: boolean; label?: boolean }) {
  return (
    <form action={setCustomerInternalAction}>
      <input type="hidden" name="id" value={id} />
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="internal"
          value="1"
          defaultChecked={internal}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          aria-label="Internal: hide from client health"
        />
        {label && "Internal (hidden from client health)"}
      </label>
    </form>
  );
}
