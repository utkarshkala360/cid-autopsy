import Link from "next/link";
import { cardClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className={`${cardClass} w-full max-w-md p-8 text-center`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Internal</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">CID Autopsy</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to continue.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/dashboard" className={primaryButtonClass}>Dashboard</Link>
          <Link href="/admin" className={`${secondaryButtonClass} py-2 text-sm`}>Admin Console</Link>
        </div>
      </div>
    </main>
  );
}
