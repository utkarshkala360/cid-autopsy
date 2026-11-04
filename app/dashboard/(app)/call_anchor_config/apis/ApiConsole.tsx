"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { runApiAction } from "./actions";
import type { Operation } from "@/lib/callanchor/contract";
import { FormMessage } from "@/components/FormMessage";
import { badgeClass, cardClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui";

export type ConsoleOperation = Omit<Operation, "schema" | "paginated">;

const SAFETY_LABEL: Record<Operation["safety"], { text: string; className: string }> = {
  read: { text: "Read", className: "bg-slate-100 text-slate-600" },
  sensitive: { text: "Recording link", className: "bg-amber-50 text-amber-700" },
  write: { text: "Write", className: "bg-red-50 text-red-700" },
  auth: { text: "Login", className: "bg-indigo-50 text-indigo-700" },
};

const DEFAULTS: Record<string, string> = { page: "1", limit: "50" };

function ContractBadge({ contract }: { contract: NonNullable<NonNullable<Awaited<ReturnType<typeof runApiAction>>>["contract"]> }) {
  if (contract.state === "ok") {
    return <span className={`${badgeClass} bg-emerald-50 text-emerald-700`}>Matches contract</span>;
  }
  if (contract.state === "drift") {
    return <span className={`${badgeClass} bg-amber-50 text-amber-700`}>New fields</span>;
  }
  return <span className={`${badgeClass} bg-red-50 text-red-700`}>Contract broken</span>;
}

export function ApiConsole({
  operations,
  clients,
}: {
  operations: ConsoleOperation[];
  clients: { id: string; companyName: string }[];
}) {
  const [selectedId, setSelectedId] = useState("getFleet");
  const [result, runAction, running] = useActionState(runApiAction, undefined);
  const op = operations.find((o) => o.id === selectedId) ?? operations[0];
  const tags = [...new Set(operations.map((o) => o.tag))];
  const shown = result?.opId === op.id ? result : undefined;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label="Operations" className={`${cardClass} self-start p-3`}>
        {tags.map((tag) => (
          <div key={tag} className="mb-3 last:mb-0">
            <p className={`${labelClass} px-2`}>{tag}</p>
            {operations.filter((o) => o.tag === tag).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                aria-current={o.id === op.id}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  o.id === op.id ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {o.id}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="min-w-0 space-y-6">
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{op.summary}</h2>
            <span className={`${badgeClass} ${SAFETY_LABEL[op.safety].className}`}>{SAFETY_LABEL[op.safety].text}</span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {op.method.toUpperCase()} {op.path}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {op.verified === "sample" ? "From a saved sample, not checked live yet." : `Checked live on ${op.verified}.`}
          </p>

          {op.safety === "auth" ? (
            <p className="mt-5 text-sm text-slate-600">
              This places or uses a real OTP call, so it runs from{" "}
              <Link href="/dashboard/call_anchor_config/verify" className="font-medium text-indigo-700 hover:underline">
                Validate OTP
              </Link>
              .
            </p>
          ) : (
            <form key={op.id} action={runAction} className="mt-5 space-y-4">
              <input type="hidden" name="opId" value={op.id} />
              {op.params.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {op.params.map((param) => (
                    <div key={`${param.in}-${param.name}`}>
                      <label htmlFor={param.name} className={labelClass}>
                        {param.name}
                        {param.in === "query" ? " (optional)" : ""}
                      </label>
                      <input
                        id={param.name}
                        name={param.name}
                        required={param.in === "path"}
                        defaultValue={DEFAULTS[param.name]}
                        list={param.name === "clientId" ? "callanchor-clients" : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <datalist id="callanchor-clients">
                {clients.map((c) => (
                  <option key={c.id} value={c.id} label={c.companyName} />
                ))}
              </datalist>
              {op.safety === "write" && (
                <label className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
                  This changes production data for this client.
                </label>
              )}
              {op.safety === "sensitive" && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  This issues a link to a real call recording, valid for 5 minutes. Don&apos;t share it.
                </p>
              )}
              <button type="submit" disabled={running} className={primaryButtonClass}>
                {running ? "Sending…" : "Send request"}
              </button>
            </form>
          )}

          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
            <div>
              <p className={labelClass}>curl</p>
              <pre className="mt-1 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{op.curl}</pre>
              <p className="mt-1 text-xs text-slate-500">
                Set <code className="font-mono">CALLANCHOR_SESSION</code> to your session cookie and each id variable
                before running it.
              </p>
            </div>
            <details key={op.id}>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Sample response (redacted)</summary>
              <pre className="mt-2 max-h-[32rem] overflow-auto rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
                {op.sample}
              </pre>
            </details>
          </div>
        </div>

        {shown?.error && <FormMessage state={{ error: shown.error }} />}

        {shown?.status !== undefined && (
          <div className={`${cardClass} p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-semibold text-slate-900">HTTP {shown.status}</span>
              <span className="text-xs text-slate-500">{shown.durationMs} ms</span>
              {shown.contract && <ContractBadge contract={shown.contract} />}
            </div>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{shown.request}</p>
            {shown.contract && shown.contract.state !== "ok" && (
              <ul className="mt-3 space-y-1 font-mono text-xs text-slate-700">
                {shown.contract.state === "fail" &&
                  shown.contract.errors.map((e) => <li key={e}>Break: {e}</li>)}
                {shown.contract.fields.map((f) => <li key={f}>New field: {f}</li>)}
              </ul>
            )}
            {shown.truncated && <p className="mt-3 text-xs text-amber-700">Response cut off at 2 MB.</p>}
            <pre className="mt-4 max-h-[32rem] overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
              {shown.body}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
