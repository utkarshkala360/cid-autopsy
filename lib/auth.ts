import "server-only";
import { cache } from "react";
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  SESSION_COOKIES,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type SessionKind,
} from "@/lib/jwt";

export type Member = {
  id: string;
  username: string;
  fullName: string;
  role: "agent" | "member";
};

// Compared against when the username doesn't exist, so response timing doesn't reveal valid usernames.
const DUMMY_HASH = "$2b$12$HSbAk0vpGMrYDPBYAmAtoOAcnhLbwRWAy/2RHjszR1ITTT/G.1vM6";

const MAX_FAILURES_PER_USERNAME = 5;
const MAX_FAILURES_PER_IP = 25;

// ---------- Sessions ----------

async function startSession(kind: SessionKind, sub: string, sv: number) {
  const { name, path } = SESSION_COOKIES[kind];
  const token = await signSession({ sub, kind, sv });
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(kind: SessionKind) {
  const { name, path } = SESSION_COOKIES[kind];
  (await cookies()).delete({ name, path });
}

async function readSession(kind: SessionKind) {
  const token = (await cookies()).get(SESSION_COOKIES[kind].name)?.value;
  return verifySession(token, kind);
}

// ---------- Rate limiting ----------

async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function isRateLimited(scope: SessionKind, username: string, ip: string) {
  const [row] = await db()`
    SELECT
      count(*) FILTER (WHERE scope = ${scope} AND username = ${username}) AS by_user,
      count(*) FILTER (WHERE ip = ${ip}) AS by_ip
    FROM login_attempts
    WHERE success = FALSE AND created_at > now() - interval '15 minutes'
  `;
  return Number(row.by_user) >= MAX_FAILURES_PER_USERNAME || Number(row.by_ip) >= MAX_FAILURES_PER_IP;
}

async function recordAttempt(scope: SessionKind, username: string, ip: string, success: boolean) {
  await db()`
    INSERT INTO login_attempts (scope, username, ip, success)
    VALUES (${scope}, ${username}, ${ip}, ${success})
  `;
  await db()`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`;
}

export const RATE_LIMIT_MESSAGE = "Too many failed attempts. Try again in 15 minutes.";

// ---------- Admin ----------

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function loginAdmin(username: string, password: string) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !expectedHash) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be set.");
  }

  const ip = await clientIp();
  if (await isRateLimited("admin", username, ip)) return { ok: false, error: RATE_LIMIT_MESSAGE } as const;

  const userMatches = safeEqual(username, expectedUser);
  const passwordMatches = await bcrypt.compare(password, userMatches ? expectedHash : DUMMY_HASH);
  const ok = userMatches && passwordMatches;

  await recordAttempt("admin", username, ip, ok);
  if (!ok) return { ok: false, error: "Invalid ID or password." } as const;

  await startSession("admin", expectedUser, 1);
  return { ok: true } as const;
}

export const getAdmin = cache(async () => {
  const session = await readSession("admin");
  // Changing ADMIN_USERNAME invalidates all existing admin sessions.
  if (!session || session.sub !== process.env.ADMIN_USERNAME) return null;
  return { username: session.sub };
});

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect(SESSION_COOKIES.admin.loginPath);
  return admin;
}

// ---------- Members ----------

export async function loginMember(username: string, password: string) {
  const ip = await clientIp();
  if (await isRateLimited("member", username, ip)) return { ok: false, error: RATE_LIMIT_MESSAGE } as const;

  const [row] = await db()`
    SELECT id, password_hash, is_active, session_version
    FROM members WHERE username = ${username}
  `;
  const passwordMatches = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  const ok = Boolean(row && passwordMatches && row.is_active);

  await recordAttempt("member", username, ip, ok);
  if (!ok) return { ok: false, error: "Invalid ID or password." } as const;

  await db()`UPDATE members SET last_login_at = now() WHERE id = ${row.id}`;
  await startSession("member", String(row.id), row.session_version);
  return { ok: true } as const;
}

export const getMember = cache(async (): Promise<Member | null> => {
  const session = await readSession("member");
  if (!session) return null;

  const [row] = await db()`
    SELECT id, username, full_name, role
    FROM members
    WHERE id = ${session.sub} AND is_active = TRUE AND session_version = ${session.sv}
  `;
  if (!row) return null;
  return { id: String(row.id), username: row.username, fullName: row.full_name, role: row.role };
});

export async function requireMember() {
  const member = await getMember();
  if (!member) redirect(SESSION_COOKIES.member.loginPath);
  return member;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
