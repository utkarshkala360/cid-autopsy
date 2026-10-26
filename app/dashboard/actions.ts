"use server";

import { redirect } from "next/navigation";
import { endSession, loginMember } from "@/lib/auth";
import type { FormState } from "@/components/form-state";

export async function memberLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const result = await loginMember(username, String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/dashboard");
}

export async function memberLogoutAction() {
  await endSession("member");
  redirect("/dashboard/login");
}
