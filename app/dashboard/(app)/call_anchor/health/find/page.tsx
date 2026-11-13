import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { findById, readSnapshots } from "@/lib/callanchor/store";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { callHref, clientHref, formatTime, licenseHref } from "../format";
import { Table, rowLinkClass, td } from "../parts";

export const metadata: Metadata = { title: "Find by ID" };

// Any id from a call's journey opens that call: CallAnchor's call id, a CRM request, an upload
// session, recording file, processing job, log line or correlation id. A license id opens the phone.
// One match goes straight to it.

const ID_PATTERN = /^[\w./:-]{3,300}$/;

export default async function FindPage({ searchParams }: PageProps<"/dashboard/call_anchor/health/find">) {
  const query = await searchParams;
  const id = typeof query.id === "string" ? query.id.trim() : "";
  await requireCallAnchorSession(`${HEALTH_PATH}/find${id ? `?id=${encodeURIComponent(id)}` : ""}`);
  const valid = ID_PATTERN.test(id);
  const matches = valid ? await findById(id) : [];
  if (matches.length === 1) {
    const [m] = matches;
    redirect(m.callId ? callHref(HEALTH_PATH, m.callId, undefined, m.clientId) : licenseHref(HEALTH_PATH, m.licenseId!, m.clientId));
  }
  const clientIds = [...new Set(matches.map((m) => m.clientId).filter((c): c is string => !!c))];
  const names = new Map((await Promise.all(clientIds.map((c) => readSnapshots(c)))).flat().map((s) => [s.clientId, s.companyName ?? s.clientId]));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Find by ID</h1>
      <p className="mt-1 text-sm text-slate-500">
        Paste any id from a call&apos;s journey: CallAnchor&apos;s call id, a CRM request id, an upload session, recording file, processing job,
        log line or correlation id. A phone&apos;s license id opens the phone. The CRM&apos;s own record id isn&apos;t stored, so search with the call or
        request id instead.
      </p>
      <form action={`${HEALTH_PATH}/find`} className="mt-4 flex max-w-xl gap-2">
        <input name="id" defaultValue={id} placeholder="Paste an id" aria-label="Id" className={`${inputClass} font-mono`} autoFocus />
        <button type="submit" className={primaryButtonClass}>Find</button>
      </form>

      {id && !valid && <p className="mt-4 text-sm text-red-700">That doesn&apos;t look like an id. Ids are letters, digits and - _ . / : only.</p>}
      {valid && matches.length === 0 && (
        <p className="mt-4 text-sm text-slate-600">
          Nothing stored matches <span className="font-mono">{id}</span>. CallAnchor keeps logs about 3 days and the store keeps 90, so an older
          call may be gone.
        </p>
      )}
      {matches.length > 1 && (
        <div className="mt-6">
          <Table head={["Found as", "Opens", "Client", "When (IST)"]}>
            {matches.map((m) => (
              <tr key={`${m.callId}|${m.licenseId}`}>
                <td className={td}>{m.kind}</td>
                <td className={`${td} font-mono text-xs`}>
                  {m.callId ? (
                    <Link href={callHref(HEALTH_PATH, m.callId, undefined, m.clientId)} className={rowLinkClass}>Call {m.callId}</Link>
                  ) : (
                    <Link href={licenseHref(HEALTH_PATH, m.licenseId!, m.clientId)} className={rowLinkClass}>Phone {m.licenseId}</Link>
                  )}
                </td>
                <td className={td}>
                  {m.clientId ? <Link href={clientHref(HEALTH_PATH, m.clientId)} className={rowLinkClass}>{names.get(m.clientId) ?? m.clientId}</Link> : "—"}
                </td>
                <td className={`${td} text-xs text-slate-500`}>{m.at ? formatTime(m.at) : "—"}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
