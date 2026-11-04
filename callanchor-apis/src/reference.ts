// The curl command and redacted sample for an operation. Shared by the curl reference
// and the app's copy of the contract, so the API console and the docs show the same thing.
import { readFileSync } from "node:fs";
import type { Operation } from "./spec.ts";

const BODIES: Record<string, string> = {
  sendOtp: '{"identifier":"\'"$CALLANCHOR_MOBILE"\'","mode":"mobile"}',
  verifyOtp: '{"identifier":"\'"$CALLANCHOR_MOBILE"\'","mode":"mobile","otp":"\'"$OTP"\'"}',
};
export const MAX_ITEMS = 2;
const MAX_TEXT = 240;

const shellVar = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();

export function curl(op: Operation): string {
  const path = op.path.replace(/{(\w+)}/g, (_, name) => `$${shellVar(name)}`);
  const paged = op.params.some((p) => p.name === "page") ? "?page=1&limit=50" : "";
  const lines = [`curl -s${op.method === "post" ? " -X POST" : ""} "https://app.360callanchor.com${path}${paged}"`];
  if (op.safety !== "auth") lines.push(`-H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"`);
  if (BODIES[op.id]) lines.push(`-H "Content-Type: application/json"`, `-d '${BODIES[op.id]}'`);
  else if (op.method === "post") lines.push(`-H "Content-Type: application/json"`, `-d '{}'`);
  if (op.id === "verifyOtp") lines.push(`-c cookies.txt`);
  return lines.join(" \\\n  ");
}

/** Keeps samples readable: the first items of each list, and long text cut short. */
function trim(value: unknown): unknown {
  if (Array.isArray(value)) {
    const kept = value.slice(0, MAX_ITEMS).map(trim);
    return value.length > MAX_ITEMS ? [...kept, `… ${value.length - MAX_ITEMS} more`] : kept;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trim(v)]));
  }
  return typeof value === "string" && value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
}

/** The redacted fixture, trimmed and pretty-printed. */
export function sample(op: Operation): string {
  const fixture = JSON.parse(readFileSync(new URL(`../fixtures/${op.id}.json`, import.meta.url), "utf8"));
  return JSON.stringify(trim(fixture), null, 2);
}
