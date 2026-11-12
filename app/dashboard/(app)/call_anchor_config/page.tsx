import type { Metadata } from "next";
import Link from "next/link";
import { APIS_PATH, HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "CallAnchor Config" };

export default async function CallAnchorConfigPage() {
  const { member, profile } = await requireCallAnchorSession();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">CallAnchor Config</h1>
      <p className="mt-1 text-sm text-slate-500">
        {profile ? `Signed in to CallAnchor as ${profile.name}.` : "CallAnchor can't be reached right now."}
      </p>
      <Link href={HEALTH_PATH} className={`${cardClass} mt-6 block p-6 transition hover:border-indigo-300`}>
        <h2 className="text-base font-semibold text-slate-900">Client health</h2>
        <p className="mt-1 text-sm text-slate-500">
          Recordings, CRM syncs and errors for every client, and a full breakdown per client.
        </p>
      </Link>
      {member.role === "admin" && (
        <Link href={APIS_PATH} className={`${cardClass} mt-4 block p-6 transition hover:border-indigo-300`}>
          <h2 className="text-base font-semibold text-slate-900">API console</h2>
          <p className="mt-1 text-sm text-slate-500">Browse CallAnchor&apos;s APIs and run them live.</p>
        </Link>
      )}
    </div>
  );
}
