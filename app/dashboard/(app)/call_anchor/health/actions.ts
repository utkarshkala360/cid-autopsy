"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { PortalError } from "@/lib/callanchor/portal";
import { HEALTH_PATH, SHOW_INTERNAL_COOKIE, requireCallAnchorSession, requireHealthAdmin, storedCookie } from "@/lib/callanchor/session";
import { isPullStep, planPull, runPullStep, setClientInternal, type PullStep } from "@/lib/callanchor/store";

const ID_PATTERN = /^[\w-]{1,100}$/;

// The "Show internal clients" tick box. Kept per browser, for the health pages only.
export async function setShowInternalAction(formData: FormData) {
  await requireCallAnchorSession(HEALTH_PATH);
  const on = formData.get("show") === "1";
  (await cookies()).set(SHOW_INTERNAL_COOKIE, on ? "1" : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: HEALTH_PATH,
    maxAge: on ? 60 * 60 * 24 * 365 : 0,
  });
  revalidatePath(HEALTH_PATH, "layout");
}

// Marks a client internal, or live again. Fleet-wide, so admins only (requireHealthAdmin).
export async function setClientInternalAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!ID_PATTERN.test(clientId)) return;
  const { member } = await requireHealthAdmin(`${HEALTH_PATH}/${clientId}`);
  await setClientInternal(clientId, formData.get("internal") === "1", member.fullName || member.username);
  revalidatePath(HEALTH_PATH, "layout");
}

// ---- Pulling with progress (owner, 2026-11-13) ----
// The page renders from the store at once; the browser then pulls what's new a batch at a time and
// shows how far it got. Only the member's own stored CallAnchor session is used, and only GETs.

type PullAuth = { cookie: string } | { verify: true };

async function pullAuth(): Promise<PullAuth> {
  const member = await requireMember();
  const cookie = await storedCookie(member.id);
  return cookie ? { cookie } : { verify: true };
}

export async function planPullAction(clientId: string | null): Promise<{ steps: PullStep[] } | { verify: true }> {
  if (clientId !== null && !ID_PATTERN.test(clientId)) return { steps: [] };
  const auth = await pullAuth();
  if ("verify" in auth) return auth;
  return { steps: await planPull(clientId) };
}

// Runs up to 6 steps side by side; the browser sends the next batch when this one is back.
export async function pullBatchAction(keys: string[]): Promise<{ errors: string[] } | { verify: true }> {
  const steps = keys.filter((k) => typeof k === "string" && isPullStep(k)).slice(0, 6);
  const auth = await pullAuth();
  if ("verify" in auth) return auth;
  try {
    const results = await Promise.all(steps.map((k) => runPullStep(auth.cookie, k)));
    return { errors: results.filter((e): e is string => e !== null) };
  } catch (error) {
    if (error instanceof PortalError && error.rejected) return { verify: true };
    throw error;
  }
}
