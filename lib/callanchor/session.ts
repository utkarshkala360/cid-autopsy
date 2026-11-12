import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { checkSession, type SessionCheck } from "@/lib/callanchor/portal";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";

export const CALLANCHOR_PATH = "/dashboard/call_anchor_config";
export const VERIFY_PATH = `${CALLANCHOR_PATH}/verify`;
export const APIS_PATH = `${CALLANCHOR_PATH}/apis`;
export const HEALTH_PATH = `${CALLANCHOR_PATH}/health`;
export const HEALTH_SETTINGS_PATH = `${HEALTH_PATH}/settings`;

// Each attempt can place a real phone call.
const OTP_SCOPE = "callanchor_otp";
const MAX_OTP_ATTEMPTS = 6;

export type MemberSession = SessionCheck | { status: "missing" };

const context = (memberId: string) => `callanchor_session:${memberId}`;

export async function storedCookie(memberId: string) {
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

// The API console runs any CallAnchor read live and shows customer data, so only admins get it.
export async function requireApiConsoleAccess() {
  const access = await requireCallAnchorSession(APIS_PATH);
  if (access.member.role !== "admin") notFound();
  return access;
}

// Fleet-wide health choices: thresholds, and which clients are internal. Admins only (owner,
// 2026-11-12); others get a 404 and don't see the Settings link.
export async function requireHealthAdmin(next = HEALTH_SETTINGS_PATH) {
  const access = await requireCallAnchorSession(next);
  if (access.member.role !== "admin") notFound();
  return access;
}

// Whether this browser asked to see internal clients on the health pages. Off by default.
export const SHOW_INTERNAL_COOKIE = "ca_show_internal";
export async function showInternal() {
  return (await cookies()).get(SHOW_INTERNAL_COOKIE)?.value === "1";
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
