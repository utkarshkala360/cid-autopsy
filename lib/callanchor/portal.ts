import "server-only";

// HTTP calls to the CallAnchor portal. The contract lives in callanchor-apis/openapi.
const COOKIE = "callanchor_portal_session";
const TIMEOUT_MS = 8000;
const CONSOLE_TIMEOUT_MS = 25000;

export type PortalProfile = {
  portalUserId: string;
  name: string;
  email: string;
  mobile: string;
  profileImageUrl: string | null;
};

// "unavailable" means we couldn't tell. Only a rejection from CallAnchor counts as invalid, so an
// outage doesn't send everyone to an OTP page that can't work.
export type SessionCheck =
  | { status: "valid"; profile: PortalProfile }
  | { status: "invalid" }
  | { status: "unavailable" };

const baseUrl = () => process.env.CALLANCHOR_BASE_URL ?? "https://app.360callanchor.com";

function portalFetch(path: string, init: RequestInit) {
  return fetch(new URL(path, baseUrl()), {
    ...init,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function postJson(path: string, body: unknown) {
  return portalFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function checkSession(cookie: string): Promise<SessionCheck> {
  try {
    const response = await portalFetch("/api/portal/profile", {
      headers: { Cookie: `${COOKIE}=${cookie}` },
    });
    if (response.status === 401 || response.status === 403) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };
    const { profile } = (await response.json()) as { profile?: PortalProfile };
    return profile ? { status: "valid", profile } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

// Runs one contract operation with a member's session, for the API console.
export async function callPortal(cookie: string, method: string, path: string) {
  const started = Date.now();
  const response = await fetch(new URL(path, baseUrl()), {
    method,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(CONSOLE_TIMEOUT_MS),
    headers: { Cookie: `${COOKIE}=${cookie}` },
  });
  return { status: response.status, durationMs: Date.now() - started, text: await response.text() };
}

// Places a real OTP call.
export async function sendOtp(mobile: string) {
  try {
    const response = await postJson("/api/auth/send-otp", { identifier: mobile, mode: "mobile" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function verifyOtp(mobile: string, otp: string) {
  try {
    const response = await postJson("/api/auth/verify-otp", { identifier: mobile, mode: "mobile", otp });
    if (response.status >= 500) return { ok: false, reason: "unavailable" } as const;
    if (!response.ok) return { ok: false, reason: "rejected" } as const;
    const prefix = `${COOKIE}=`;
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .find((c) => c.startsWith(prefix))
      ?.slice(prefix.length);
    return cookie ? ({ ok: true, cookie } as const) : ({ ok: false, reason: "unavailable" } as const);
  } catch {
    return { ok: false, reason: "unavailable" } as const;
  }
}
