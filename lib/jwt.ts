// Session token helpers. Kept free of `server-only` so proxy.ts can import it.
import { SignJWT, jwtVerify } from "jose";

export type SessionKind = "admin" | "member";

export type SessionPayload = {
  sub: string;
  kind: SessionKind;
  // Session version; must match the account's session_version to stay valid.
  sv: number;
};

// Each console's cookie is scoped to its own path so it's never sent to the other.
export const SESSION_COOKIES = {
  admin: { name: "cid_admin", path: "/admin", loginPath: "/admin/login" },
  member: { name: "cid_member", path: "/dashboard", loginPath: "/dashboard/login" },
} as const;

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ISSUER = "cid-autopsy";

let cachedKey: Promise<Uint8Array> | undefined;

// The signing key is derived from the database URL (which contains the DB password),
// so no separate secret has to be configured. Rotating the DB password signs everyone out.
function secretKey() {
  cachedKey ??= (async () => {
    const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!dbUrl) throw new Error("DATABASE_URL is not set.");
    const data = new TextEncoder().encode(`cid-autopsy:session:v1:${dbUrl}`);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  })();
  return cachedKey;
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ sv: payload.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    // The audience binds a token to one console: a member token is never accepted by /admin.
    .setAudience(payload.kind)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await secretKey());
}

export async function verifySession(
  token: string | undefined,
  kind: SessionKind,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secretKey(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: kind,
    });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, kind, sv: payload.sv };
  } catch {
    return null;
  }
}
