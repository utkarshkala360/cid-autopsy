"use client";

import { useActionState, useState } from "react";
import { finishSalesforceLoginAction, importAuthUrlAction, startSalesforceLoginAction } from "../actions";
import { FormMessage } from "@/components/FormMessage";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// Mirrors "SFDX: Authorize an Org": pick the environment, log in, done.
const ENVIRONMENT_OPTIONS = [
  { value: "production", label: "Production", hint: "Production or Developer org" },
  { value: "sandbox", label: "Sandbox", hint: "Sandbox org" },
  { value: "custom", label: "Custom", hint: "My Domain URL" },
];

const optionClass =
  "flex cursor-pointer flex-col rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50";

export function ConnectSalesforceForm({ customerId }: { customerId: string }) {
  const [started, startAction, starting] = useActionState(startSalesforceLoginAction, undefined);
  const [finished, finishAction, finishing] = useActionState(finishSalesforceLoginAction, undefined);
  const [imported, importAction, importing] = useActionState(importAuthUrlAction, undefined);
  const [environment, setEnvironment] = useState("production");
  const [restart, setRestart] = useState<string | undefined>();

  // Step 2, once a login session exists (and the member hasn't chosen to start over).
  if (started?.authorizeUrl && started.session && restart !== started.session) {
    return (
      <form action={finishAction} className="space-y-5">
        <input type="hidden" name="session" value={started.session} />
        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <a href={started.authorizeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 hover:underline">
              Open the Salesforce login ↗
            </a>{" "}
            and sign in to the org. Click <strong>Allow</strong> when Salesforce CLI asks for access.
          </li>
          <li>
            That tab then shows <em>“This site can’t be reached”</em> at <code className="rounded bg-slate-100 px-1">localhost:1717</code>.
            That&apos;s expected. Copy the full address from its address bar and paste it below.
          </li>
        </ol>
        <div>
          <label htmlFor="redirectUrl" className={labelClass}>Address from the login tab</label>
          <input
            id="redirectUrl"
            name="redirectUrl"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="http://localhost:1717/OauthRedirect?code=…"
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
        <FormMessage state={finished} />
        <div className="flex gap-3">
          <button type="submit" disabled={finishing} className={`${primaryButtonClass} flex-1`}>
            {finishing ? "Connecting with Salesforce CLI…" : "Finish connecting"}
          </button>
          <button type="button" onClick={() => setRestart(started.session)} className={secondaryButtonClass}>
            Start over
          </button>
        </div>
        <p className="text-xs text-slate-500">The login link expires in 10 minutes.</p>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <form action={startAction} className="space-y-5">
        <input type="hidden" name="customerId" value={customerId} />
        <fieldset>
          <legend className={labelClass}>Environment</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ENVIRONMENT_OPTIONS.map((o) => (
              <label key={o.value} className={optionClass}>
                <input
                  type="radio"
                  name="environment"
                  value={o.value}
                  checked={environment === o.value}
                  onChange={() => setEnvironment(o.value)}
                  className="sr-only"
                />
                <span className="font-medium text-slate-900">{o.label}</span>
                <span className="text-slate-500">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {environment === "custom" && (
          <div>
            <label htmlFor="customUrl" className={labelClass}>My Domain URL</label>
            <input
              id="customUrl"
              name="customUrl"
              required
              placeholder="https://acme--uat.sandbox.my.salesforce.com"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />
          </div>
        )}
        <div>
          <label htmlFor="label" className={labelClass}>Name (optional)</label>
          <input id="label" name="label" maxLength={80} placeholder="Defaults to Production / Sandbox" className={inputClass} />
        </div>
        <FormMessage state={started?.error ? { error: started.error } : undefined} />
        <button type="submit" disabled={starting} className={`${primaryButtonClass} w-full`}>
          {starting ? "Starting…" : "Log in to Salesforce"}
        </button>
      </form>

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">Already authorized in VS Code?</summary>
        <form action={importAction} className="mt-3 space-y-3">
          <input type="hidden" name="customerId" value={customerId} />
          <p className="text-xs text-slate-500">
            Run <code className="rounded bg-slate-100 px-1">sf org auth show-sfdx-auth-url --target-org &lt;alias&gt;</code> and paste the URL.
          </p>
          <textarea
            name="authUrl"
            required
            rows={2}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="force://PlatformCLI::5Aep…@acme.my.salesforce.com"
            className={`${inputClass} font-mono text-xs`}
          />
          <FormMessage state={imported} />
          <button type="submit" disabled={importing} className={secondaryButtonClass}>
            {importing ? "Verifying…" : "Import"}
          </button>
        </form>
      </details>
    </div>
  );
}
