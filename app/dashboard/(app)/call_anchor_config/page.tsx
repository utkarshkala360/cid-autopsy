import type { Metadata } from "next";
import { requireCallAnchorSession } from "@/lib/callanchor/session";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "CallAnchor Config" };

export default async function CallAnchorConfigPage() {
  const { profile } = await requireCallAnchorSession();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">CallAnchor Config</h1>
      <p className="mt-1 text-sm text-slate-500">
        {profile ? `Signed in to CallAnchor as ${profile.name}.` : "CallAnchor can't be reached right now."}
      </p>
      <div className={`${cardClass} mt-6 p-10 text-center`}>
        <p className="text-sm text-slate-500">This app hasn&apos;t been set up yet.</p>
      </div>
    </div>
  );
}
