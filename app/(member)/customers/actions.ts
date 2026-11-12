"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { db, isUniqueViolation } from "@/lib/db";
import { field, rowId } from "@/lib/form";
import { disconnectOrg } from "@/lib/salesforce/orgs";
import { HEALTH_PATH } from "@/lib/callanchor/session";
import { setClientInternal } from "@/lib/callanchor/store";
import type { FormState } from "@/components/form-state";

export async function createCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireMember();
  const name = field(formData, "name");
  if (!name || name.length > 120) return { error: "Customer name is required (max 120 characters)." };

  try {
    await db()`INSERT INTO customers (name) VALUES (${name})`;
  } catch (error) {
    if (isUniqueViolation(error)) return { error: `A customer named "${name}" already exists.` };
    throw error;
  }

  revalidatePath("/customers");
  return { success: `Created ${name}.` };
}

export async function deleteCustomerAction(formData: FormData) {
  await requireMember();
  const id = rowId(formData);
  // Disconnect each org first so tokens this app minted are revoked, not just deleted.
  const orgs = await db()`SELECT id FROM salesforce_orgs WHERE customer_id = ${id}`;
  for (const org of orgs) await disconnectOrg(id, String(org.id));
  await db()`DELETE FROM customers WHERE id = ${id}`;

  revalidatePath("/customers");
  redirect("/customers");
}

// Marks a CallAnchor customer internal (our own test or demo account), or live again. The health
// pages hide internal clients unless "Show internal clients" is ticked. Admins only; every client
// starts normal (owner, 2026-11-12).
export async function setCustomerInternalAction(formData: FormData) {
  const member = await requireMember();
  if (member.role !== "admin") return;
  const id = rowId(formData);
  const [row] = await db()`SELECT callanchor_client_id FROM customers WHERE id = ${id}`;
  if (!row?.callanchor_client_id) return;
  await setClientInternal(row.callanchor_client_id, formData.get("internal") === "1", member.fullName || member.username);
  revalidatePath("/customers", "layout");
  revalidatePath(HEALTH_PATH, "layout");
}
