// Writes the contract as JSON for the app, which can't read this YAML on Vercel.
// Edit the contract, then run: npm run generate:contract
import { writeFileSync } from "node:fs";
import { components, operations } from "../src/spec.ts";

export const renderedContract = JSON.stringify({ operations, components }, null, 2) + "\n";
if (import.meta.main) {
  writeFileSync("../lib/callanchor/contract.generated.json", renderedContract);
  console.log("Wrote lib/callanchor/contract.generated.json");
}
