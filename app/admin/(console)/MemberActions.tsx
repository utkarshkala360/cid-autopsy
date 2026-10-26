"use client";

import { useActionState, useState } from "react";
import {
  deleteMemberAction,
  resetMemberPasswordAction,
  setMemberActiveAction,
} from "@/app/admin/actions";
import { FormMessage } from "@/components/FormMessage";
import { dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type Props = { id: string; username: string; isActive: boolean };

export function MemberActions({ id, username, isActive }: Props) {
  const [resetting, setResetting] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetMemberPasswordAction, undefined);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={setMemberActiveAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={String(!isActive)} />
          <button type="submit" className={secondaryButtonClass}>{isActive ? "Disable" : "Enable"}</button>
        </form>
        <button type="button" className={secondaryButtonClass} onClick={() => setResetting((v) => !v)}>
          Reset password
        </button>
        <form
          action={deleteMemberAction}
          onSubmit={(e) => {
            if (!confirm(`Delete ${username}? This cannot be undone.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={dangerButtonClass}>Delete</button>
        </form>
      </div>
      {resetting && (
        <form action={resetAction} className="flex w-full max-w-xs flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="New password (min 10 chars)"
            autoComplete="new-password"
            className={inputClass}
          />
          <button type="submit" disabled={resetPending} className={secondaryButtonClass}>
            {resetPending ? "Saving…" : "Set password"}
          </button>
          <FormMessage state={resetState} />
        </form>
      )}
    </div>
  );
}
