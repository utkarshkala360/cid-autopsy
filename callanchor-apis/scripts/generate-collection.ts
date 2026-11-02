// Generates the Postman collection from the OpenAPI contract.
// Edit the contract, then run: npm run generate:postman
import { writeFileSync } from "node:fs";
import { operations, type Operation } from "../src/spec.ts";

const TAGS = ["Auth", "Fleet", "Clients", "Calls", "Sync", "Logs", "OneAPI"];
const BODIES: Record<string, string> = {
  sendOtp: '{\n  "identifier": "{{mobile}}",\n  "mode": "mobile"\n}',
  verifyOtp: '{\n  "identifier": "{{mobile}}",\n  "mode": "mobile",\n  "otp": "{{otp}}"\n}',
};
const SAVES_SESSION = [
  'const cookie = pm.cookies.get("callanchor_portal_session");',
  'if (cookie) pm.environment.set("sessionCookie", cookie);',
];
// Keep responses usable as inputs for the requests that need an id.
const CAPTURE: Record<string, string[]> = {
  listCalloutLogs: ['pm.environment.set("requestId", pm.response.json().items[0]?.requestId ?? "");'],
};

// A collection run must never call a phone, change data or issue a recording link.
const GUARD = [
  'if (pm.environment.get("allowLiveActions") !== "true") pm.execution.skipRequest();',
];

const fullPath = (op: Operation) => op.path.replace(/{(\w+)}/g, "{{$1}}");

function tests(op: Operation): string[] {
  const required = op.schema.required as string[] | undefined;
  return [
    'pm.test("status is 200", () => pm.response.to.have.status(200));',
    ...(required
      ? [`pm.test("has required fields", () => pm.expect(pm.response.json()).to.include.keys(${JSON.stringify(required)}));`]
      : []),
    ...(op.id === "verifyOtp" ? SAVES_SESSION : []),
    ...(CAPTURE[op.id] ?? []),
  ];
}

function item(op: Operation) {
  const query = op.params.filter((p) => p.in === "query").map((p) => ({
    key: p.name,
    value: p.name === "page" ? "1" : p.name === "limit" ? "50" : "{{clientId}}",
    disabled: p.name === "clientId",
  }));
  const queryString = query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join("&");
  const body = BODIES[op.id];
  return {
    name: op.id,
    request: {
      method: op.method.toUpperCase(),
      description: `${op.summary}. Safety: ${op.safety}.`,
      header: [
        ...(op.safety === "auth" ? [] : [{ key: "Cookie", value: "callanchor_portal_session={{sessionCookie}}" }]),
        ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
      ],
      ...(body ? { body: { mode: "raw", raw: body } } : {}),
      url: {
        raw: `{{baseUrl}}${fullPath(op)}${queryString ? `?${queryString}` : ""}`,
        host: ["{{baseUrl}}"],
        path: fullPath(op).split("/").filter(Boolean),
        ...(query.length ? { query } : {}),
      },
    },
    event: [
      ...(op.safety === "read" ? [] : [{ listen: "prerequest", script: { type: "text/javascript", exec: GUARD } }]),
      { listen: "test", script: { type: "text/javascript", exec: tests(op) } },
    ],
  };
}

const collection = {
  info: {
    name: "CallAnchor Portal API",
    description: "Generated from openapi/callanchor.openapi.yaml. Do not edit by hand.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: TAGS.map((name) => ({ name, item: operations.filter((o) => o.tag === name).map(item) })),
};

export const rendered = JSON.stringify(collection, null, 2) + "\n";
if (import.meta.main) {
  writeFileSync("postman/callanchor.postman_collection.json", rendered);
  console.log("Wrote postman/callanchor.postman_collection.json");
}
