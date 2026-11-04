import "server-only";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contract from "./contract.generated.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON Schema nodes are untyped here
type Schema = Record<string, any>;

export type Operation = {
  id: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  safety: "read" | "sensitive" | "write" | "auth";
  paginated: boolean;
  verified: string;
  params: { name: string; in: string }[];
  schema: Schema;
  /** curl command with shell variables for ids and the session. */
  curl: string;
  /** Redacted, trimmed sample response as JSON text. */
  sample: string;
};

export type ContractResult =
  | { state: "ok" }
  | { state: "drift"; fields: string[] }
  | { state: "fail"; errors: string[]; fields: string[] };

export const operations = contract.operations as Operation[];
const components = contract.components as Schema;

const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats(ajv);
ajv.addSchema({ $id: "spec", components });

const deref = (node: Schema): Schema =>
  node?.$ref ? deref(node.$ref.slice(2).split("/").reduce((n: Schema, k: string) => n[k], { components })) : node;

const anchored = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(anchored);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === "$ref" ? `spec${v}` : anchored(v)]));
  }
  return node;
};

function undocumented(schema: Schema, value: unknown, at = ""): string[] {
  const node = deref(schema);
  if (Array.isArray(value)) {
    return node.items ? [...new Set(value.flatMap((v) => undocumented(node.items, v, `${at}[]`)))] : [];
  }
  if (!value || typeof value !== "object" || !node.properties) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    node.properties[k] ? undocumented(node.properties[k], v, `${at}/${k}`) : [`${at}/${k}`],
  );
}

// Same rules as `ca check`: a break is a missing field or wrong type, drift is a new field.
export function compareWithContract(op: Operation, body: unknown): ContractResult {
  const check = ajv.compile(anchored(op.schema) as Schema);
  check(body);
  const errors = [
    ...new Set((check.errors ?? []).map((e) => `${(e.instancePath || "/").replace(/\/\d+/g, "/*")} ${e.message}`)),
  ];
  const fields = undocumented(op.schema, body);
  if (errors.length) return { state: "fail", errors, fields };
  return fields.length ? { state: "drift", fields } : { state: "ok" };
}
