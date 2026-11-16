/**
 * Phase 16 (Design 2, Sprint/Initiative unification) — one-time migration.
 *
 * Two steps, both idempotent and both gated behind the same `--apply` flag:
 *
 *   Step 1. Copy every existing document in the `sprints` collection into a
 *   new document in the `initiatives` collection, **with the same `_id`**.
 *
 *   Step 2. Copy every existing `WorkItem.sprintId` value into
 *   `WorkItem.teamInitiativeId` (only where `teamInitiativeId` isn't already
 *   set — so re-running this after real post-migration usage never clobbers
 *   a value the app itself has since written). Step 1 alone is NOT
 *   sufficient: application code was renamed to read/write
 *   `WorkItem.teamInitiativeId` only, but the underlying Mongo documents for
 *   any WorkItem that already had a `sprintId` set before this phase still
 *   carry that value under the old field name — Mongoose schema changes
 *   don't rewrite existing documents. Without Step 2, every pre-existing
 *   Sprint-linked WorkItem would silently show "Backlog" forever, and the
 *   old `sprintId` value would become permanently orphaned (never read by
 *   any code path again). Step 2 closes that gap.
 *
 * Field mapping (Sprint → Initiative, Step 1):
 *   _id          -> _id            (preserved verbatim)
 *   organizationId -> organizationId
 *   teamId       -> teamId          (marks the Initiative "Team-run")
 *   name         -> name
 *   goal         -> sprintGoal
 *   startDate    -> startDate
 *   endDate      -> endDate
 *   status       -> sprintStatus    ("planned"/"active"/"completed" — same values)
 *   createdBy    -> createdBy
 *   createdAt/updatedAt -> createdAt/updatedAt
 *   (Initiative-only fields not present on Sprint — description,
 *   lifecycleStage, originatedFromKind/Id — are left at their schema
 *   defaults: "", null, null.)
 *
 * Field mapping (WorkItem, Step 2):
 *   sprintId (legacy, orphaned column) -> teamInitiativeId
 *   (old `sprintId` field is left in place afterward, untouched — see
 *   "don't destroy data" note below; it simply stays unread by any code
 *   path from this phase on.)
 *
 * This script is READ-MOSTLY and SAFE BY DEFAULT:
 *   - Uses the raw MongoDB driver (via `mongoose.connection.db`), not the
 *     `Sprint` Mongoose model — that model was deleted from the codebase
 *     as part of this same phase, so there is nothing to import it from.
 *   - Runs in **dry-run mode** unless you pass `--apply`: it will connect,
 *     read the `sprints` and `workitems` collections, print exactly what it
 *     *would* write, and exit without writing anything.
 *   - Idempotent: an `initiatives` document that already has the same `_id`
 *     as a `sprints` document is skipped (never overwritten); a `workitems`
 *     document whose `teamInitiativeId` is already set is skipped. Re-running
 *     this script after a partial run — or after the app has already been
 *     used post-migration — is safe.
 *   - Never touches or deletes the `sprints` collection, and never unsets
 *     the legacy `sprintId` field on `workitems` — old data is left in
 *     place, untouched, per the project's "don't destroy data" precedent
 *     (Non-Negotiable #5's spirit, applied here even though ChangeHistory
 *     itself isn't involved).
 *
 * ── This script has NOT been run against any database. Whoever picks this
 * ── up must run it manually against the target environment, described
 * ── below, before old Sprint-era WorkItem associations become visible
 * ── again in the app (both steps are required — Step 1 alone leaves every
 * ── pre-existing Sprint-linked WorkItem showing "Backlog").
 *
 * Usage (from the repo root, with a real `.env.local` present):
 *
 *   Dry run (default, no writes):
 *     npx tsx --env-file=.env.local scripts/migrate-sprints-to-initiatives.ts
 *
 *   Apply for real (writes to `initiatives` and `workitems`):
 *     npx tsx --env-file=.env.local scripts/migrate-sprints-to-initiatives.ts --apply
 *
 * `npx tsx` needs no permanent devDependency — it fetches the `tsx`
 * runner on demand via npx's package cache. `--env-file` is tsx's
 * passthrough to Node's native flag (Node 20.6+) for loading `MONGODB_URI`
 * out of `.env.local` without adding a `dotenv` dependency to the project.
 */

import mongoose from "mongoose";
import { connectDB } from "../src/lib/mongodb";

const APPLY = process.argv.includes("--apply");

type LegacySprintDoc = {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  name: string;
  goal?: string;
  startDate: Date;
  endDate: Date;
  status: "planned" | "active" | "completed";
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("No active database connection.");
  }

  const sprints = await db.collection<LegacySprintDoc>("sprints").find({}).toArray();
  console.log(`Found ${sprints.length} document(s) in the "sprints" collection.`);

  if (sprints.length === 0) {
    console.log("Nothing to migrate. Exiting.");
    return;
  }

  const initiatives = db.collection("initiatives");
  const existingIds = new Set(
    (
      await initiatives
        .find({ _id: { $in: sprints.map((s) => s._id) } }, { projection: { _id: 1 } })
        .toArray()
    ).map((d) => String(d._id))
  );

  let toInsert = 0;
  let toSkip = 0;

  for (const sprint of sprints) {
    const alreadyMigrated = existingIds.has(String(sprint._id));
    if (alreadyMigrated) {
      toSkip++;
      console.log(`  [skip] Sprint ${sprint._id} — an Initiative with this _id already exists.`);
      continue;
    }
    toInsert++;

    const initiativeDoc = {
      _id: sprint._id,
      organizationId: sprint.organizationId,
      name: sprint.name,
      description: "",
      teamId: sprint.teamId,
      sprintGoal: sprint.goal ?? "",
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      sprintStatus: sprint.status,
      lifecycleStage: null,
      originatedFromKind: null,
      originatedFromId: null,
      createdBy: sprint.createdBy,
      createdAt: sprint.createdAt ?? new Date(),
      updatedAt: sprint.updatedAt ?? new Date(),
    };

    if (APPLY) {
      await initiatives.insertOne(initiativeDoc);
      console.log(`  [inserted] Sprint ${sprint._id} -> Initiative ${sprint._id} ("${sprint.name}")`);
    } else {
      console.log(`  [dry-run] Would insert Initiative ${sprint._id} ("${sprint.name}"):`);
      console.log(`            ${JSON.stringify(initiativeDoc, null, 2).split("\n").join("\n            ")}`);
    }
  }

  console.log("");
  console.log(
    APPLY
      ? `Step 1 done. Inserted ${toInsert} Initiative document(s), skipped ${toSkip} already-migrated.`
      : `Step 1 dry run complete. Would insert ${toInsert} document(s), would skip ${toSkip} already-migrated.`
  );

  await migrateWorkItemReferences(db);

  console.log("");
  console.log(APPLY ? "All done." : "Dry run complete. Re-run with --apply to write for real.");
}

// Step 2 — see the file header comment for why this is required, not
// optional: Step 1 alone leaves every pre-existing Sprint-linked WorkItem's
// association orphaned under the old `sprintId` field name.
async function migrateWorkItemReferences(db: mongoose.mongo.Db) {
  const workItems = db.collection("workitems");

  // Only documents with a legacy `sprintId` set and no `teamInitiativeId`
  // set yet — the second half of that condition is what makes re-running
  // this safe after the app has already written real teamInitiativeId
  // values post-migration.
  const candidates = await workItems
    .find(
      { sprintId: { $ne: null, $exists: true }, teamInitiativeId: { $in: [null, undefined] } },
      { projection: { _id: 1, sprintId: 1, key: 1 } }
    )
    .toArray();

  console.log("");
  console.log(
    `Step 2: found ${candidates.length} WorkItem document(s) with a legacy sprintId and no teamInitiativeId set yet.`
  );

  if (candidates.length === 0) {
    console.log("Nothing to migrate. Exiting.");
    return;
  }

  let updated = 0;
  for (const doc of candidates as unknown as { _id: mongoose.Types.ObjectId; sprintId: mongoose.Types.ObjectId; key?: string }[]) {
    if (APPLY) {
      await workItems.updateOne({ _id: doc._id }, { $set: { teamInitiativeId: doc.sprintId } });
      console.log(`  [updated] WorkItem ${doc.key ?? doc._id} — teamInitiativeId <- ${doc.sprintId}`);
    } else {
      console.log(`  [dry-run] Would set WorkItem ${doc.key ?? doc._id} teamInitiativeId <- ${doc.sprintId}`);
    }
    updated++;
  }

  console.log(
    APPLY
      ? `Step 2 done. Updated ${updated} WorkItem document(s).`
      : `Step 2 dry run complete. Would update ${updated} document(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
