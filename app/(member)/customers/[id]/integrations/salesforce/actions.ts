"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { customerPath } from "@/lib/customers";
import { field, rowId } from "@/lib/form";
import {
  LOGIN_URLS,
  buildAuthUrl,
  finishLogin,
  normalizeLoginUrl,
  openLoginSession,
  parseAuthUrl,
  parseRedirect,
  startLogin,
} from "@/lib/salesforce/auth";
import { connectOrg, customerExists, disconnectOrg, verifyOrg, type AuthMethod } from "@/lib/salesforce/orgs";
import type { FormState } from "@/components/form-state";

export type StartLoginState = { error?: string; authorizeUrl?: string; session?: string } | undefined;

function revalidateOrgPages() {
  revalidatePath("/customers");
  revalidatePath("/customers/[id]", "page");
  revalidatePath("/customers/[id]/integrations/salesforce", "page");
}

async function connectAndReturn(p: { customerId: string; label: string; authUrl: string; method: AuthMethod; memberId: string }) {
  let connected;
  try {
    connected = await connectOrg(p);
  } catch (error) {
    return { error: `Salesforce CLI couldn't log in to that org: ${error instanceof Error ? error.message : "unknown error"}` };
  }
  revalidateOrgPages();
  redirect(`${customerPath(p.customerId, "integrations", "salesforce")}?${new URLSearchParams({ connected: connected.label })}`);
}

// Step 1: pick the environment, start a temporary login session and get the Salesforce login URL.
export async function startSalesforceLoginAction(_prev: StartLoginState, formData: FormData): Promise<StartLoginState> {
  const member = await requireMember();
  const customerId = field(formData, "customerId");
  if (!/^\d{1,18}$/.test(customerId) || !(await customerExists(customerId))) return { error: "That customer no longer exists." };
  const label = field(formData, "label");
  if (label.length > 80) return { error: "Name must be 80 characters or fewer." };

  const environment = field(formData, "environment");
  const loginUrl =
    environment === "custom" ? normalizeLoginUrl(field(formData, "customUrl")) : (LOGIN_URLS[environment] ?? null);
  if (!loginUrl) return { error: "Enter a Salesforce My Domain URL, e.g. https://acme.my.salesforce.com." };

  return startLogin({ loginUrl, customerId, label, memberId: member.id });
}

// Step 2: take the address Salesforce redirected to, exchange its code and store the org.
export async function finishSalesforceLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const session = openLoginSession(field(formData, "session"));
  if (!session || session.memberId !== member.id) return { error: "This login has expired. Start over." };

  const parsed = parseRedirect(field(formData, "redirectUrl"), session);
  if ("error" in parsed) return { error: parsed.error };

  let authUrl;
  try {
    authUrl = await finishLogin(session, parsed.code);
  } catch (error) {
    return { error: `Salesforce: ${error instanceof Error ? error.message : "login failed"}. Start over and try again.` };
  }
  return connectAndReturn({ customerId: session.customerId, label: session.label, authUrl, method: "oauth", memberId: member.id });
}

// Alternative: an org already authorized in the CLI / VS Code (`sf org auth show-sfdx-auth-url`).
export async function importAuthUrlAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const customerId = field(formData, "customerId");
  if (!/^\d{1,18}$/.test(customerId) || !(await customerExists(customerId))) return { error: "That customer no longer exists." };
  const parsed = parseAuthUrl(field(formData, "authUrl"));
  if (!parsed) {
    return { error: "That isn't a Salesforce SFDX auth URL. It should look like force://PlatformCLI::5Aep…@acme.my.salesforce.com." };
  }
  return connectAndReturn({ customerId, label: "", authUrl: buildAuthUrl(parsed), method: "sfdx_url", memberId: member.id });
}

export async function verifySalesforceOrgAction(formData: FormData) {
  await requireMember();
  await verifyOrg(rowId(formData, "customerId"), rowId(formData));
  revalidateOrgPages();
}

export async function disconnectSalesforceOrgAction(formData: FormData) {
  await requireMember();
  await disconnectOrg(rowId(formData, "customerId"), rowId(formData));
  revalidateOrgPages();
}
