import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { adminLoginAction } from "@/app/admin/actions";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");
  return <LoginForm title="Admin Console" subtitle="Restricted to administrators." action={adminLoginAction} />;
}
