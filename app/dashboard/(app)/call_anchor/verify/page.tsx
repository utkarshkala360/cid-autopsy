import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { getCallAnchorSession, lastMobile, safeNext } from "@/lib/callanchor/session";
import { cardClass } from "@/components/ui";
import { VerifyOtpForm } from "./VerifyOtpForm";

export const metadata: Metadata = { title: "Validate OTP" };

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const member = await requireMember();
  const { next } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);

  const [session, mobile] = await Promise.all([getCallAnchorSession(member.id), lastMobile(member.id)]);
  if (session.status === "valid") redirect(target);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold text-slate-900">Validate OTP</h1>
      <p className="mt-1 text-sm text-slate-500">
        {session.status === "missing"
          ? "Sign in to CallAnchor to continue."
          : "Your CallAnchor session has expired. Validate an OTP to refresh it."}
      </p>
      <div className={`${cardClass} mt-6 p-6`}>
        <VerifyOtpForm mobile={mobile} next={target} />
      </div>
    </div>
  );
}
