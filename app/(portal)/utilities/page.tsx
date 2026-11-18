import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Utilities" };

// Public index of the stand-alone tools (no portal login). Add a tool by adding a row here.
const TOOLS = [
  {
    href: "/sf-connect",
    title: "Connect Salesforce",
    body: "Get a refresh token through our packaged Connected App. The client only picks the environment and Org URL.",
  },
  {
    href: "/sf-auth",
    title: "Salesforce authorization",
    body: "Get a refresh token for any Connected App: the client enters its own Consumer Key and Secret.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Utilities</h1>
      <p className="mt-1 text-sm text-slate-600">Stand-alone tools. Nothing entered in them is saved.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="block h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-600 hover:shadow"
            >
              <span className="font-medium text-slate-900">{t.title}</span>
              <span className="mt-0.5 block font-mono text-xs text-sky-700">{t.href}</span>
              <span className="mt-2 block text-sm text-slate-600">{t.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
