// Salesforce login hosts and the domains an Org URL may use. Shared by the page and the token route.

export const ENVS = {
  production: { label: "Production", loginHost: "login.salesforce.com" },
  developer: { label: "Developer Edition", loginHost: "login.salesforce.com" },
  sandbox: { label: "Sandbox", loginHost: "test.salesforce.com" },
} as const;

export type Env = keyof typeof ENVS;

const SALESFORCE_DOMAINS = ["salesforce.com", "force.com", "cloudforce.com"];

export function isSalesforceHost(host: string): boolean {
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return SALESFORCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** "https://acme.my.salesforce.com/lightning/page" -> "acme.my.salesforce.com"; null if not Salesforce. */
export function orgHost(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/\.lightning\.force\.com$/, ".my.salesforce.com");
    return isSalesforceHost(host) ? host : null;
  } catch {
    return null;
  }
}

/** Details a link can pre-fill: ?env=sandbox&org=acme.my.salesforce.com&start=1 (client_id on /sf-auth only). */
export type Prefill = { env?: Env; org?: string; clientId?: string; start?: boolean };

const ENV_ALIASES: Record<string, Env> = {
  production: "production",
  prod: "production",
  developer: "developer",
  dev: "developer",
  sandbox: "sandbox",
  test: "sandbox",
  sb: "sandbox",
};

type SearchParams = Record<string, string | string[] | undefined>;

export function readPrefill(sp: SearchParams, allowClientId: boolean): Prefill {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  // A return trip from Salesforce carries code/error, never prefill or auto-start.
  if (one("code") || one("error")) return {};
  const env = ENV_ALIASES[one("env")?.toLowerCase() ?? ""];
  const org = one("org");
  return {
    env,
    org: org && orgHost(org) ? org : undefined,
    clientId: allowClientId ? one("client_id") : undefined,
    start: ["1", "true", "yes"].includes(one("start")?.toLowerCase() ?? ""),
  };
}

/** The link to send a client: opens the page with these details filled in and goes straight to Salesforce. */
export function prefillLink(origin: string, page: string, p: Prefill): string {
  const q = new URLSearchParams();
  if (p.env) q.set("env", p.env);
  if (p.org) q.set("org", orgHost(p.org) ?? p.org);
  if (p.clientId) q.set("client_id", p.clientId);
  q.set("start", "1");
  return `${origin}${page}?${q}`;
}
