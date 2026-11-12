"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, hashPassword, loginAdmin, requireAdmin } from "@/lib/auth";
import { db, isUniqueViolation } from "@/lib/db";
import type { FormState } from "@/components/form-state";

// An ID is either a plain username or an email address (stored lowercase).
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

function isValidId(id: string) {
  return USERNAME_RE.test(id) || (id.length <= 254 && EMAIL_RE.test(id));
}
const MIN_PASSWORD_LENGTH = 10;
// Admins also get the CallAnchor API console.
const ROLES = ["agent", "member", "admin"];

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
  const result = await loginAdmin(field(formData, "username").toLowerCase(), String(formData.get("password") ?? ""));
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
  const isAuditor = formData.get("auditor") === "on";
  const password = String(formData.get("password") ?? "");

  if (!isValidId(username)) {
    return {
      error: "ID must be an email address, or 3–32 characters of letters, numbers, dot, dash or underscore.",
    };
  }
  if (!fullName || fullName.length > 100) return { error: "Full name is required (max 100 characters)." };
  if (!ROLES.includes(role)) return { error: "Choose a valid role." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  try {
    await db()`
      INSERT INTO members (username, full_name, role, is_auditor, password_hash)
      VALUES (${username}, ${fullName}, ${role}, ${isAuditor}, ${await hashPassword(password)})
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

export async function setMemberRoleAction(formData: FormData) {
  await requireAdmin();
  const id = memberId(formData);
  const role = field(formData, "role");
  if (!ROLES.includes(role)) throw new Error("Invalid role.");
  // Pages read the role from the database on every request, so the change applies at once.
  await db()`UPDATE members SET role = ${role} WHERE id = ${id}`;
  revalidatePath("/admin");
}

// Auditors can leave notes on any dashboard page. Read from the database per request, so it applies at once.
export async function setMemberAuditorAction(formData: FormData) {
  await requireAdmin();
  const id = memberId(formData);
  const auditor = field(formData, "auditor") === "true";
  await db()`UPDATE members SET is_auditor = ${auditor} WHERE id = ${id}`;
  revalidatePath("/admin");
}

const NOTE_STATUS_VALUES = ["open", "done", "wontfix"];

export async function setAuditNoteStatusAction(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id");
  if (!/^\d+$/.test(id)) throw new Error("Invalid note id.");
  const status = field(formData, "status");
  if (!NOTE_STATUS_VALUES.includes(status)) throw new Error("Invalid status.");
  const resolution = field(formData, "resolution").slice(0, 2000) || null;
  await db()`
    UPDATE audit_notes
    SET status = ${status},
        resolution = COALESCE(${resolution}, resolution),
        resolved_at = CASE WHEN ${status} = 'open' THEN NULL ELSE COALESCE(resolved_at, now()) END
    WHERE id = ${id}
  `;
  revalidatePath("/admin/audit-notes");
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
