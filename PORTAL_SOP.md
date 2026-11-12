# Portal SOP

The living record of how we run and improve this portal. It grows from the owner's questions and
feedback. `AGENTS.md` makes it required reading for every task.

## How this file works

When the owner asks a question or gives feedback, update this file in the same turn if the exchange
changed anything:

| What came up | Where it goes |
| --- | --- |
| A rule or process the owner confirmed | [SOP](#sop) |
| A pattern that worked and should be repeated | [Happy implementation](#happy-implementation) |
| An idea from the agent, not yet agreed | [Recommendations](#recommendations) |
| A concrete change to the portal | [Portal changes](#portal-changes) |
| Any feedback at all, in one line | [Feedback log](#feedback-log) |

- Only the owner's word makes something a rule. Agent ideas stay in Recommendations until then.
- Edit entries in place and delete ones that no longer hold, so this stays short and current. The
  Feedback log is the only history.
- Listing a portal change is not permission to build it. Build when the owner asks.
- Link to the code or docs instead of copying them. `README.md` owns architecture and setup, and
  `callanchor-apis/docs/open-questions.md` owns unanswered CallAnchor questions.
- This file is committed. Never put customer data, recording links, cookies or other secrets in it.

## SOP

Rules already established in this repo.

- Commit and push straight to `main`, only when the owner asks. Vercel deploys from `main`.
- Every page and server action re-checks the session, even though `proxy.ts` also checks it.
- CallAnchor pages and actions call `requireCallAnchorSession()`.
- The API console (`call_anchor_config/apis`) is for members with the Admin role only. Its page and
  action call `requireApiConsoleAccess()`, others get a 404 and don't see the link. Roles are set in
  the Admin Console (owner, 2026-11-05).
- The CallAnchor contract changes in `callanchor-apis/openapi/callanchor.openapi.yaml` first, then
  gets regenerated. Generated files are never edited by hand.
- CallAnchor GET APIs may be used freely to pull data. Any non-GET call needs the owner's approval
  first (owner, 2026-11-03).
- Never run `sendOtp`, a write operation or `getRecordingLink` against production unless the owner
  asked for that specific action. `sendOtp` calls a real phone.
- When exploring the live CallAnchor app, act only on the client the owner names, for example
  `/support/clients/cmus74leshej2ewwgii5qaycf?tab=calls`, so a mistaken update can't reach another
  client (owner, 2026-11-05).
- Never call `reveal-auth`: it returns a stored CRM credential. The full endpoint list, with reads
  and writes split, is `callanchor-apis/docs/endpoint-inventory.md`.
- CallAnchor data is stored, not re-pulled from scratch. Visits pull only what's new since each
  stream's saved milestone. The trailing 5 days are refreshed once a day, and every pull saves its new
  milestone (owner, 2026-11-03). See `lib/callanchor/store.ts`.
- A CRM sync succeeded when the CRM replied 2xx, even if CallAnchor marked the callout failed.
  `call.completed` and `recording.ready` both count as the call reaching the CRM, so either one syncs
  its recording (owner, 2026-11-04). See `crmStatus` in `lib/callanchor/labels.ts`.
- `recording.ready` and `call.completed` are both valid syncs: `recording.ready` is sent for a call
  that connected and was recorded (a few seconds or more), `call.completed` for a missed incoming or
  rejected outgoing call. A call that got either one reached the CRM (owner, 2026-11-05).
- A call that didn't connect isn't a recording risk: `hasRecording: false` with `durationSeconds: 0`
  is a missed incoming or rejected outgoing call, with nothing to record. Such a call (0 seconds in its
  CRM payload; without one, ingest `callType` missed or rejected, or synced only by `call.completed`)
  stays out of "not recorded" and "Phone isn't recording calls" (owner, 2026-11-05). See
  `isUnconnected` in `lib/callanchor/issues.ts`.
- Mobile, CRM and portal events are stored linked to each other by client, license, call, CRM
  platform and callout request, so they can be searched and analysed together (owner, 2026-11-05).
- Health rules use plain elapsed time, judged day by day. No working-hours or working-day filter
  (owner, 2026-11-05).
- Health thresholds are configurable on the health Settings page, fleet-wide. Defaults are `RULES` in
  `lib/callanchor/issues.ts`; saved values live in `ca_health_settings` (owner, 2026-11-05). Settings
  is for admins only: page and action call `requireHealthAdmin()`, others get a 404 and no link
  (owner, 2026-11-12).
- A client can be marked internal (our own test and demo accounts). Its calls, licenses and seats
  are hidden from every cross-client health view until "Show internal clients" is ticked in the left
  menu; a client or phone opened by id still shows (owner, 2026-11-12). Every client starts External;
  only admins change it, with the "Mark as Internal" / "Mark as External" button on Customers or the
  client's health page, always after a confirmation. Status shows as a coloured tag (Internal amber,
  External green), never a bare checkbox. Customers also hides internal ones behind a "Show internal"
  filter (owner, 2026-11-12). See `components/InternalMark.tsx`; flags live in `ca_client_flags`.
- Every client CallAnchor lists is a customer with product CallAnchor, linked by
  `customers.callanchor_client_id`, added on its own after each snapshot pull (`ca_map_customers()`)
  (owner, 2026-11-12).
- Health pages share a left menu: the health views first, then the open page's sections (owner,
  2026-11-12).
- Seat use (purchased, assigned, logged in, calling, unused) has its own Seats tab, not issue cards.
  Unused seats aren't issues (owner, 2026-11-05).
- CRM replies are custom code written per client, so their text is never a reliable error
  identifier. Severity comes from CallAnchor and HTTP signals (status code, no response, retries,
  missing events, timing). Reply text is shown as evidence only, until owner-curated suggestions and
  a structured reply layout exist (owner, 2026-11-04).
- Every error, flag and count on the health pages opens the items behind it, one row per item, down
  to a single call's timeline (owner, 2026-11-04).
- Anything with metadata shows it in full next to the error: a callout's payload, endpoint, every
  attempt and the CRM's reply, and a log line's metadata (owner, 2026-11-04).
- Auditor is a member permission on top of the role, set in the Admin Console. Auditors leave notes
  on any page through the Audit note button; each saves the page URL and context to `audit_notes`.
  The owner reviews them with the agent weekly to improve the dashboard: start from
  `npm run audit:notes`, and mark each note done or won't fix with what changed (owner, 2026-11-12):
  `npm run audit:notes -- --mark <ids> done "what changed" --commit <hash>`, after the fix is
  committed. Notes are never deleted; `--days 7` shows closed ones too.
- Commit only redacted fixtures. `npm test` in `callanchor-apis/` must pass before a commit there.

## Happy implementation

What a good change looks like here.

- New sub apps follow "Adding a sub app" in `README.md`.
- Salesforce access goes through `withStoredOrg`, not a new client.
- Secrets are encrypted at rest and never sent back to the browser.
- Profile live CallAnchor data before designing a view. Print counts and shapes only, never
  customer data. The health dashboard's design came from this.
- Read CallAnchor through `getJson` in `lib/callanchor/portal.ts`, which can only send GET.
- Show CRM errors grouped and masked with `mask()`/`deliveryLabel()` in `lib/callanchor/labels.ts`.
  Raw errors can contain phone numbers and agents' free-text notes.
- Store derived, masked data rather than raw CallAnchor responses, with one exception: system log
  lines are stored whole (`raw`), because CallAnchor drops them after about 3 days. Callout payloads
  and CRM replies are read live from `anchor-logs/{requestId}` when a call is opened, never stored.
  Summaries read `LOG_COLUMNS`, never `raw`.
- Health rules live in `lib/callanchor/issues.ts`. A count and the call list it opens use the same
  `CALL_STAGES` test, so they can't disagree. Add a stage there, not a second filter in SQL.
- Per-call questions read `ca_calls`, which `ca_refresh_calls()` rebuilds after each save. Don't
  rebuild call state from all logs on a page.
- Link a health number to its items with a `Drill` and `itemsHref()`; the items page
  (`health/items`) reads the store with the same filters, and `health/calls/<id>` shows one call.
- Build health page blocks with `Section` or `Collapsed` (`health/parts.tsx`): they carry the anchor
  the left menu's "On this page" lists. Any other block needs `id` and `data-section` to show there.
- A cross-client view filters internal clients through `internalScope()` in `health.ts`, or
  `hideInternal` on the store's item queries; never a second list of ids.
- Run slow background work, like the 5-day refresh, with `after()`, so it doesn't block the page.
- To make a threshold editable, add it to `SETTINGS` in `lib/callanchor/issues.ts`; every loader in
  `health.ts` calls `loadSettings()` first, so pages and actions see the saved values.
- Give every client and phone the same three numbers (`Pulse` in `lib/callanchor/issues.ts`): last good
  CRM sync, synced days out of days with due calls (7 and 30 days, as a day strip), and the recording
  chain. Judge each against its own history and absolute limits; other phones are only a hint.
- "Reached the CRM" is delivered out of due (`CALL_STAGES.due`) everywhere. Day counts come from SQL
  (`readDaily`), so `RECORDED_SQL` and `dueOf` must agree with the stage tests.
- A drop that loses data (a recording not uploaded, verified but not synced, a call never sent) stays
  flagged until it's fixed, back 30 days (`readOpenCalls`), not only for 24 hours. A rate problem says
  how many days it has run.
- Link events through `lib/callanchor/links.ts`: `callFacts()` reads a callout's payload preview
  (type, length, recording, start, agent last 4; never the recording URL) and `auditLinks()` finds the
  license, platform and callout a portal event names. `ca_events` (`db/schema.sql`) is every stored
  event in one shape with those keys; search and cross-stream views read it, not the three tables.
- A call without a stored ingest log gets its phone from the payload's agent number, only when exactly
  one of the client's licenses ends in those 4 digits. `license_via` says which way it was linked.
- To fill a new column on stored rows, set `ca_sync_state.backfill_from` in the migration. The stream's
  next background refresh reads back to it once, so no page waits on it.
- Verify engine changes against the store with a read-only stand-in for `lib/db.ts` that refuses
  anything but SELECT, and schema changes in an in-process Postgres (PGlite), never on the shared DB.
- A new CallAnchor read goes: capture it live into `callanchor-apis/data/` (git-ignored), add it to
  the contract, write a redacted fixture and add the real values to `.denylist`, run the three
  `generate:*` scripts, then `ca check`. The curl reference and Postman samples come from the
  fixtures, so they're never written by hand.

## Recommendations

Agent proposals awaiting the owner's decision. Newest first.

| Date | Recommendation | Why | Status |
| --- | --- | --- | --- |
| 2026-11-12 | Give "phone couldn't save the recording" its own issue, apart from "Recordings stuck on the phone" | 12 stored calls have `mobile.recording.mark-unavailable`: the phone found no file, so waiting won't help. They still count as stuck on the phone (only the reason is shown now); the fix is the phone's microphone permission or dialer recording setting | Awaiting owner |
| 2026-11-12 | Decide what deleting an auto-added CallAnchor customer means | `ca_map_customers()` adds it back on the next snapshot pull. Either block deleting them, or keep a "not a customer" mark | Awaiting owner |
| 2026-11-05 | Alerts for new critical issues and a phone with no sync, by Slack or email (QA O1) | Nobody is told until someone opens the page. Needs a channel and the scheduled pull | Awaiting owner |
| 2026-11-05 | Get a CallAnchor role that can read `click-to-call-logs`, `bulk-dial-logs`, app builds, log retention and support users, and sample `licenses/{id}/history` on a client with licenses | Our `support_agent` login gets 403 on them, so they have no sample or contract entry. See "What our login can't read" in `callanchor-apis/docs/endpoint-inventory.md` | Awaiting owner |
| 2026-11-04 | Limit who sees raw payloads and log metadata | They carry customer phone numbers, agents' notes, actor emails and IPs, and every member with a CallAnchor login can open them | Awaiting owner |
| 2026-11-05 | Decide the open points in `docs/client-health-plan.md` section 10: whether license issues alert alone, acknowledge and notes, how suggestions get added | Working hours and thresholds are settled (no filter; Settings tab) | Awaiting owner |
| 2026-11-03 | Give local dev its own Neon branch (set a branch `DATABASE_URL` in `.env.local` and Vercel's Development env) | Local, preview and production all use the same database, so a local visit moves the live milestones and writes live rows, and local schema changes hit production at once | Awaiting owner |
| 2026-11-03 | Raise the S3 purge failure with CallAnchor | Every post-sync S3 deletion failed (0 of 228 succeeded on 3 Nov): their AWS user lacks `s3:DeleteObject`, and the logs mark it `info`. Recordings stay in S3 longer than intended | Awaiting owner |
| 2026-11-03 | Pull on a schedule (Vercel cron) as well as on visits (QA D3) | Data only moves when someone opens the dashboard: 6.5 hours stale on 5 Nov, and an unvisited weekend loses logs for good beyond CallAnchor's ~3-day retention. Needs unattended access (open question 1) | Awaiting owner |
| 2026-11-03 | Confirm 90-day retention for the stored health data | Older rows are deleted to keep the tables small | Awaiting owner |
| 2026-11-03 | Review `OPPORTUNITY_NOT_FOUND` with the affected client | It was the top CRM error fleet-wide on 3 Nov, so data matching, not an outage, drives the worst sync rates (open question 5) | Awaiting owner |
| 2026-11-02 | Rotate the session cookie exposed in the "CallAnchor x APIs" sheet and restrict access to the sheet | It also holds recording links, customer phone numbers and an AWS access key ID | Awaiting owner |

## Portal changes

Agreed changes. Newest first. Status is Planned, In progress or Done.

| Date | Change | Status | Link |
| --- | --- | --- | --- |
| 2026-11-12 | Audit notes 1–7: phone's "recording unavailable" reason on calls (`ca_calls.unavailable_at`/`unavailable_reason`, items page, call problem and journey); "CRM reply" heading for delivered syncs; license issue titles link to their rows (client and licenses pages); left menu for health pages with "On this page" sections, replacing the tabs; internal clients with Mark internal (admins) and Show internal clients; Settings admins only; CallAnchor clients become customers with a Product column | Done, pushed 2026-11-12 (`b27945b`); notes 1–7 marked done. Not yet viewed signed in. The deploy's migration adds all 54 clients as customers | `health/HealthNav.tsx`, `health/actions.ts`, `db/schema.sql` |
| 2026-11-12 | `npm run audit:notes -- --mark <ids> <done\|wontfix\|open> "what changed" [--commit <ref>]` closes notes from the review, same rules as the admin page; `--commit` adds the short hash to the resolution | Done, pushed 2026-11-12 (`b27945b`) | `scripts/audit-notes.mjs` |
| 2026-11-12 | Auditor permission: Admin Console checkbox on create and Make/Remove auditor per member; floating Audit note button on member pages (type, comment, highlighted text) saving URL, title, heading, query, viewport, browser and host to `audit_notes`; `/admin/audit-notes` review page with open/done/won't fix; `npm run audit:notes` for the weekly review | Done, pushed 2026-11-12 (`c882582`); tables created by that deploy. Not yet viewed signed in | `components/AuditNoteButton.tsx`, `app/admin/(console)/audit-notes/`, `scripts/audit-notes.mjs` |
| 2026-11-05 | Global search bar in CallAnchor Config over `ca_events`, for quick search and analysis | Planned; owner said it comes next | |
| 2026-11-05 | Linked events: callouts keep their call's type, length, recording flag, start and agent last 4 from the payload; calls with no ingest log get their phone from the agent number; portal events (audit log) stored as a stream, linked to license, integration and callout; `ca_events` view joins all three; "didn't connect" now uses the real call length; call page shows the call facts, license page its portal events | Done in code, checked in PGlite; not applied to the shared DB (the agent's apply was blocked) and not pushed. Applies on the next deploy; the next dashboard visit then backfills stored callouts and 90 days of portal events in the background | `lib/callanchor/links.ts`, `db/schema.sql`, `lib/callanchor/store.ts` |
| 2026-11-05 | Calls that didn't connect (missed, rejected, or synced only by `call.completed`) no longer count as "not recorded" or toward "Phone isn't recording calls"; new `notConnected` stage; `ca_calls.call_type` from the ingest log, shown on the items page | Done; column and backfill applied to the shared DB (not recorded: 4,372 → 109). Not pushed | `isUnconnected` in `lib/callanchor/issues.ts`, `db/schema.sql` |
| 2026-11-05 | API console for admins only: new member role `admin`, settable on create and per member in the Admin Console; console page, run action and its link gated | Done; role constraint applies on the next deploy, then set your own role to Admin | `requireApiConsoleAccess` in `lib/callanchor/session.ts`, `app/admin/` |
| 2026-11-05 | Owner's QA answers: both sync events valid (R3 note removed); no working-hours filter, elapsed time day by day; Settings tab for 13 thresholds; Seats tab with seat use per client and every unused seat since when (seat notes left the issue lists); Clients / Licenses / Seats / Settings tabs | Done; `ca_health_settings` applies on the next deploy. Not yet viewed signed in | `health/settings/`, `health/seats/`, `SETTINGS` in `lib/callanchor/issues.ts` |
| 2026-11-05 | QA follow-up: last good sync, synced days and recording chain for every client and phone; one "reached the CRM" (delivered out of due); recordings and unsent calls flagged until fixed; 5-minute grace for server steps; "since" from the run of bad days; issue episodes tied to the data; phone rules that work with one phone; seat use; integration changes recorded and each integration checked alone; duplicate 2xx flagged; fleet stall; inactive clients muted; issue cards open their rows with the evidence above; "new since your last visit"; trials section; busy-client log streams chosen by stored calls | Done; schema applies on the next deploy. Not yet viewed signed in | `docs/client-health-qa.md` §14, `lib/callanchor/issues.ts` |
| 2026-11-05 | CallAnchor contract 17 → 29 operations, checked live: 12 new reads (callee, AI insights, AI credits, seat compliance and settings, disposition sets, portal admins, notifications, onboarding, audit log entry, `auth/me`, latest app build) and new fields on tenant, call contacts and disposition fields. Every operation now has a generated curl and redacted sample (`docs/api-reference.md`), and every Postman request carries its sample response. The API console page shows each operation's curl and sample too (`src/reference.ts` feeds both) | Done; console not yet viewed signed in, not pushed | `callanchor-apis/openapi/`, `callanchor-apis/docs/api-reference.md` |
| 2026-11-05 | Client health plan, all four phases: fixes A, E, F, J; calls linked to licenses through `metadata.licenseId`; `ca_calls`, `ca_licenses` (with change history), `ca_issue_state`, `ca_reply_suggestions`; issue engine; fleet triage, client page redesign, licenses, license and issue pages, call journey; coverage line; own log streams for the 3 busiest clients | Done, schema applied to the shared DB; not yet viewed signed in. License statuses fill in as new mobile logs are pulled | `docs/client-health-plan.md` §11, `lib/callanchor/issues.ts`, `app/dashboard/(app)/call_anchor_config/health/` |
| 2026-11-04 | Full payloads and metadata: call pages read each CRM request live (payload, endpoint, attempts, replies, errors); log lines are stored whole and shown with their metadata; CRM sync log lines now join their call through `metadata.callRecordId` | Done, not yet viewed signed in. Older rows fill in on the next background 5-day refresh | `health/calls/[callId]/`, `lib/callanchor/store.ts`, `db/schema.sql` |
| 2026-11-04 | Item-level drill-down: every flag, error, outcome and count links to its rows (syncs, recordings, system logs), with per-call timelines | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor_config/health/items/`, `health/calls/[callId]/` |
| 2026-11-04 | Count a 2xx CRM reply as success, and either `call.completed` or `recording.ready` as a synced recording | Done | `lib/callanchor/labels.ts`, `lib/callanchor/health.ts` |
| 2026-11-03 | Store health data in Postgres and pull only what's new from each stream's milestone; refresh the last 5 days once a day | Done; tables exist in the shared Neon DB (local `predev` migrated them) | `lib/callanchor/store.ts`, `db/schema.sql` |
| 2026-11-03 | Client health dashboard: consolidated and per-client view of calls, recordings, uploads, CRM syncs, CRM replies and errors | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor_config/health/` |

## Feedback log

One line per piece of feedback, newest first: date, what the owner said, and what changed.

- 2026-11-12: Objected to a bare checkbox for marking internal: wants a confirmation and a coloured
  "Mark as Internal" / "Mark as External" tag, and a "Show internal" filter on Customers. Built
  `InternalMark` (status tag, action button, confirm) for Customers and the client page, and the
  filter. A change that hides data for everyone needs a confirmation. Pushed on "push".
- 2026-11-12: Couldn't see Settings, though an admin. The Admin Console login (`admins`) and the
  dashboard member account are separate; the member account's role was still Agent, and the
  dashboard checks only that. Fix: set the member's role to Admin in the Admin Console.
- 2026-11-12: Asked where to set a client as internal, then said there was no such option and to
  put it in Customers; only admins may mark, and every client starts normal. No member had the
  Admin role, so the client page button was hidden. Added an admin-only Internal tick box per
  CallAnchor customer (others see Internal or Normal) and made the rule the owner's. Pushed on
  "push".
- 2026-11-12: Said "run audit". Ran `npm run audit:notes` (7 open notes, all the owner's) and built
  all seven; the new rules are in the SOP. Note 1's message was in the phone's mark-unavailable log
  metadata, never joined to the call.
- 2026-11-12: Said "mark done and push". Committed the fixes with the `--mark` script (`b27945b`),
  marked notes 1–7 done with that commit, and pushed.
- 2026-11-12: Asked whether `npm run audit:notes` marks, archives or deletes notes, and how done
  work is tracked. It doesn't: it's read-only. Status (open, done, won't fix), resolution and
  `resolved_at` are set on `/admin/audit-notes`; nothing is deleted. Recommended a `--mark` option;
  owner said "build it". Built it and added the command to the weekly review rule.
- 2026-11-12: Asked for an auditor permission that lets members enter comments saved in the DB with
  the page URL and metadata, to be reviewed with the agent weekly to optimise the dashboard. Built it
  as a permission on top of the role, with an admin review page and a Markdown export; added the
  weekly review to the SOP.
- 2026-11-12: Said "push". Pushed the auditor notes together with the earlier unpushed work (Admin
  role, linked events, didn't-connect fix), since they share files.

- 2026-11-05: Asked for better correlation between mobile, portal and CRM events, properly linked and
  structured, ahead of a global search bar in CallAnchor Config. Found that the callout list already
  carries each call's payload (length, type, agent number) and that half the stored calls had no
  phone; linked all three streams and stored portal events. Added the linking rule to the SOP.

- 2026-11-05: Pointed at a call with `hasRecording: false`, `durationSeconds: 0`: a rejected outgoing
  or missed incoming call is good behaviour, not a risk; fix it for new and stored data. Added the
  "didn't connect" test, stored `callType`, backfilled the shared DB and added the rule to the SOP.

- 2026-11-05: "The API console should only be visible to admins." Added an Admin member role that
  gates the console, its action and its link; closed the matching recommendation.
- 2026-11-05: Answered the QA points: `recording.ready` (connected, recorded) and `call.completed`
  (missed or rejected) are both valid; no working-time filter, daily basis; no-sync thresholds
  fine but configurable; unused seats in a dedicated tab. Built all four and added them to the SOP.

- 2026-11-05: Asked to read the QA report well and adapt the tracker to it. Built every finding that
  doesn't need an owner decision; left R3, the working-time and seat thresholds, alerts and the
  scheduled pull as recommendations. Status per finding is in `docs/client-health-qa.md` §14.

- 2026-11-05: Asked to update the sample responses and curl for the CallAnchor APIs. Captured the
  new reads live on the one named client (GET only), added 12 operations and the drifted fields to
  the contract, redacted fixtures, and generated a curl reference and Postman sample responses.
  Then asked for it on the portal's CallAnchor APIs page, and said they'll push when needed. Each
  operation there now shows its curl and redacted sample. Not pushed.

- 2026-11-05: Asked for one consolidated QA report. Wrote `docs/client-health-qa.md`, which merges
  both reviews with an ID and severity per finding, an order of work and the owner's open points.

- 2026-11-05: Asked to review from the license's view too: a purchased license should sync its calls
  consistently, not only once, and any drop should be flagged. Also asked for every other angle.
  Reviewed licenses, integrations, account, time, platform and operator angles with read-only
  counts. No code was changed. Added a recommendation.

- 2026-11-05: Asked for a full QA of the client health tool, as PM, UI expert, QA and user. The data
  must be clear and the UI not too deeply nested. The core check: a recorded call must be uploaded,
  have its recording and be synced to the CRM, and any drop along the way should be flagged early.
  Reviewed the code and ran read-only counts on the store. No code was changed. Added two
  recommendations.

- 2026-11-05: Asked for every API app.360callanchor.com uses to pull data, and said to act only
  under one named client's Call Records tab. No browser was connected, so the list came from the
  app's public bundles, with no API calls. Wrote `callanchor-apis/docs/endpoint-inventory.md` and
  added the one-client rule to the SOP.

- 2026-11-05: Asked to execute `docs/client-health-plan.md`. Built all four phases; settled open
  question 16 with live GETs (the license is `metadata.licenseId`); answered the follow-ups on open
  questions 12 and 14 from the store. Section 11 of the plan lists where the build differs.

- 2026-11-04: Wants payload data and all other metadata next to the error wherever an item has it.
  Call pages now read each CRM request live and show log metadata; added the rule to the SOP.

- 2026-11-04: Asked how the agent knew "CallAnchor reports each license every 10 minutes". It
  didn't: 10 minutes is our store's minimum gap between tenant reads, and reads happen only on
  dashboard visits. Corrected the wording in the health plan.

- 2026-11-04: Asked for status per license, not just per client, in the health plan. Added section
  6 to `docs/client-health-plan.md` (statuses, roll-up, license pages) and open question 16, since
  stored events don't yet record which license made a call.

- 2026-11-04: Asked for a plan, not a build, to find critical issues in depth with a friendlier UI.
  Said CRM replies are custom per client and aren't error identifiers, and that suggestions and a
  structured reply layout will follow. Profiled the store, wrote `docs/client-health-plan.md`, added
  the reply rule to the SOP and open questions 12–15.
- 2026-11-04: Said `call.completed` and `recording.ready` are both successful sends to the CRM, and
  HTTP 200 is a CRM success. Applied both (4 callouts CallAnchor marked failed despite a 200 now count
  as delivered), answered open question 11 and dropped the two recommendations it replaced.
- 2026-11-04: Asked for every error on the health pages to be clickable down to the individual items.
  Built the items page and call timeline, and linked every flag, error and count to them.
- 2026-11-04: Asked why a call that shows success in CallAnchor's portal is flagged "Uploaded, not
  synced to the CRM". Its success was `call.completed`; no `recording.ready` was ever sent (a race
  with the upload). Added open question 11 and two recommendations.
- 2026-11-03: Asked whether the local and live health dashboards share a database. They do (same
  Neon endpoint in `.env.local` and every Vercel env). Recommended a separate dev branch.

- 2026-11-03: Doesn't want data pulled from scratch on each visit. Store it, pull only the latest in
  real time, refresh the last 5 days once, and save a milestone on every pull to keep batches small.
  Built the health store and added the rule to the SOP.

- 2026-11-03: Asked for a health dashboard for all clients, consolidated and individual: recordings
  created and synced, CRM responses, upload and webhook status, "anything and everything". GET APIs
  are fine; anything else needs approval. Built it and added the GET rule to the SOP.

- 2026-11-02: Asked for an always-considered file that turns questions and feedback into an SOP,
  happy implementation, recommendations and portal changes. Created this file.
