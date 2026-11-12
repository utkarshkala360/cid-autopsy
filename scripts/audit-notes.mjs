// Prints auditors' notes as Markdown for the weekly dashboard review. Read-only.
//   npm run audit:notes              open notes
//   npm run audit:notes -- --days 7  every note from the last 7 days, any status
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const i = process.argv.indexOf("--days");
const days = i > -1 ? Number(process.argv[i + 1]) : null;
if (days !== null && !(days > 0)) {
  console.error("--days needs a positive number.");
  process.exit(1);
}

const sql = neon(url);
const notes = days
  ? await sql`
      SELECT n.*, m.full_name FROM audit_notes n LEFT JOIN members m ON m.id = n.member_id
      WHERE n.created_at > now() - make_interval(days => ${days})
      ORDER BY n.path, n.created_at`
  : await sql`
      SELECT n.*, m.full_name FROM audit_notes n LEFT JOIN members m ON m.id = n.member_id
      WHERE n.status = 'open'
      ORDER BY n.path, n.created_at`;

console.log(`# Audit notes (${days ? `last ${days} days` : "open"}): ${notes.length}\n`);
let path = null;
for (const n of notes) {
  if (n.path !== path) {
    path = n.path;
    console.log(`## ${path}\n`);
  }
  const m = n.metadata ?? {};
  console.log(`### #${n.id} · ${n.kind} · ${n.status} · ${n.full_name ?? n.author} · ${n.created_at.toISOString()}`);
  console.log(`- URL: ${n.url}${m.host ? ` (${m.host})` : ""}`);
  if (m.heading || n.page_title) console.log(`- Page: ${m.heading || n.page_title}`);
  if (m.selection) console.log(`- Highlighted: "${m.selection.replace(/\s+/g, " ")}"`);
  if (m.viewport) console.log(`- Viewport: ${m.viewport}`);
  if (n.resolution) console.log(`- Resolution: ${n.resolution}`);
  console.log(`\n${n.comment}\n`);
}
