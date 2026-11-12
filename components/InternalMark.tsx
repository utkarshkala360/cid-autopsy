"use client";

import { useFormStatus } from "react-dom";

// A CallAnchor client's Internal or External status, as a coloured tag, with the admin's button to
// change it. Every change is confirmed first, since it hides or shows the client for everyone
// (owner, 2026-11-12). Used on Customers and on the client's health page.

const TAG = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";
const STATUS = {
  internal: { label: "Internal", className: `${TAG} bg-amber-50 text-amber-800 ring-amber-300` },
  external: { label: "External", className: `${TAG} bg-emerald-50 text-emerald-700 ring-emerald-200` },
};
const BUTTON = "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium transition disabled:opacity-60";
const ACTION = {
  // Shown on an external client: moving it to internal hides it, so it reads as a caution.
  toInternal: { label: "Mark as Internal", className: `${BUTTON} border-amber-400 bg-white text-amber-800 hover:bg-amber-50` },
  toExternal: { label: "Mark as External", className: `${BUTTON} border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-50` },
};

function ActionButton({ internal }: { internal: boolean }) {
  const { pending } = useFormStatus();
  const action = internal ? ACTION.toExternal : ACTION.toInternal;
  return (
    <button type="submit" disabled={pending} className={action.className}>
      {pending ? "Saving…" : action.label}
    </button>
  );
}

export function InternalMark({
  name,
  internal,
  canEdit,
  action,
  fields,
}: {
  name: string;
  internal: boolean;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
  // Hidden inputs that name the client to the action.
  fields: Record<string, string>;
}) {
  const status = internal ? STATUS.internal : STATUS.external;
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span className={status.className}>{status.label}</span>
      {canEdit && (
        <form
          action={action}
          onSubmit={(e) => {
            const message = internal
              ? `Mark ${name} as External?\n\nIts calls, licenses and seats will show on the client health pages for everyone again.`
              : `Mark ${name} as Internal?\n\nIts calls, licenses and seats will be hidden from the client health pages for everyone, unless "Show internal clients" is ticked.`;
            if (!confirm(message)) e.preventDefault();
          }}
        >
          {Object.entries(fields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="internal" value={internal ? "0" : "1"} />
          <ActionButton internal={internal} />
        </form>
      )}
    </div>
  );
}
