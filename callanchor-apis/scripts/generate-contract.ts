// Writes the contract as JSON for the app, which can't read this YAML on Vercel.
// Each operation carries its curl command and redacted sample for the API console.
// Edit the contract, then run: npm run generate:contract
import { writeFileSync } from "node:fs";
import { curl, sample } from "../src/reference.ts";
import { components, operations } from "../src/spec.ts";

const withReference = operations.map((op) => ({ ...op, curl: curl(op), sample: sample(op) }));

export const renderedContract = JSON.stringify({ operations: withReference, components }, null, 2) + "\n";
if (import.meta.main) {
  writeFileSync("../lib/callanchor/contract.generated.json", renderedContract);
  console.log("Wrote lib/callanchor/contract.generated.json");
}
