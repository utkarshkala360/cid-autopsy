import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

type Schema = Record<string, any>;

export type Operation = {
  id: string;
  method: "get" | "post";
  path: string;
  tag: string;
  summary: string;
  safety: "read" | "sensitive" | "write" | "auth";
  paginated: boolean;
  params: { name: string; in: string }[];
  schema: Schema;
};

const doc = parse(readFileSync(new URL("../openapi/callanchor.openapi.yaml", import.meta.url), "utf8"));
const deref = (node: Schema): Schema =>
  node?.$ref ? deref(node.$ref.slice(2).split("/").reduce((n: Schema, k: string) => n[k], doc)) : node;

export const operations: Operation[] = Object.entries<Schema>(doc.paths).flatMap(([path, item]) =>
  (["get", "post"] as const).filter((m) => item[m]).map((method) => {
    const op = item[method];
    return {
      id: op.operationId,
      method,
      path,
      tag: op.tags[0],
      summary: op.summary,
      safety: op["x-safety"],
      paginated: Boolean(op["x-paginated"]),
      params: [...(item.parameters ?? []), ...(op.parameters ?? [])].map(deref).map((p: Schema) => ({ name: p.name, in: p.in })),
      schema: op.responses["200"].content["application/json"].schema,
    };
  }),
);

export function operation(id: string): Operation {
  const op = operations.find((o) => o.id === id);
  if (!op) throw new Error(`Unknown operation "${id}". Run: npm run ca -- list`);
  return op;
}

const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats.default(ajv);
ajv.addSchema({ $id: "spec", components: doc.components });

const anchored = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(anchored);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) =>
      [k, k === "$ref" ? `spec${v}` : anchored(v)]));
  }
  return node;
};

/** Contract breaks: a required field is gone, or a value has the wrong type. */
export function validate(op: Operation, body: unknown): string[] {
  const check = ajv.compile(anchored(op.schema) as Schema);
  check(body);
  return (check.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
}

/** Drift: fields the API returns that the contract doesn't describe yet. */
export function undocumented(schema: Schema, value: unknown, at = ""): string[] {
  const node = deref(schema);
  if (node.oneOf) {
    const match = node.oneOf.map(deref).find((s: Schema) => Array.isArray(value) === (s.type === "array"));
    return match ? undocumented(match, value, at) : [];
  }
  if (Array.isArray(value)) {
    return node.items ? [...new Set(value.flatMap((v) => undocumented(node.items, v, `${at}[]`)))] : [];
  }
  if (!value || typeof value !== "object" || !node.properties) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    node.properties[k] ? undocumented(node.properties[k], v, `${at}/${k}`) : [`${at}/${k}`]);
}
