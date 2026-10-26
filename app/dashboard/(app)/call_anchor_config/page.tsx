import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "CallAnchor Config" };

export default async function CallAnchorConfigPage() {
  await requireMember();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">CallAnchor Config</h1>
      <div className={`${cardClass} mt-6 p-10 text-center`}>
        <p className="text-sm text-slate-500">This app hasn&apos;t been set up yet.</p>
      </div>
    </div>
  );
}
