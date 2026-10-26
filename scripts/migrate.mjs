// Applies db/schema.sql. Runs before `next build`, so every Vercel deploy is migrated.
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!url) {
  if (process.env.VERCEL) {
    console.error("[migrate] DATABASE_URL is not set on Vercel. Add a Neon database to the project.");
    process.exit(1);
  }
  console.warn("[migrate] DATABASE_URL not set; skipping migrations.");
  process.exit(0);
}

const sql = neon(url);
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}
console.log(`[migrate] Applied ${statements.length} statements.`);
