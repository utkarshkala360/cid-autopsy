// Server-only: swaps a Salesforce authorization code for tokens. Used by /sf-auth/token and
// /sf-connect/token. Nothing is stored or logged: one call to Salesforce, reply passed back.
import "server-only";
import { isSalesforceHost } from "./hosts";

export const NO_STORE = { "Cache-Control": "no-store" };

export function fail(error: string, error_description: string, status = 400) {
  return Response.json({ error, error_description }, { status, headers: NO_STORE });
}

export type Exchange = {
  host: string;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export async function exchangeCode(x: Exchange): Promise<Response> {
  // Only ever call Salesforce, never a host the caller picks freely.
  if (!isSalesforceHost(x.host)) return fail("invalid_request", "Org URL must be a Salesforce domain.");

  let reply: Response;
  try {
    reply = await fetch(`https://${x.host}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: x.code,
        client_id: x.clientId,
        client_secret: x.clientSecret,
        redirect_uri: x.redirectUri,
        code_verifier: x.codeVerifier,
      }),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return fail("unreachable", `Couldn't reach ${x.host}.`, 502);
  }

  const data = (await reply.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return fail("bad_reply", `Salesforce answered ${reply.status} without JSON.`, 502);
  if (!reply.ok) {
    return fail(
      String(data.error ?? "token_error"),
      String(data.error_description ?? `Salesforce answered ${reply.status}.`),
      reply.status,
    );
  }

  const pick = ["refresh_token", "access_token", "instance_url", "id", "scope", "token_type", "issued_at"];
  return Response.json(Object.fromEntries(pick.filter((k) => k in data).map((k) => [k, data[k]])), {
    headers: NO_STORE,
  });
}

/** Reads the JSON body; null when it isn't an object of strings. */
export async function readBody(request: Request): Promise<Record<string, string> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return null;
    return Object.fromEntries(
      Object.entries(body).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}
