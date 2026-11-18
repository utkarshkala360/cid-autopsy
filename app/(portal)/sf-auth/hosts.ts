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
