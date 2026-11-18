"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ENVS, orgHost, prefillLink, type Env, type Prefill } from "./hosts";

// The details needed after Salesforce redirects back. Kept in this tab's sessionStorage only
// for the round trip, and deleted the moment the page comes back.
const PENDING_KEY = "sf-auth:pending";
export type Page = "/sf-auth" | "/sf-connect";
type Pending = {
  page: Page;
  host: string;
  /** Empty on /sf-connect: the server adds our packaged app's key and secret. */
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
};

type Tokens = {
  refresh_token?: string;
  access_token?: string;
  instance_url?: string;
  scope?: string;
};

type View =
  | { step: "form" }
  | { step: "exchanging" }
  | { step: "done"; code: string; tokens: Tokens }
  | { step: "error"; message: string; code?: string };

function base64Url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length: number) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

async function pkcePair() {
  const verifier = randomString(96);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function redirectUri() {
  return `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
}

const noSubscribe = () => () => {};

function takePending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

/** Saves the round-trip details and sends the browser to Salesforce. Returns a problem to show, if any. */
async function beginAuth(o: {
  page: Page;
  env: Env;
  orgUrl: string;
  clientId: string;
  clientSecret: string;
  packagedClientId?: string;
}): Promise<string | null> {
  let host: string = ENVS[o.env].loginHost;
  if (o.orgUrl.trim()) {
    const parsed = orgHost(o.orgUrl);
    if (!parsed) return "Org URL must be a Salesforce address, like https://yourcompany.my.salesforce.com";
    host = parsed;
  }
  const { verifier, challenge } = await pkcePair();
  const pending: Pending = {
    page: o.page,
    host,
    clientId: o.packagedClientId ? "" : o.clientId.trim(),
    clientSecret: o.packagedClientId ? "" : o.clientSecret.trim(),
    codeVerifier: verifier,
    redirectUri: redirectUri(),
    state: randomString(32),
  };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    return "This browser blocked session storage, which the round trip needs. Try a normal window.";
  }
  const url = new URL(`https://${host}/services/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: o.packagedClientId || pending.clientId,
    redirect_uri: pending.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: pending.state,
    prompt: "login consent",
  }).toString();
  window.location.assign(url.toString());
  return null;
}

/** Runs once when Salesforce redirects back here with ?code= or ?error=. */
function completeReturn(page: Page, started: { current: boolean }, show: (v: View) => void) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const sfError = params.get("error");
  if (!code && !sfError) return;
  if (started.current) return;
  started.current = true;

  // Drop code/state from the address bar and history, and forget the saved details.
  window.history.replaceState(null, "", window.location.pathname);
  const pending = takePending();

  if (sfError) {
    show({ step: "error", message: params.get("error_description") || sfError });
    return;
  }
  if (!pending) {
    show({
      step: "error",
      code: code!,
      message:
        "This tab no longer has the details from the form (it was reloaded, or opened in another tab). Start again.",
    });
    return;
  }
  if (params.get("state") !== pending.state || pending.page !== page) {
    show({ step: "error", message: "The reply from Salesforce didn't match this request. Start again." });
    return;
  }

  show({ step: "exchanging" });
  fetch(`${page}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: pending.host,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    }),
    cache: "no-store",
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        show({
          step: "error",
          code: code!,
          message: `${data.error ?? "Error"}: ${data.error_description ?? `token call failed (${res.status})`}`,
        });
      } else {
        show({ step: "done", code: code!, tokens: data });
      }
    })
    .catch(() => show({ step: "error", code: code!, message: "Couldn't reach the token service." }));
}

export function SfAuth({
  page,
  packagedClientId,
  prefill = {},
}: {
  page: Page;
  packagedClientId?: string;
  prefill?: Prefill;
}) {
  const [view, setView] = useState<View>({ step: "form" });
  const callback = useSyncExternalStore(noSubscribe, redirectUri, () => "");
  const started = useRef(false);

  useEffect(() => completeReturn(page, started, setView), [page]);

  if (view.step === "exchanging") {
    return <p className="mt-8 text-sm text-slate-600">Exchanging the code for tokens…</p>;
  }
  if (view.step === "done") return <Result page={page} code={view.code} tokens={view.tokens} />;

  return (
    <>
      {view.step === "error" && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Authorization failed</p>
          <p className="mt-1 break-words">{view.message}</p>
          {view.code && <CopyField label="Authorization code" value={view.code} />}
        </div>
      )}
      <AuthForm page={page} packagedClientId={packagedClientId} prefill={prefill} callback={callback} />
    </>
  );
}

function AuthForm({
  page,
  packagedClientId,
  prefill,
  callback,
}: {
  page: Page;
  packagedClientId?: string;
  prefill: Prefill;
  callback: string;
}) {
  const [env, setEnv] = useState<Env>(prefill.env ?? "production");
  const [orgUrl, setOrgUrl] = useState(prefill.org ?? "");
  const [clientId, setClientId] = useState(prefill.clientId ?? "");
  const [linkNote, setLinkNote] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function authorize(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    const problem = await beginAuth({ page, env, orgUrl, clientId, clientSecret, packagedClientId });
    if (problem) {
      setBusy(false);
      setError(problem);
    }
  }

  // A link with ?start=1 goes straight to Salesforce once the details it carries are complete.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!prefill.start || autoStarted.current) return;
    // /sf-auth needs the client's secret, which never goes in a link, so it can't auto-start.
    if (!packagedClientId) return;
    autoStarted.current = true;
    const problem = beginAuth({
      page,
      env: prefill.env ?? "production",
      orgUrl: prefill.org ?? "",
      clientId: prefill.clientId ?? "",
      clientSecret: "",
      packagedClientId,
    });
    void problem.then((msg) => msg && setError(msg));
  }, [page, prefill, packagedClientId]);

  async function copyLink() {
    const link = prefillLink(window.location.origin, page, {
      env,
      org: orgUrl.trim() || undefined,
      clientId: packagedClientId ? undefined : clientId.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(link);
      setLinkNote("Link copied. It opens this page filled in and goes straight to Salesforce.");
    } catch {
      setLinkNote(link);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100";

  return (
    <form onSubmit={authorize} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <span className="text-sm font-medium">Environment</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(Object.keys(ENVS) as Env[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setEnv(key)}
              className={`rounded-md border px-2 py-2 text-sm ${
                env === key ? "border-sky-600 bg-sky-50 font-medium text-sky-800" : "border-slate-300 text-slate-700"
              }`}
            >
              {ENVS[key].label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Salesforce Org URL</span>
        <input
          className={input}
          value={orgUrl}
          onChange={(e) => setOrgUrl(e.target.value)}
          placeholder="https://yourcompany.my.salesforce.com"
          inputMode="url"
          autoComplete="off"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Optional. Leave blank to sign in through {ENVS[env].loginHost}.
        </span>
      </label>

      {!packagedClientId && (
        <>
        <label className="block">
          <span className="text-sm font-medium">Consumer Key (Client ID)</span>
          <input
            className={`${input} font-mono`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Consumer Secret</span>
          <input
            className={`${input} font-mono`}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        </>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-sky-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
      >
        {busy ? "Opening Salesforce…" : "Authorize with Salesforce"}
      </button>

      <button type="button" onClick={copyLink} className="text-xs font-medium text-sky-700 hover:underline">
        Copy link for client
      </button>
      {linkNote && <p className="break-all text-xs text-slate-500">{linkNote}</p>}

      {callback && !packagedClientId && (
        <p className="text-xs text-slate-500">
          The Connected App&apos;s Callback URL must include{" "}
          <code className="rounded bg-slate-100 px-1 font-mono">{callback}</code>, and its OAuth scopes must
          include <em>Perform requests at any time (refresh_token, offline_access)</em>.
        </p>
      )}
    </form>
  );
}

function Result({ page, code, tokens }: { page: Page; code: string; tokens: Tokens }) {
  return (
    <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {tokens.refresh_token ? (
        <CopyField label="Refresh token" value={tokens.refresh_token} big />
      ) : (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Salesforce returned no refresh token. Add the <em>refresh_token, offline_access</em> scope to the Connected
          App, then start again.
        </p>
      )}
      {tokens.instance_url && <CopyField label="Instance URL" value={tokens.instance_url} />}
      {tokens.access_token && <CopyField label="Access token" value={tokens.access_token} />}
      <CopyField label="Authorization code (already used)" value={code} />
      {tokens.scope && <p className="text-xs text-slate-500">Scopes granted: {tokens.scope}</p>}
      <p className="text-xs text-slate-500">
        Copy what you need now. Nothing was saved, so leaving or reloading this page clears it.
      </p>
      <a href={page} className="inline-block text-sm font-medium text-sky-700 hover:underline">
        Start again
      </a>
    </div>
  );
}

function CopyField({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the value is selectable */
    }
  }
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className={`font-medium ${big ? "text-sm" : "text-xs text-slate-600"}`}>{label}</span>
        <button type="button" onClick={copy} className="text-xs font-medium text-sky-700 hover:underline">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        className={`mt-1 select-all break-all rounded-md border border-slate-200 bg-slate-50 p-2 font-mono ${
          big ? "text-sm" : "text-xs"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
