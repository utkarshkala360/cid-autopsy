// Applies db/schema.sql. Runs before `next build`, so every Vercel deploy is migrated.
import { readFile } from "node:fs/promises";
import { connect } from "./db.mjs";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!url) {
  if (process.env.VERCEL) {
    console.error("[migrate] DATABASE_URL is not set on Vercel. Add a database to the project.");
    process.exit(1);
  }
  console.warn("[migrate] DATABASE_URL not set; skipping migrations.");
  process.exit(0);
}

const sql = connect(url);
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

// A statement that needs a table lock waits at most this long, then retries a few times. A deploy
// stuck behind a session that never finishes (2026-11-19: orphaned page queries held ca_calls for
// 10 minutes and the build hung until it was cancelled) now fails quickly and names what blocks it.
const LOCK_TIMEOUT = "20s";
const TRIES = 4;

const blockers = () =>
  sql.query(`SELECT pid, state, wait_event, now() - query_start AS running_for, left(regexp_replace(query, '\\s+', ' ', 'g'), 100) AS query
    FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
      AND query_start < now() - interval '1 minute' ORDER BY query_start`);

for (const statement of statements) {
  for (let attempt = 1; ; attempt++) {
    try {
      // SET LOCAL keeps the timeout to this statement's transaction, so it never leaks through a pooler.
      await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        await tx.unsafe(statement);
      });
      break;
    } catch (error) {
      if (error?.code !== "55P03" || attempt >= TRIES) {
        if (error?.code === "55P03") {
          console.error(`[migrate] Gave up after ${TRIES} lock timeouts on:\n${statement.slice(0, 200)}`);
          console.error("[migrate] Sessions running over a minute, which may hold the lock:", await blockers().catch(() => []));
        }
        throw error;
      }
      console.warn(`[migrate] Lock timeout (${attempt}/${TRIES}), retrying: ${statement.slice(0, 80)}`);
    }
  }
}
console.log(`[migrate] Applied ${statements.length} statements.`);
