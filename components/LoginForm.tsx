"use client";

import { useActionState } from "react";
import type { FormState } from "@/components/form-state";
import { FormMessage } from "@/components/FormMessage";
import { cardClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui";

type Props = {
  title: string;
  subtitle: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

export function LoginForm({ title, subtitle, action }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className={`${cardClass} w-full max-w-sm p-8`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">CID Autopsy</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className={labelClass}>ID</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>
          <FormMessage state={state} />
          <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
