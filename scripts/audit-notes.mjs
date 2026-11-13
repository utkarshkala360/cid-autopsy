// Auditors' notes for the weekly dashboard review.
//   npm run audit:notes              print open notes as Markdown
//   npm run audit:notes -- --days 7  print every note from the last 7 days, any status
//   npm run audit:notes -- --mark 12,15 done "What changed" --commit HEAD
//                                    set the status (done, wontfix or open) and resolution of notes;
//                                    --commit adds that commit's short hash to the resolution
import { execFileSync } from "node:child_process";
import { connect } from "./db.mjs";

const STATUSES = ["open", "done", "wontfix"];
const args = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function option(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) fail(`${name} needs a value.`);
  args.splice(i, 2);
  return value;
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) fail("DATABASE_URL is not set.");
const sql = connect(url);

const markIds = option("--mark");
if (markIds !== undefined) await mark(markIds);
else await print();

async function mark(idList) {
  const commitRef = option("--commit");
  const [status, text, ...rest] = args;
  if (rest.length) fail(`Unexpected arguments: ${rest.join(" ")}. Quote the resolution text.`);
  const ids = idList.split(",").map((s) => s.trim());
  if (!ids.every((id) => /^\d+$/.test(id))) fail("--mark needs note ids, like 12 or 12,15.");
  if (!STATUSES.includes(status)) fail(`Status must be one of: ${STATUSES.join(", ")}.`);
  const note = (text ?? "").trim();
  if (status !== "open" && !note) fail("Say what changed: --mark <ids> <status> \"resolution\".");

  let resolution = note || null;
  if (commitRef) {
    let hash;
    try {
      hash = execFileSync("git", ["rev-parse", "--short", "--verify", `${commitRef}^{commit}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      fail(`${commitRef} isn't a commit in this repo.`);
    }
    resolution = `${resolution ?? ""}${resolution ? " " : ""}(commit ${hash})`;
  }
  resolution = resolution?.slice(0, 2000) ?? null;

  // Same rules as setAuditNoteStatusAction in app/admin/actions.ts.
  const rows = await sql`
    UPDATE audit_notes
    SET status = ${status},
        resolution = COALESCE(${resolution}, resolution),
        resolved_at = CASE WHEN ${status} = 'open' THEN NULL ELSE COALESCE(resolved_at, now()) END
    WHERE id = ANY(${ids.map(Number)}::bigint[])
    RETURNING id, status, resolution`;

  for (const r of rows) console.log(`#${r.id} → ${r.status}${r.resolution ? `: ${r.resolution}` : ""}`);
  const missing = ids.filter((id) => !rows.some((r) => String(r.id) === id));
  if (missing.length) fail(`No note with id ${missing.join(", ")}.`);
}

async function print() {
  const daysArg = option("--days");
  if (args.length) fail(`Unexpected arguments: ${args.join(" ")}.`);
  const days = daysArg === undefined ? null : Number(daysArg);
  if (days !== null && !(days > 0)) fail("--days needs a positive number.");

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
}
