// The database client for scripts: postgres.js, shaped like lib/db.ts (a tagged template, plus
// `query(text, params)`). A short idle timeout lets the script exit when it's done.
import postgres from "postgres";

export const databaseUrl = () => process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

// Supabase tags its pooler URL with `supa=…`, which postgres.js would send to the server as a setting.
const clean = (raw) => {
  const url = new URL(raw);
  url.searchParams.delete("supa");
  return url.toString();
};

// postgres.js runs JSON.stringify on every json/jsonb parameter; pass JSON text through, as lib/db.ts does.
const types = {
  json: { to: 114, from: [114, 3802], serialize: (v) => (typeof v === "string" ? v : JSON.stringify(v)), parse: (t) => JSON.parse(t) },
};

export function connect(url = databaseUrl()) {
  const sql = postgres(clean(url), { prepare: false, max: 1, idle_timeout: 1, connect_timeout: 15, onnotice: () => {}, types });
  return Object.assign(sql, { query: (text, params = []) => sql.unsafe(text, params) });
}
