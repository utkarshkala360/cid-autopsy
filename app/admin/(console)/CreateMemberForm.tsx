"use client";

import { useActionState, useEffect, useRef } from "react";
import { createMemberAction } from "@/app/admin/actions";
import { FormMessage } from "@/components/FormMessage";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";

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
        </select>
      </div>
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
