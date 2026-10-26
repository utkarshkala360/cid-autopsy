"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, hashPassword, loginAdmin, requireAdmin } from "@/lib/auth";
import { db, isUniqueViolation } from "@/lib/db";
import type { FormState } from "@/components/form-state";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 10;

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function memberId(formData: FormData) {
  const id = field(formData, "id");
  if (!/^\d+$/.test(id)) throw new Error("Invalid member id.");
  return id;
}

export async function adminLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await loginAdmin(field(formData, "username"), String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/admin");
}

export async function adminLogoutAction() {
  await endSession("admin");
  redirect("/admin/login");
}

export async function createMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const username = field(formData, "username").toLowerCase();
  const fullName = field(formData, "fullName");
  const role = field(formData, "role");
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_RE.test(username)) {
    return { error: "ID must be 3–32 characters: lowercase letters, numbers, dot, dash or underscore." };
  }
  if (!fullName || fullName.length > 100) return { error: "Full name is required (max 100 characters)." };
  if (role !== "agent" && role !== "member") return { error: "Choose a valid role." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  try {
    await db()`
      INSERT INTO members (username, full_name, role, password_hash)
      VALUES (${username}, ${fullName}, ${role}, ${await hashPassword(password)})
    `;
  } catch (error) {
    if (isUniqueViolation(error)) return { error: `ID "${username}" is already taken.` };
    throw error;
  }

  revalidatePath("/admin");
  return { success: `Created ${username}.` };
}

export async function setMemberActiveAction(formData: FormData) {
  await requireAdmin();
  const id = memberId(formData);
  const active = field(formData, "active") === "true";
  // Deactivating also bumps the session version so the member is signed out immediately.
  const bump = active ? 0 : 1;
  await db()`
    UPDATE members
    SET is_active = ${active}, session_version = session_version + ${bump}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
}

export async function resetMemberPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = memberId(formData);
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  await db()`
    UPDATE members
    SET password_hash = ${await hashPassword(password)}, session_version = session_version + 1
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  return { success: "Password updated. Existing sessions were signed out." };
}

export async function deleteMemberAction(formData: FormData) {
  await requireAdmin();
  await db()`DELETE FROM members WHERE id = ${memberId(formData)}`;
  revalidatePath("/admin");
}
