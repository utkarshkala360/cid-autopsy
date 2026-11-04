// Generates docs/api-reference.md: a curl command and a redacted sample response per operation.
// Edit the contract or a fixture, then run: npm run generate:reference
import { writeFileSync } from "node:fs";
import { MAX_ITEMS, curl, sample } from "../src/reference.ts";
import { operations, type Operation } from "../src/spec.ts";

const WARNINGS: Record<Operation["safety"], string> = {
  read: "",
  sensitive: "Issues a real recording link, valid for 5 minutes. Run it only when asked, and never log the link.",
  write: "Changes production data. Run it only with the owner's approval.",
  auth: "Part of the login flow. `sendOtp` places a real phone call.",
};

function section(op: Operation): string {
  const query = op.params.filter((p) => p.in === "query" && p.name !== "page" && p.name !== "limit");
  return [
    `### ${op.id}`,
    "",
    `${op.summary}. \`${op.method.toUpperCase()} ${op.path}\`. Safety: ${op.safety}. ` +
      (op.verified === "sample" ? "From a saved sample, not checked live." : `Checked live on ${op.verified}.`),
    ...(WARNINGS[op.safety] ? ["", `> ${WARNINGS[op.safety]}`] : []),
    ...(query.length ? ["", `Optional query: ${query.map((p) => `\`${p.name}\``).join(", ")}.`] : []),
    "",
    "```bash",
    curl(op),
    "```",
    "",
    "<details><summary>Sample response (redacted)</summary>",
    "",
    "```json",
    sample(op),
    "```",
    "",
    "</details>",
  ].join("\n");
}

const tags = [...new Set(operations.map((o) => o.tag))];
export const renderedReference = [
  "# CallAnchor API reference",
  "",
  "Generated from `openapi/callanchor.openapi.yaml` and `fixtures/` by",
  "`npm run generate:reference`. Do not edit by hand.",
  "",
  "Set these before running a command. The session comes from `npm run login`.",
  "",
  "```bash",
  "export CALLANCHOR_SESSION=$(cat .session)",
  "export CLIENT_ID=<client id>",
  "```",
  "",
  `Samples show the first ${MAX_ITEMS} items of each list. Every value in them is redacted.`,
  "",
  ...tags.flatMap((tag) => [`## ${tag}`, "", ...operations.filter((o) => o.tag === tag).flatMap((o) => [section(o), ""])]),
].join("\n");

if (import.meta.main) {
  writeFileSync("docs/api-reference.md", renderedReference);
  console.log("Wrote docs/api-reference.md");
}
