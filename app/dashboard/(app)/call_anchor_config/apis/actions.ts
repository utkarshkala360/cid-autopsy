"use server";

import { redirect } from "next/navigation";
import { compareWithContract, operations, type ContractResult } from "@/lib/callanchor/contract";
import { callPortal } from "@/lib/callanchor/portal";
import { APIS_PATH, requireApiConsoleAccess, storedCookie, verifyUrl } from "@/lib/callanchor/session";
import { field } from "@/lib/form";

export type ApiRunState =
  | {
      opId: string;
      error?: string;
      request?: string;
      status?: number;
      durationMs?: number;
      body?: string;
      truncated?: boolean;
      contract?: ContractResult;
    }
  | undefined;

const MAX_BODY_CHARS = 2_000_000; // server action responses are capped at 4.5 MB on Vercel
const ID_PATTERN = /^[\w-]{1,100}$/; // ids can't contain "/" or "..", so a value can't reach another endpoint
const NUMBER_PATTERN = /^\d{1,6}$/;

export async function runApiAction(_prev: ApiRunState, formData: FormData): Promise<ApiRunState> {
  const { member } = await requireApiConsoleAccess();
  const opId = field(formData, "opId");
  const op = operations.find((o) => o.id === opId);
  if (!op || op.safety === "auth") return { opId, error: "That operation can't be run here." };
  if (op.safety === "write" && field(formData, "confirm") !== "yes") {
    return { opId, error: "Tick the confirmation to run this. It changes production data." };
  }

  const pathValues: Record<string, string> = {};
  const query = new URLSearchParams();
  for (const param of op.params) {
    const value = field(formData, param.name);
    const numeric = param.name === "page" || param.name === "limit";
    if (!value) {
      if (param.in === "path") return { opId, error: `Enter ${param.name}.` };
      continue;
    }
    if (!(numeric ? NUMBER_PATTERN : ID_PATTERN).test(value)) return { opId, error: `${param.name} isn't valid.` };
    if (param.in === "path") pathValues[param.name] = value;
    else query.set(param.name, value);
  }
  const path = op.path.replace(/{(\w+)}/g, (_, name) => encodeURIComponent(pathValues[name]));
  const request = `${path}${query.size ? `?${query}` : ""}`;

  const cookie = await storedCookie(member.id);
  if (!cookie) redirect(verifyUrl(APIS_PATH));

  let result;
  try {
    result = await callPortal(cookie, op.method.toUpperCase(), request);
  } catch {
    return { opId, request, error: "Couldn't reach CallAnchor, or it took too long to respond." };
  }
  if (result.status === 401) redirect(verifyUrl(APIS_PATH));

  let parsed: unknown;
  let body = result.text;
  try {
    parsed = JSON.parse(result.text);
    body = JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON: show it as text.
  }
  return {
    opId,
    request,
    status: result.status,
    durationMs: result.durationMs,
    body: body.slice(0, MAX_BODY_CHARS),
    truncated: body.length > MAX_BODY_CHARS,
    contract: result.status === 200 && parsed !== undefined ? compareWithContract(op, parsed) : undefined,
  };
}
