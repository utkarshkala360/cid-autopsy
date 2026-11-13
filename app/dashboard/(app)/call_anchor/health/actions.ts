"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { clearHealthCache } from "@/lib/callanchor/health";
import { HEALTH_PATH, SHOW_INTERNAL_COOKIE, requireCallAnchorSession, requireHealthAdmin } from "@/lib/callanchor/session";
import { setClientInternal } from "@/lib/callanchor/store";

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
  clearHealthCache();
  revalidatePath(HEALTH_PATH, "layout");
}
