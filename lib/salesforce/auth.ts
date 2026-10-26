import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";

export const LOGIN_URLS: Record<string, string> = {
  production: "https://login.salesforce.com",
  sandbox: "https://test.salesforce.com",
};

// Credentials (auth codes, refresh tokens) are only ever sent to Salesforce-owned hosts.
const SALESFORCE_DOMAINS = ["salesforce.com", "force.com", "salesforce.mil", "cloudforce.com", "sfcrmproducts.cn"];

export function isSalesforceHost(host: string) {
  const h = host.toLowerCase();
  return SALESFORCE_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

// Returns the origin (https://host) of a Salesforce login / My Domain URL, or null if it isn't one.
export function normalizeLoginUrl(input: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (url.protocol !== "https:" || !isSalesforceHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ---------- SFDX auth URLs ----------

// force://<clientId>:<clientSecret>:<refreshToken>@<instance host>, as printed by
// `sf org auth show-sfdx-auth-url` and accepted by `sf org login sfdx-url`.
const AUTH_URL_RE = /^force:\/\/([^:@\s]+):([^:@\s]*):([^@\s]+)@(?:https:\/\/)?([^/\s]+)\/?$/;

export function parseAuthUrl(input: string) {
  const match = AUTH_URL_RE.exec(input.trim());
  if (!match || !isSalesforceHost(match[4])) return null;
  const [, clientId, clientSecret, refreshToken, host] = match;
  return { clientId, clientSecret, refreshToken, instanceUrl: `https://${host}` };
}

export function buildAuthUrl(p: { clientId: string; clientSecret: string; refreshToken: string; instanceUrl: string }) {
  return `force://${p.clientId}:${p.clientSecret}:${p.refreshToken}@${new URL(p.instanceUrl).host}`;
}

// ---------- Web login (+ Connect Salesforce) ----------
//
// Same OAuth flow as `sf org login web` / VS Code's "SFDX: Authorize an Org", using the CLI's
// built-in connected app, so no app of our own has to be registered. That app only redirects to
// the CLI's local listener, which a hosted server can't receive, so the member copies the
// redirected address back from their browser. The PKCE verifier lives in a short-lived encrypted
// login session, so the code is useless to anyone else.

const CLI_CLIENT_ID = "PlatformCLI";
const CLI_REDIRECT_URI = "http://localhost:1717/OauthRedirect";
const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_CONTEXT = "salesforce_login_session";

export type LoginSession = {
  state: string;
  verifier: string;
  loginUrl: string;
  customerId: string;
  label: string;
  memberId: string;
  exp: number;
};

// Starts a temporary login session. Returns the Salesforce login URL and the sealed session the
// browser hands back when finishing.
export function startLogin(p: { loginUrl: string; customerId: string; label: string; memberId: string }) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const session: LoginSession = { ...p, state, verifier, exp: Date.now() + SESSION_TTL_MS };

  const url = new URL("/services/oauth2/authorize", p.loginUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLI_CLIENT_ID,
    redirect_uri: CLI_REDIRECT_URI,
    scope: "api refresh_token web",
    // Always ask for credentials, so an existing browser session can't silently connect the wrong org.
    prompt: "login",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();

  return { authorizeUrl: url.toString(), session: encrypt(JSON.stringify(session), SESSION_CONTEXT) };
}

// Null if the session was tampered with or has expired.
export function openLoginSession(sealed: string): LoginSession | null {
  try {
    const session = JSON.parse(decrypt(sealed, SESSION_CONTEXT)) as LoginSession;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

// Reads the code from the localhost:1717 address the browser was sent to after login.
export function parseRedirect(pasted: string, session: LoginSession) {
  let url: URL;
  try {
    url = new URL(pasted.trim());
  } catch {
    return { error: "Paste the full address from the browser tab, starting with http://localhost:1717." } as const;
  }
  const params = url.searchParams;
  const sfError = params.get("error_description") ?? params.get("error");
  if (sfError) return { error: `Salesforce: ${sfError}` } as const;
  if (params.get("state") !== session.state) {
    return { error: "That address is from a different login attempt. Start over and use the newest login tab." } as const;
  }
  const code = params.get("code");
  if (!code) return { error: "That address has no authorization code. Copy it after Salesforce redirects." } as const;
  return { code } as const;
}

// Exchanges the code for a refresh token and returns it as an SFDX auth URL for the CLI.
export async function finishLogin(session: LoginSession, code: string) {
  const res = await fetch(new URL("/services/oauth2/token", session.loginUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLI_CLIENT_ID,
      redirect_uri: CLI_REDIRECT_URI,
      code_verifier: session.verifier,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    instance_url?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok) throw new Error(body.error_description ?? body.error ?? `Token request failed (${res.status}).`);
  if (!body.refresh_token) throw new Error("Salesforce returned no refresh token.");
  if (!body.instance_url || !isSalesforceHost(new URL(body.instance_url).hostname)) {
    throw new Error("Salesforce returned an unexpected instance URL.");
  }
  return buildAuthUrl({
    clientId: CLI_CLIENT_ID,
    clientSecret: "",
    refreshToken: body.refresh_token,
    instanceUrl: body.instance_url,
  });
}

export async function revokeToken(instanceUrl: string, token: string) {
  await fetch(new URL("/services/oauth2/revoke", instanceUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  }).catch(() => undefined);
}
