"use client";

import { useActionState, useEffect, useRef } from "react";
import { createMemberAction } from "@/app/(portal)/admin/actions";
import { FormMessage } from "@/components/FormMessage";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { SUB_APPS } from "@/lib/sub-apps";

export function CreateMemberForm() {
  const [state, formAction, pending] = useActionState(createMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="fullName" className={labelClass}>Full name</label>
        <input id="fullName" name="fullName" required maxLength={100} className={inputClass} />
      </div>
      <div>
        <label htmlFor="new-username" className={labelClass}>ID</label>
        <input
          id="new-username"
          name="username"
          required
          maxLength={254}
          placeholder="username or email"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="role" className={labelClass}>Role</label>
        <select id="role" name="role" defaultValue="agent" className={inputClass}>
          <option value="agent">Agent</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="auditor" className="mt-0.5" />
        <span>
          Auditor
          <span className="block text-xs text-slate-500">Can leave notes on any dashboard page for review.</span>
        </span>
      </label>
      <div>
        <label htmlFor="new-email" className={labelClass}>Email <span className="font-normal text-slate-400">(for Board)</span></label>
        <input
          id="new-email"
          name="email"
          type="email"
          maxLength={254}
          placeholder="Not needed when the ID is an email"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <fieldset>
        <legend className={labelClass}>Apps</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {SUB_APPS.map((app) => (
            <label key={app.slug} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={`app_${app.slug}`} defaultChecked={app.slug === "call_anchor"} />
              {app.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="new-password" className={labelClass}>Password</label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
