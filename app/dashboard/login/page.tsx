import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { memberLoginAction } from "@/app/dashboard/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function DashboardLoginPage() {
  if (await getMember()) redirect("/dashboard");
  return <LoginForm title="Dashboard" subtitle="Sign in with the ID your admin gave you." action={memberLoginAction} />;
}
