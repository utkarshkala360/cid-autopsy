import "server-only";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { withSalesforceOrg, type SfLoginResult, type SfRunner } from "@/lib/salesforce/cli";
import { parseAuthUrl, revokeToken } from "@/lib/salesforce/auth";

export type AuthMethod = "oauth" | "sfdx_url";

export type SalesforceOrg = {
  id: string;
  label: string;
  org_id: string;
  org_name: string | null;
  username: string;
  instance_url: string;
  is_sandbox: boolean;
  org_type: string | null;
  auth_method: AuthMethod;
  status: "connected" | "error";
  last_error: string | null;
  last_verified_at: string | null;
};

type OrgDetails = {
  orgId: string;
  username: string;
  instanceUrl: string;
  orgName: string | null;
  isSandbox: boolean;
  orgType: string | null;
};

// Binds a stored credential to its row, so ciphertexts can't be swapped between orgs.
function credentialContext(customerId: string, orgId: string) {
  return `salesforce_org:${customerId}:${orgId}`;
}

// Logs in with the CLI and reads the org's identity: proves the credential works.
async function describeOrg(authUrl: string): Promise<OrgDetails> {
  return withSalesforceOrg(authUrl, async (run, login) => {
    const { records } = await run<{ records: { Name: string; IsSandbox: boolean; OrganizationType: string }[] }>([
      "data",
      "query",
      "--query",
      "SELECT Name, IsSandbox, OrganizationType FROM Organization",
    ]);
    const org = records[0];
    return {
      orgId: login.orgId,
      username: login.username,
      instanceUrl: login.instanceUrl,
      orgName: org?.Name ?? null,
      isSandbox: org?.IsSandbox ?? false,
      orgType: org?.OrganizationType ?? null,
    };
  });
}

export async function customerExists(customerId: string) {
  const [row] = await db()`SELECT 1 FROM customers WHERE id = ${customerId}`;
  return Boolean(row);
}

// Verifies the auth URL with the CLI, then stores it encrypted. An empty label defaults to the
// org's environment (Production / Sandbox). Reconnecting an org that's
// already connected for this customer replaces its credential.
export async function connectOrg(p: {
  customerId: string;
  label: string;
  authUrl: string;
  method: AuthMethod;
  memberId: string;
}) {
  const org = await describeOrg(p.authUrl);
  const label = p.label || (org.isSandbox ? "Sandbox" : "Production");
  const encrypted = encrypt(p.authUrl, credentialContext(p.customerId, org.orgId));
  const [row] = await db()`
    INSERT INTO salesforce_orgs (
      customer_id, label, org_id, org_name, username, instance_url, is_sandbox, org_type,
      auth_method, auth_url_encrypted, last_verified_at, connected_by
    ) VALUES (
      ${p.customerId}, ${label}, ${org.orgId}, ${org.orgName}, ${org.username}, ${org.instanceUrl},
      ${org.isSandbox}, ${org.orgType}, ${p.method}, ${encrypted}, now(), ${p.memberId}
    )
    ON CONFLICT (customer_id, org_id) DO UPDATE SET
      label = EXCLUDED.label, org_name = EXCLUDED.org_name, username = EXCLUDED.username,
      instance_url = EXCLUDED.instance_url, is_sandbox = EXCLUDED.is_sandbox, org_type = EXCLUDED.org_type,
      auth_method = EXCLUDED.auth_method, auth_url_encrypted = EXCLUDED.auth_url_encrypted,
      status = 'connected', last_error = NULL, last_verified_at = now(),
      connected_by = EXCLUDED.connected_by, updated_at = now()
    RETURNING id
  `;
  return { id: String(row.id), label, ...org };
}

export async function listOrgs(customerId: string) {
  return (await db()`
    SELECT id, label, org_id, org_name, username, instance_url, is_sandbox, org_type,
           auth_method, status, last_error, last_verified_at
    FROM salesforce_orgs WHERE customer_id = ${customerId}
    ORDER BY is_sandbox, label
  `) as SalesforceOrg[];
}

async function loadCredential(customerId: string, id: string) {
  const [row] = await db()`
    SELECT customer_id, org_id, instance_url, auth_method, auth_url_encrypted
    FROM salesforce_orgs WHERE id = ${id} AND customer_id = ${customerId}
  `;
  if (!row) return null;
  return {
    authUrl: decrypt(row.auth_url_encrypted, credentialContext(String(row.customer_id), row.org_id)),
    instanceUrl: row.instance_url as string,
    method: row.auth_method as AuthMethod,
  };
}

// Runs `fn` with the CLI logged in to one of a customer's stored orgs. This is how features act on a
// customer's Salesforce, e.g. withStoredOrg(customerId, orgId, (run) => run(["data", "query", ...])).
export async function withStoredOrg<R>(customerId: string, id: string, fn: (run: SfRunner, login: SfLoginResult) => Promise<R>) {
  const credential = await loadCredential(customerId, id);
  if (!credential) throw new Error("Salesforce org not found.");
  return withSalesforceOrg(credential.authUrl, fn);
}

export async function verifyOrg(customerId: string, id: string) {
  const credential = await loadCredential(customerId, id);
  if (!credential) return;
  try {
    const org = await describeOrg(credential.authUrl);
    await db()`
      UPDATE salesforce_orgs
      SET status = 'connected', last_error = NULL, last_verified_at = now(), updated_at = now(),
          org_name = ${org.orgName}, username = ${org.username}, instance_url = ${org.instanceUrl},
          is_sandbox = ${org.isSandbox}, org_type = ${org.orgType}
      WHERE id = ${id}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    await db()`
      UPDATE salesforce_orgs
      SET status = 'error', last_error = ${message.slice(0, 500)}, last_verified_at = now(), updated_at = now()
      WHERE id = ${id}
    `;
  }
}

// Deletes the stored credential. Tokens minted by this app's login are also revoked; imported CLI
// tokens are left alone because they're shared with the CLI session they came from.
export async function disconnectOrg(customerId: string, id: string) {
  const credential = await loadCredential(customerId, id).catch(() => null);
  if (credential?.method === "oauth") {
    const parsed = parseAuthUrl(credential.authUrl);
    if (parsed) await revokeToken(credential.instanceUrl, parsed.refreshToken);
  }
  await db()`DELETE FROM salesforce_orgs WHERE id = ${id} AND customer_id = ${customerId}`;
}
