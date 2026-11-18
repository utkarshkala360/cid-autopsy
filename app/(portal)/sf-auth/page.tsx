import type { Metadata } from "next";
import { SfAuth } from "./sf-auth";

export const metadata: Metadata = { title: "Salesforce Auth" };

// Public: outside the proxy matcher, no portal login. Nothing here is stored server-side.
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Salesforce authorization</h1>
      <p className="mt-1 text-sm text-slate-600">
        Get a refresh token for your Connected App in one pass. Nothing you enter is saved.
      </p>
      <SfAuth page="/sf-auth" />
    </main>
  );
}
