import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { rendered } from "../scripts/generate-collection.ts";
import { renderedContract } from "../scripts/generate-contract.ts";
import { renderedReference } from "../scripts/generate-reference.ts";
import { operation, operations, undocumented, validate } from "../src/spec.ts";

const fixtures = readdirSync("fixtures").filter((f) => f.endsWith(".json"));
const load = (f: string) => JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));

for (const file of fixtures) {
  test(`${file} matches the contract`, () => {
    const op = operation(file.split(".")[0]);
    const body = load(file);
    assert.deepEqual(validate(op, body), []);
    assert.deepEqual(undocumented(op.schema, body), []);
  });
}

test("every operation has a fixture", () => {
  for (const op of operations) {
    assert.ok(fixtures.includes(`${op.id}.json`), op.id);
  }
});

test("a missing required field is a contract break", () => {
  const op = operation("getOneApiStatus");
  const { linked, ...rest } = load("getOneApiStatus.json");
  assert.equal(linked, true);
  assert.match(validate(op, rest).join(), /linked/);
});

test("an unknown field is reported as drift", () => {
  const op = operation("getOneApiStatus");
  assert.deepEqual(undocumented(op.schema, { ...load("getOneApiStatus.json"), newField: 1 }), ["/newField"]);
});

test("the app's copy of the contract is up to date", () => {
  const committed = readFileSync("../lib/callanchor/contract.generated.json", "utf8");
  assert.equal(committed, renderedContract, "Run: npm run generate:contract");
});

test("the Postman collection is up to date", () => {
  const committed = readFileSync("postman/callanchor.postman_collection.json", "utf8");
  assert.equal(committed, rendered, "Run: npm run generate:postman");
});

test("the curl reference is up to date", () => {
  const committed = readFileSync("docs/api-reference.md", "utf8");
  assert.equal(committed, renderedReference, "Run: npm run generate:reference");
});
