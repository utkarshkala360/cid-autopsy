// Turns the "CallAnchor x APIs" sheet export into redacted fixtures.
// The sheet holds production data, so nothing from it reaches the repo unredacted.
// Usage: npm run import:sheet -- "<path to csv>"
import { readFileSync, writeFileSync } from "node:fs";

const ROWS: Record<string, string> = {
  "Fetch All Clients": "listClients",
  "Fetch Client by ID": "getClient",
  "Fetch Client Data by ID": "getClientTenant",
  "Fetch INtegration for a Client": "listClientIntegrations",
  "Fetch All System Logs": "listSystemLogs",
  "Fetch All System Logs by CLient ID": "listSystemLogs.byClient",
  "Fetch All Audit Logs": "listAuditLogs",
  "Fetch All Audit Logs by Client id": "listAuditLogs.byClient",
  "Fetch Dashboard Summary": "getFleet",
  "Fetch Call Recording by Call ID": "getRecordingLink",
  "Get OneAPI Status": "getOneApiStatus",
  "Refresh OnePI": "backfillOneApi",
  "Get Syncing Request Data": "getAnchorLog",
  "Fetch Synced Record via ID": "getAnchorLog.recordingReady",
  "Send OTP - Dashboard": "sendOtp",
  "Verify OTP - Dashboard": "verifyOtp",
  "Fetch Dispositions": "getDispositionFormFields",
  "Fetch All CallRecords": "listCallContacts",
  "Fetch All Synced Records": "listCalloutLogs",
};

const NAME_KEYS = new Set([
  "companyName", "contactName", "agent", "agentName", "lastAgent", "name",
  "actorDisplayName", "viewerTeamMemberName",
]);
const NOT_PEOPLE = new Set(["Salesforce", "Zoho", "Hubspot", "Lead Square", "Unknown"]);
const FREE_TEXT_KEYS = new Set(["note", "dispositionNote"]);
const MAX_OPTIONS = 3; // the project picklist is a customer's whole portfolio

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const sheet = process.argv[2];
if (!sheet) throw new Error("Pass the path to the sheet's CSV export.");

const samples = parseCsv(readFileSync(sheet, "utf8")).filter((r) => ROWS[r[0]]);
const parsed = samples.map(([label, , body]) => {
  const json = JSON.parse(body.split(/^------/m)[0]);
  // The sheet shows a single element of the list here.
  return { file: ROWS[label], json: label === "Fetch All Clients" ? [json] : json };
});

// Names and customer domains are read from the data, so none are written in this script.
const names = new Set<string>();
const hosts = new Set<string>();
const collect = (value: unknown, key = ""): void => {
  if (Array.isArray(value)) {
    value.forEach((v) => collect(v, key === "agents" ? "agent" : ""));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collect(v, k);
  } else if (typeof value === "string") {
    if (NAME_KEYS.has(key) && !NOT_PEOPLE.has(value)) names.add(value);
    if (key === "endpoint" || key === "instanceUrl") {
      const host = /^https:\/\/([^./]+)\.my\.salesforce\.com/.exec(value)?.[1];
      if (host) hosts.add(host);
    }
  }
};
parsed.forEach((p) => collect(p.json));

const words = new Set<string>();
for (const name of names) {
  words.add(name);
  const first = name.split(/[\s']/)[0];
  if (first.length > 3) words.add(first);
}
const brand = [...names].filter((n) => / - /.test(n)).map((n) => n.split(" - ")[0]);
const ordered = [...words].sort((a, b) => b.length - a.length);

const seen = new Map<string, string>();
const alias = (kind: string, value: string, make: (n: number) => string) => {
  const key = `${kind}:${value}`;
  if (!seen.has(key)) {
    const n = [...seen.keys()].filter((k) => k.startsWith(`${kind}:`)).length + 1;
    seen.set(key, make(n));
  }
  return seen.get(key)!;
};
const fakePhone = (p: string) =>
  alias("phone", p.replace(/\D/g, "").slice(-10), (n) => `000000${String(n).padStart(4, "0")}`);

function scrubText(input: string): string {
  let s = input;
  s = s.replace(/https:\/\/[^\s"]*amazonaws\.com[^\s"]*/g, "https://recordings.example.test/file.m4a?X-Amz-Signature=REDACTED");
  s = s.replace(/(recordings\/play\?t=)[A-Za-z0-9_-]+/g, "$1REDACTED");
  s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (e) => alias("email", e, (n) => `user${n}@example.test`));
  s = s.replace(/\+91[\s-]?\d{5}[\s-]?\d{5}/g, (p) => `+91${fakePhone(p)}`);
  s = s.replace(/\b(phone-)?([6-9]\d{9})\b/g, (_, prefix = "", p) => `${prefix}${fakePhone(p)}`);
  s = s.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (ip) =>
    alias("ip", ip, (n) => `203.0.113.${n}`));
  s = s.replace(/\b(a0D|00T|006)[A-Za-z0-9]{15}\b/g, (id, prefix) =>
    alias("sfid", id, (n) => `${prefix}${String(n).padStart(15, "0")}`));
  for (const host of hosts) s = s.replaceAll(host, "acme");
  for (const word of ordered) s = s.replaceAll(word, alias("name", word, (n) => `Person ${n}`));
  for (const b of brand) {
    s = s.replaceAll(b, "Acme").replaceAll(b.toUpperCase(), "ACME").replaceAll(b.toLowerCase(), "acme");
  }
  return s;
}

function redact(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    const list = key === "options" ? value.slice(0, MAX_OPTIONS) : value;
    return list.map((v) => redact(v));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (obj.slug === "note" && k === "displayValue") out[k] = "<agent note>";
      else out[k] = redact(v, k);
    }
    return out;
  }
  if (typeof value !== "string") return value;
  if (FREE_TEXT_KEYS.has(key)) return "<agent note>";
  if (key === "profileImageUrl") return "/uploads/profile-images/redacted.jpg";
  if (value.includes("•")) return "•••";
  if (key === "payloadPreview" || key === "responsePreview" || key === "errorMessage") {
    try { return JSON.stringify(redact(JSON.parse(value)), null, 2); } catch { /* plain text */ }
  }
  return scrubText(value);
}

for (const { file, json } of parsed) {
  writeFileSync(`fixtures/${file}.json`, JSON.stringify(redact(json), null, 2) + "\n");
}
const denylist = [...ordered, ...brand, ...hosts, ...[...seen.keys()].map((k) => k.split(":").slice(1).join(":"))];
writeFileSync(".denylist", denylist.join("\n") + "\n", { mode: 0o600 });
console.log(`Wrote ${parsed.length} fixtures.`);
