"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/callanchor/portal";
import {
  CALLANCHOR_PATH,
  otpLimitReached,
  recordOtpAttempt,
  safeNext,
  saveCallAnchorSession,
} from "@/lib/callanchor/session";
import { field } from "@/lib/form";
import type { FormState } from "@/components/form-state";

export type SendOtpState = { error?: string; mobile?: string } | undefined;

const TOO_MANY = "Too many OTP attempts. Try again in 15 minutes.";

export async function sendOtpAction(_prev: SendOtpState, formData: FormData): Promise<SendOtpState> {
  const member = await requireMember();
  const mobile = field(formData, "mobile").replace(/[\s-]/g, "");
  if (!/^\+[1-9]\d{9,14}$/.test(mobile)) return { error: "Enter your mobile with country code, e.g. +919876543210." };
  if (await otpLimitReached(member.id)) return { error: TOO_MANY };

  await recordOtpAttempt(member.id);
  if (!(await sendOtp(mobile))) {
    return { error: "CallAnchor couldn't place the OTP call. Check the number is a portal login and try again." };
  }
  return { mobile };
}

export async function verifyOtpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const mobile = field(formData, "mobile");
  const otp = field(formData, "otp");
  if (!/^\d{4,8}$/.test(otp)) return { error: "Enter the OTP from the call." };
  if (await otpLimitReached(member.id)) return { error: TOO_MANY };

  const result = await verifyOtp(mobile, otp);
  if (!result.ok) {
    if (result.reason === "unavailable") return { error: "Couldn't reach CallAnchor. Try again." };
    await recordOtpAttempt(member.id);
    return { error: "That OTP didn't work. Check it, or request a new one." };
  }

  await saveCallAnchorSession(member.id, mobile, result.cookie);
  revalidatePath(CALLANCHOR_PATH, "layout");
  redirect(safeNext(field(formData, "next")));
}
