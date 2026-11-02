import type { Metadata } from "next";
import { operations } from "@/lib/callanchor/contract";
import { callPortal } from "@/lib/callanchor/portal";
import { APIS_PATH, requireCallAnchorSession, storedCookie } from "@/lib/callanchor/session";
import { ApiConsole } from "./ApiConsole";

export const metadata: Metadata = { title: "CallAnchor APIs" };

// Fills the client picker. The console still works by pasting an id if this fails.
async function loadClients(memberId: string) {
  try {
    const cookie = await storedCookie(memberId);
    if (!cookie) return [];
    const { status, text } = await callPortal(cookie, "GET", "/api/clients");
    if (status !== 200) return [];
    return (JSON.parse(text) as { id: string; companyName: string }[]).map(({ id, companyName }) => ({ id, companyName }));
  } catch {
    return [];
  }
}

export default async function CallAnchorApisPage() {
  const { member, profile } = await requireCallAnchorSession(APIS_PATH);
  const clients = await loadClients(member.id);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">CallAnchor APIs</h1>
      <p className="mt-1 text-sm text-slate-500">
        {profile
          ? `Requests run live on production as ${profile.name}. Responses contain customer data.`
          : "CallAnchor can't be reached right now."}
      </p>
      <ApiConsole
        operations={operations.map(({ id, method, path, tag, summary, safety, verified, params }) => ({
          id, method, path, tag, summary, safety, verified, params,
        }))}
        clients={clients}
      />
    </div>
  );
}
