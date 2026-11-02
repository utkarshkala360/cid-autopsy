import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Operation } from "./spec.ts";

const SESSION_FILE = new URL("../.session", import.meta.url);
const COOKIE = "callanchor_portal_session";

export const baseUrl = () => process.env.CALLANCHOR_BASE_URL ?? "https://app.360callanchor.com";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function saveSession(setCookies: string[]): void {
  const cookie = setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error(`The response had no ${COOKIE} cookie.`);
  writeFileSync(SESSION_FILE, cookie.slice(COOKIE.length + 1), { mode: 0o600 });
  chmodSync(SESSION_FILE, 0o600);
}

function session(): string {
  if (!existsSync(SESSION_FILE)) throw new Error("Not signed in. Run: npm run login");
  return readFileSync(SESSION_FILE, "utf8").trim();
}

export function urlFor(op: Operation, values: Record<string, string>): URL {
  const path = op.path.replace(/{(\w+)}/g, (_, name) => {
    if (!values[name]) throw new Error(`${op.id} needs --${name}`);
    return encodeURIComponent(values[name]);
  });
  const url = new URL(path, baseUrl());
  for (const p of op.params) {
    if (p.in === "query" && values[p.name]) url.searchParams.set(p.name, values[p.name]);
  }
  return url;
}

export async function send(
  op: Operation,
  values: Record<string, string> = {},
  opts: { body?: unknown; confirm?: boolean } = {},
): Promise<{ body: unknown; response: Response }> {
  // Writes are opt-in per call, so a loop or a typo can't change production.
  if (op.safety === "write" && !opts.confirm) {
    throw new Error(`${op.id} changes production data. Re-run with --confirm.`);
  }
  const auth = op.safety === "auth";
  const response = await fetch(urlFor(op, values), {
    method: op.method.toUpperCase(),
    redirect: "manual",
    headers: {
      ...(auth ? {} : { Cookie: `${COOKIE}=${session()}` }),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
    throw new ApiError(response.status, `${op.id}: session rejected (${response.status}). Run: npm run login`);
  }
  if (!response.ok) throw new ApiError(response.status, `${op.id}: HTTP ${response.status}`);
  return { body: await response.json(), response };
}
