import type { Metadata } from "next";
import { connection } from "next/server";
import { SfAuth } from "../sf-auth/sf-auth";

export const metadata: Metadata = { title: "Connect Salesforce" };

// Public, like /sf-auth, but uses our packaged Connected App: the client only picks the org.
// The Consumer Key is public (it's in the authorize URL anyway); the secret stays on the server.
export default async function Page() {
  await connection(); // read env at request time, not build time
  const clientId = process.env.SF_PACKAGE_CLIENT_ID ?? "";
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Connect Salesforce</h1>
      <p className="mt-1 text-sm text-slate-600">
        Sign in to your org and approve access to get a refresh token. Nothing is saved.
      </p>
      {clientId ? (
        <SfAuth page="/sf-connect" packagedClientId={clientId} />
      ) : (
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          This page isn&apos;t set up yet. Please contact whoever sent you this link.
        </p>
      )}
    </main>
  );
}
