import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { checkSession, type SessionCheck } from "@/lib/callanchor/portal";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

export const CALLANCHOR_PATH = "/dashboard/call_anchor_config";
export const VERIFY_PATH = `${CALLANCHOR_PATH}/verify`;

// Each attempt can place a real phone call.
const OTP_SCOPE = "callanchor_otp";
const MAX_OTP_ATTEMPTS = 6;

export type MemberSession = SessionCheck | { status: "missing" };

const context = (memberId: string) => `callanchor_session:${memberId}`;

async function storedCookie(memberId: string) {
  const [row] = await db()`SELECT cookie_encrypted FROM callanchor_sessions WHERE member_id = ${memberId}`;
  if (!row) return null;
  try {
    return decrypt(row.cookie_encrypted, context(memberId));
  } catch {
    return null;
  }
}

// Asks CallAnchor every time, deduped within one render.
export const getCallAnchorSession = cache(async (memberId: string): Promise<MemberSession> => {
  const cookie = await storedCookie(memberId);
  return cookie ? checkSession(cookie) : { status: "missing" };
});

// `next` must stay inside the sub app, so the verify page can't be used as an open redirect.
export function safeNext(path: string | undefined) {
  const inside = path === CALLANCHOR_PATH || path?.startsWith(`${CALLANCHOR_PATH}/`);
  return inside && !path?.includes("//") && !path?.includes("\\") && path !== VERIFY_PATH ? path! : CALLANCHOR_PATH;
}

export const verifyUrl = (next: string) => `${VERIFY_PATH}?${new URLSearchParams({ next })}`;

// For every CallAnchor page and server action. `profile` is null when CallAnchor couldn't be reached.
export async function requireCallAnchorSession(next = CALLANCHOR_PATH) {
  const member = await requireMember();
  const session = await getCallAnchorSession(member.id);
  if (session.status === "invalid" || session.status === "missing") redirect(verifyUrl(next));
  return { member, profile: session.status === "valid" ? session.profile : null };
}

export async function saveCallAnchorSession(memberId: string, mobile: string, cookie: string) {
  const sealed = encrypt(cookie, context(memberId));
  await db()`
    INSERT INTO callanchor_sessions (member_id, mobile, cookie_encrypted)
    VALUES (${memberId}, ${mobile}, ${sealed})
    ON CONFLICT (member_id) DO UPDATE
      SET mobile = EXCLUDED.mobile, cookie_encrypted = EXCLUDED.cookie_encrypted, updated_at = now()
  `;
}

export async function lastMobile(memberId: string) {
  const [row] = await db()`SELECT mobile FROM callanchor_sessions WHERE member_id = ${memberId}`;
  return (row?.mobile as string | undefined) ?? "";
}

export async function otpLimitReached(memberId: string) {
  const [row] = await db()`
    SELECT count(*) AS attempts FROM login_attempts
    WHERE scope = ${OTP_SCOPE} AND username = ${memberId} AND created_at > now() - interval '15 minutes'
  `;
  return Number(row.attempts) >= MAX_OTP_ATTEMPTS;
}

export async function recordOtpAttempt(memberId: string) {
  await db()`
    INSERT INTO login_attempts (scope, username, ip, success)
    VALUES (${OTP_SCOPE}, ${memberId}, '-', FALSE)
  `;
}
