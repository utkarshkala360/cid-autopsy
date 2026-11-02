import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ApiError, baseUrl, saveSession, send } from "./client.ts";
import { operation, operations, undocumented, validate } from "./spec.ts";

const PAGE_LIMIT = "50";
const PAUSE_MS = 250; // this is a production portal, so stay gentle

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    confirm: { type: "boolean" },
    pages: { type: "string" },
    client: { type: "string" },
    mobile: { type: "string" },
  },
});
const [command, target] = positionals;
const clientFlag = (flags.client ?? process.env.CALLANCHOR_CLIENT_ID) as string | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clientList = (body: unknown) => body as { id: string; companyName: string }[];

async function login() {
  const identifier = (flags.mobile ?? process.env.CALLANCHOR_MOBILE) as string | undefined;
  if (!identifier) throw new Error("Set CALLANCHOR_MOBILE in .env or pass --mobile.");
  await send(operation("sendOtp"), {}, { body: { identifier, mode: "mobile" } });
  const rl = createInterface({ input: stdin, output: stdout });
  const otp = (await rl.question(`OTP call placed to ${identifier}. Enter OTP: `)).trim();
  rl.close();
  const { body, response } = await send(operation("verifyOtp"), {}, { body: { identifier, mode: "mobile", otp } });
  saveSession(response.headers.getSetCookie());
  const user = body as { name: string; roleId: string };
  console.log(`Signed in as ${user.name} (${user.roleId}). Session saved to .session`);
}

/** Runs every read operation once and compares each response with the contract. */
async function check() {
  const ids: Record<string, string> = { page: "1", limit: PAGE_LIMIT };
  const first = await send(operation("listClients"));
  const candidates = clientFlag ? [clientFlag] : clientList(first.body).map((c) => c.id);
  if (!candidates.length) throw new Error("No clients returned.");
  // New clients have no logs, so look for one that can exercise the id-based operations.
  for (const clientId of candidates) {
    ids.clientId ??= clientId;
    const logs = (await send(operation("listCalloutLogs"), { clientId, page: "1", limit: "1" })).body as any;
    if (logs.items?.[0]?.requestId) {
      ids.clientId = clientId;
      ids.requestId = logs.items[0].requestId;
      break;
    }
    await sleep(PAUSE_MS);
  }

  let broken = 0;
  const reads = operations.filter((o) => o.safety === "read").sort((a, b) => a.id.localeCompare(b.id));
  for (const op of reads) {
    await sleep(PAUSE_MS);
    if (op.params.some((p) => p.in === "path" && !ids[p.name])) {
      console.log(`SKIP  ${op.id}: no sample id available`);
      continue;
    }
    try {
      const { body } = await send(op, ids);
      const errors = validate(op, body);
      const drift = undocumented(op.schema, body);
      broken += errors.length ? 1 : 0;
      console.log(`${errors.length ? "FAIL" : drift.length ? "DRIFT" : "OK"}  ${op.id}`);
      const grouped = Map.groupBy(errors, (e) => e.replace(/\/\d+/g, "/*"));
      grouped.forEach((seen, e) => console.log(`      break: ${e}${seen.length > 1 ? ` (${seen.length} times)` : ""}`));
      drift.forEach((d) => console.log(`      undocumented: ${d}`));
    } catch (error) {
      broken++;
      console.log(`FAIL  ${op.id}: ${(error as Error).message}`);
    }
  }
  console.log(`\n${baseUrl()}: ${broken ? `${broken} operation(s) broken` : "contract holds"}`);
  if (broken) process.exitCode = 1;
}

/** Snapshots production into data/<timestamp>/. That folder holds PII and is git-ignored. */
async function pull() {
  const maxPages = Number(flags.pages ?? 5);
  const root = join("data", new Date().toISOString().replace(/[:.]/g, "-"));
  const save = (path: string, body: unknown) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
  };
  const fetchAll = async (id: string, path: string, values: Record<string, string>) => {
    const op = operation(id);
    for (let page = 1; page <= maxPages; page++) {
      await sleep(PAUSE_MS);
      const { body } = await send(op, { ...values, page: String(page), limit: PAGE_LIMIT });
      save(`${path}.page-${page}.json`, body);
      if (!(body as any).pagination?.hasMore) return;
    }
  };

  save("fleet.json", (await send(operation("getFleet"))).body);
  const list = (await send(operation("listClients"))).body;
  save("clients.json", list);
  const clients = clientList(list).filter((c) => !clientFlag || c.id === clientFlag);
  for (const { id, companyName } of clients) {
    console.log(`Pulling ${companyName}`);
    const values = { clientId: id };
    const dir = `clients/${id}`;
    try {
      for (const opId of ["getClientTenant", "listClientIntegrations", "getDispositionFormFields", "getOneApiStatus"]) {
        await sleep(PAUSE_MS);
        save(`${dir}/${opId}.json`, (await send(operation(opId), values)).body);
      }
      for (const opId of ["listCallContacts", "listCalloutLogs", "listSystemLogs", "listAuditLogs"]) {
        await fetchAll(opId, `${dir}/${opId}`, values);
      }
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
      console.log(`  skipped the rest: ${(error as Error).message}`);
    }
  }
  console.log(`Saved ${clients.length} client(s) to ${root}`);
}

async function call() {
  const op = operation(target);
  const values = Object.fromEntries(
    Object.entries(flags).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
  if (clientFlag) values.clientId = clientFlag;
  const { body } = await send(op, values, { confirm: flags.confirm === true });
  console.log(JSON.stringify(body, null, 2));
}

function list() {
  for (const op of operations) {
    console.log(`${op.safety.padEnd(9)} ${op.method.toUpperCase().padEnd(4)} ${op.id.padEnd(26)} ${op.path}`);
  }
}

const commands: Record<string, () => unknown> = { login, check, pull, call, list };
const run = commands[command];
if (!run) {
  console.log("Usage: npm run ca -- <list | login | call <operationId> | check | pull>");
  process.exit(command ? 1 : 0);
}
try {
  await run();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
