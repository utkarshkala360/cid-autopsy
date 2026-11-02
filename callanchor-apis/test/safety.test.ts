import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { send } from "../src/client.ts";
import { startMock } from "../src/mock.ts";
import { operation } from "../src/spec.ts";

const LEAKS: [string, RegExp][] = [
  ["real phone", /\+?91[6-9]\d{9}/],
  ["AWS key", /AKIA[A-Z0-9]{12,}/],
  ["S3 signature", /X-Amz-Signature=[0-9a-f]{16,}/],
  ["recording token", /play\?t=(?!REDACTED)/],
  ["session cookie", /callanchor_portal_session=[0-9a-f]{16,}/],
  ["non-test email", /[\w.+-]+@(?!example\.test)[\w-]+\.\w+/],
];
const tracked = [
  ...readdirSync("fixtures").map((f) => `fixtures/${f}`),
  "openapi/callanchor.openapi.yaml",
  "postman/callanchor.postman_collection.json",
  "postman/callanchor.postman_environment.json",
];

for (const file of tracked) {
  test(`${file} contains no secrets or PII`, () => {
    const text = readFileSync(file, "utf8");
    for (const [label, pattern] of LEAKS) assert.doesNotMatch(text, pattern, label);
    if (existsSync(".denylist") && file.startsWith("fixtures/")) {
      for (const word of readFileSync(".denylist", "utf8").split("\n")) {
        if (word.length > 4) assert.ok(!text.includes(word), "a real value from the sheet survived");
      }
    }
  });
}

let server: Server;
before(async () => {
  server = await startMock(4011);
  process.env.CALLANCHOR_BASE_URL = "http://localhost:4011";
});
after(() => server.close());

test("writes are refused without confirm, before any request is made", async () => {
  await assert.rejects(send(operation("backfillOneApi"), { clientId: "c1" }), /--confirm/);
});
