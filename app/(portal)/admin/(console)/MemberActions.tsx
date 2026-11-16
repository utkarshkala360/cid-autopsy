"use client";

import { useActionState, useState } from "react";
import {
  deleteMemberAction,
  resetMemberPasswordAction,
  setMemberActiveAction,
  setMemberAppsAction,
  setMemberAuditorAction,
  setMemberRoleAction,
} from "@/app/(portal)/admin/actions";
import { FormMessage } from "@/components/FormMessage";
import { dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { SUB_APPS } from "@/lib/sub-apps";

type Props = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  isAuditor: boolean;
  apps: string[];
  email: string | null;
};

export function MemberActions({ id, username, role, isActive, isAuditor, apps, email }: Props) {
  const [resetting, setResetting] = useState(false);
  const [editingApps, setEditingApps] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetMemberPasswordAction, undefined);
  const [appsState, appsAction, appsPending] = useActionState(setMemberAppsAction, undefined);

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
        <button type="button" className={secondaryButtonClass} onClick={() => setEditingApps((v) => !v)}>
          Apps
        </button>
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
      {editingApps && (
        <form action={appsAction} className="flex w-full max-w-xs flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SUB_APPS.map((app) => (
              <label key={app.slug} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name={`app_${app.slug}`} defaultChecked={apps.includes(app.slug)} />
                {app.name}
              </label>
            ))}
          </div>
          <input
            name="email"
            type="email"
            defaultValue={email ?? ""}
            maxLength={254}
            placeholder={username.includes("@") ? `Email for Board (default ${username})` : "Email for Board"}
            aria-label={`Email for ${username}`}
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
          />
          <button type="submit" disabled={appsPending} className={secondaryButtonClass}>
            {appsPending ? "Saving…" : "Save access"}
          </button>
          <FormMessage state={appsState} />
        </form>
      )}
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
