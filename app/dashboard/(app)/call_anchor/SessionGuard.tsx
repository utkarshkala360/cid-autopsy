"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const BASE = "/dashboard/call_anchor";

// Pages check the session when they render, but the router cache can serve a page without asking
// the server. This covers those navigations by checking on every route change.
export function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === `${BASE}/verify`) return;
    const controller = new AbortController();

    fetch(`${BASE}/session`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.redirected) {
          window.location.assign(response.url);
          return;
        }
        if (!response.ok) return;
        const { status } = (await response.json()) as { status: string };
        if (status === "invalid" || status === "missing") {
          router.replace(`${BASE}/verify?${new URLSearchParams({ next: pathname })}`);
        }
      })
      .catch(() => {
        // Aborted or offline. The next page render checks again.
      });

    return () => controller.abort();
  }, [pathname, router]);

  return null;
}
