"use client";

import { useActionState, useState } from "react";
import {
  deleteMemberAction,
  resetMemberPasswordAction,
  setMemberActiveAction,
  setMemberAuditorAction,
  setMemberRoleAction,
} from "@/app/admin/actions";
import { FormMessage } from "@/components/FormMessage";
import { dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type Props = { id: string; username: string; role: string; isActive: boolean; isAuditor: boolean };

export function MemberActions({ id, username, role, isActive, isAuditor }: Props) {
  const [resetting, setResetting] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetMemberPasswordAction, undefined);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={setMemberRoleAction}>
          <input type="hidden" name="id" value={id} />
          <select
            name="role"
            defaultValue={role}
            aria-label={`Role for ${username}`}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={secondaryButtonClass}
          >
            <option value="agent">Agent</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </form>
        <form action={setMemberAuditorAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="auditor" value={String(!isAuditor)} />
          <button type="submit" className={secondaryButtonClass}>
            {isAuditor ? "Remove auditor" : "Make auditor"}
          </button>
        </form>
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
