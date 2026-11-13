import "server-only";
import postgres from "postgres";

// The portal's Postgres (Supabase, Mumbai). postgres.js over Supabase's transaction pooler: prepared
// statements are off because the pooler hands each transaction to any server connection.
//
// `db()` keeps the shape the code was written against: a tagged template that returns rows, plus
// `query(text, params)` for SQL built as a string.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- rows as the driver returns them
type Sql = postgres.Sql & { query: (text: string, params?: unknown[]) => Promise<Row[]> };

let client: Sql | undefined;

// postgres.js runs JSON.stringify on every json/jsonb parameter, so JSON text the code already
// stringified would be stored as one JSON string. Pass text through as it is, as the Neon driver did.
export const JSON_TYPES = {
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value)),
    parse: (text: string) => JSON.parse(text),
  },
};

// Supabase tags its pooler URL with `supa=…`, which postgres.js would send to the server as a setting.
export function databaseUrl() {
  const raw = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!raw) return raw;
  const url = new URL(raw);
  url.searchParams.delete("supa");
  return url.toString();
}

// Lazily created so `next build` doesn't need DATABASE_URL.
export function db(): Sql {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set.");
    // A page reads several things at once and pulls run 4 streams at a time, so allow a few connections.
    const sql = postgres(url, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 15, types: JSON_TYPES });
    client = Object.assign(sql, {
      query: (text: string, params: unknown[] = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]) as unknown as Promise<Row[]>,
    });
  }
  return client;
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
