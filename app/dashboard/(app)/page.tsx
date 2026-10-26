import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { SUB_APPS } from "@/lib/sub-apps";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardHomePage() {
  const member = await requireMember();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Welcome, {member.fullName}</h1>
      <p className="mt-1 text-sm text-slate-500">Choose an app to get started.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUB_APPS.map((app) => (
          <Link
            key={app.slug}
            href={`/dashboard/${app.slug}`}
            className={`${cardClass} block p-5 transition hover:border-indigo-300 hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{app.name}</h2>
              {app.status === "coming-soon" && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-500">{app.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
