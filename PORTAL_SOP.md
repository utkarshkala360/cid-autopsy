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
- Data auto-syncs on a visit at most every 5 minutes; the Refresh button (top right of the health
  bar) pulls at once, at most once in 30 seconds per scope, checked in the browser and on the server
  (owner, 2026-11-13).
- Detailed data (system logs, CRM callouts, calls) is kept 15 days. Snapshots are kept 30 days: the
  daily counts per client and phone (`ca_daily`, saved before calls are pruned, so 30-day strips keep
  working), phone and integration change history, and portal events (owner, 2026-11-13). Lists of
  individual calls therefore reach back 15 days at most. See `SYNC` and `prune()` in `store.ts`.
- The database lives near India because this is an internal app used from India: Supabase Postgres
  in Mumbai (`bom1`, Free plan), with Vercel functions in Mumbai too. Neon has no India region
  (owner, 2026-11-13). The app reaches it through `lib/db.ts` (postgres.js, transaction pooler) and
  scripts through `scripts/db.mjs`.
- Every page and server action re-checks the session, even though `proxy.ts` also checks it.
- CallAnchor pages and actions call `requireCallAnchorSession()`.
- The API console (`call_anchor/apis`) is for members with the Admin role only. Its page and
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
  only admins change it, with the "Mark as Internal" / "Mark as External" button on the client's
  health page, always after a confirmation. Status shows as a coloured tag (Internal amber,
  External green), never a bare checkbox (owner, 2026-11-12). See `components/InternalMark.tsx`;
  flags live in `ca_client_flags`.
- There is no Customers section: CallAnchor clients are the customers, worked from Client health
  (owner, 2026-11-13). `/customers` redirects there. The `customers` table and `ca_map_customers()`
  stay in the schema, unused by pages; the Salesforce connect pages went with Customers (no org was
  connected), and `lib/salesforce/` is kept for when a client page needs it.
- Health pages share one frame: the site header is frozen at the top; the health tabs (Overview,
  Issues, Clients, Licenses, Devices, Settings) are a bar frozen under it and carry the picked range
  (`?range=`) from tab to tab. A page with sections lists them in the left menu, and picking one shows
  that section on its own; there is no whole-page view (owner, 2026-11-13). See `health/HealthNav.tsx`.
  The entity tabs have a filter menu on the left instead (below).
- Member and admin pages use the full window width, with no centred max-width column; content and
  tables stretch to the right edge. A page section is never squeezed into a side column (owner,
  2026-11-13).
- Health pages are hierarchical, client on top (owner, 2026-11-13). Everything about a client lives
  under `/health/clients/<client>/`: its Overview, `issues` (and `issues/<issue>`), `licenses` (and
  `licenses/<license>` for one phone), `devices`, `items` (Calls & logs) and `calls/<call>`. The frame
  says where you are at every level: health tabs (a client's pages sit under Clients), a breadcrumb
  that follows the URL (`HealthTrail`), the client's name and its own tabs (Overview, Issues,
  Licenses, Devices, Calls & logs; `ClientTabs`), then the left menu. Build links with `clientHref`,
  `licenseHref`, `callHref`, `issueHref` and `itemsHref` in `health/format.ts`, passing the client id;
  flat links (`/health/licenses/<id>`, `/health/calls/<id>`, `?client=`) still work by redirecting.
- Every entity tab has a left filter menu (owner, 2026-11-13): groups of options with counts, each
  counted against the other picks. Every group is multi-select (`?health=critical,warning`) and
  collapsed, showing only its picks (or All); opening one lists every option as a tick box, one group
  open at a time, and an option with nothing behind it is hidden unless picked. All
  always shows (`MenuLayout` in `health/FilterMenu.tsx`, `applyFilters` in `health/_views/entities.tsx`).
  Modules for issues are CRM, Device, Portal and Usage (`MODULES` and `issueModule()` in
  `lib/callanchor/modules.ts`; a new issue kind must be placed there). Filters: Issues by Health
  (Needs action by default, Critical, Warning, Info), Module and Raised for (all clients, a client, a
  license), plus `?license=` or `?device=` from a row's Needs action, which also shows the license
  issues a client issue stands for; Clients by Health, Status (working by default) and CRM
  integration; Licenses by Health, Seat (`?use=`), calls in the range and Device; Devices by Health
  and Recording. Every tab has a search box (`?q=`) and pages of 100. Overview (`/health`) is the
  hero, then the worst five clients, licenses and devices, failed CRM syncs and system logs, all on
  the range.
- Health tabs are one view per entity, with the same core columns (owner, 2026-11-13): Overview,
  Issues (one row per issue), Clients (one per client), Licenses (one per license, client-agnostic),
  Devices (one per brand + model; licenses with no model share an "Unknown" row; there is no device
  id), Settings. Every row shows Health as an icon chip on its name (level on hover), Call journey
  (dotted steps), CRM syncs (one cell: reached-of-due ring, a strip over the range, last call
  through) and Needs action, plus a few identity columns of its own. A time range (24h default, 3,
  7, 15 days) drives Call journey and CRM syncs; Health and Needs action are always right now (open
  issues). A client's page is the client hero over the same Issues, Licenses and Devices tables,
  scoped to it, so a license row looks the same everywhere. Overview keeps the hero, stat strip,
  failed CRM syncs, system logs and the worst few of each entity.
- Rows sort by severity, then by calls surely lost in the range (owner, 2026-11-13): broken calls
  (stopped at upload, sending or the CRM) out of calls, taken at the lower end of their 95% range
  (Wilson, `sureShare` in `lib/callanchor/health.ts`), times the calls. 1 of 10 counts as 0, 10 of
  100 as 5, so a big clear loss leads a tiny sample of the same severity. Clients, Licenses and
  Devices show it in an Impact column ("≈ 33 lost", then broken of calls and the share; "few calls"
  under 20); Issues show the calls each affects.
- Every call that didn't reach the CRM is an issue, and no error or issue is ever left behind
  (owner, 2026-11-13). Success rates and other thresholds only pick the level (critical, warning);
  they never decide whether an issue is raised. Every unsynced call sits under some open issue at
  Warning or above, so Needs action shows it. Issues still group calls, so Needs action counts
  issues. Any stopped call no other issue covers goes to "Other calls that didn't reach the CRM"
  (`calls_not_synced`, the catch-all at the end of `clientIssues` in `lib/callanchor/issues.ts`).
- No duplicate counts (owner, 2026-11-13). On Calls & logs a step shows where calls stopped once,
  with non-overlapping reasons indented under it; stages that repeat the same calls cut another way
  show only when a link opens them (`UNDER`, `ONLY_WHEN_PICKED` in `health/_views/items.tsx`). Needs
  action counts issues, with the distinct calls not in the CRM under it.
- A failure rate alone makes Critical only with at least `criticalMinFailures` (5, in Settings)
  failed calls; with fewer it's a Warning, never dropped: false alarms are better than leaving a
  small client out (owner, 2026-11-13). This applies to "CRM is rejecting calls" and "<CRM> is
  failing calls", which now warns below 5 calls instead of staying silent.
- Severity and CRM status codes are colour-coded everywhere (owner, 2026-11-13): red a problem
  (critical, error, HTTP 5xx, 401/403, no response), amber worth a look (warning, other 4xx), green
  went well (healthy, calling, 2xx), sky information, grey a plain count. Filter chips are tinted in
  their colour and filled when picked; values in tables are badges. Use `severityTone`, `httpTone`,
  `toneChip` and `toneBadge` in `health/format.ts`.
- Health pages look like the CallAnchor support portal the owner pointed to (owner, 2026-11-13): a
  dark gradient hero per page with an eyebrow, title, status pill and two key numbers, a strip of
  stat cells (icon, coloured accent, number, one line) attached under it, tabs with icons, white
  cards on the grey page. Use `Hero`, `StatStrip`, `StatCell` and `Icon` in `health/ui.tsx`; `Tile`
  shares the look.
- Links are not the way to show data (owner, 2026-11-13): a table row's main item (client, phone,
  call) is dark text (`rowLinkClass`), a number that opens its rows is a quiet chip (`ItemLink`), and
  an action ("Open items", "Show all", "Verify") is a button (`secondaryButtonClass`). No bare blue
  underlined links.
- The items page (Calls & logs) has a left filter panel that follows the call's journey (owner,
  2026-11-13): Kind is a switch on top (Calls, CRM syncs, System logs); for calls, the outcome (all,
  went all the way through, still on their way), then the five journey steps as a numbered stepper,
  each holding its stages: "Stopped here" first, then what went well, then problems. Standard status
  notation everywhere: green went well, amber in progress or worth a look, red a problem, grey a plain
  count; each step's number is coloured the same way and shows how many calls stopped there; every
  stage shows its count, empty ones dimmed, with a legend underneath. A new stage needs an entry in
  `STAGES` (type check) and a place in `STEP_STAGES` (`health/_views/items.tsx`, checked in dev).
- Wherever several sections or groups sit together, they are collapsible and only one is open at a
  time (an accordion), opening on the one that holds the current pick; a closed group names its pick
  in its heading (owner, 2026-11-13). Use `<details name="...">` with a shared name, as the journey
  steps in `ItemFilters` (`health/_views/items.tsx`) do. Health page sections already show one at a time via the left menu.
- Lists of issues are table rows, one per issue, not cards, to use the space well (owner,
  2026-11-13). The Issues tab is that list with the shared columns; an issue's Call journey and CRM
  syncs are those of what it was raised for (its license, its client, or the fleet).
- The sub app is called CallAnchor and lives at `/dashboard/call_anchor` (was CallAnchor Config at
  `call_anchor_config`; `next.config.ts` redirects old links) (owner, 2026-11-13).
- The health pages speak in the call's journey, for non-developers: Call made on the phone → Picked up
  by the app → Recording uploaded → Sent to the CRM → Accepted by the CRM. Each client and phone
  shows where its calls stop, and when a call last went all the way through; each call shows the
  step it stopped at and the ids that tie every step to the next (owner, 2026-11-13).
- A phone (license) always shows as its full number, with its agent's name in a grey line under it
  (owner, 2026-11-13). Use `phoneText()` in `lib/callanchor/labels.ts` (full number from
  `ca_licenses.number`, or …1234 on a row saved before numbers were kept); names from
  `ca_licenses.agent_name`. Both are saved by each client list pull, which runs at once while any
  license lacks them. "Unassigned" only when the seat has no agent. Call ids show whole, never cut.
- Seats are licenses, so they share the Licenses tab (owner, 2026-11-13): each license shows its seat
  state (calling, logged in but not calling, logged out, not assigned) with since when, and the Seat
  filter. `/seats` links open Licenses with `use=unused`. Unused seats still aren't issues (owner,
  2026-11-05).
- Counts with a whole show as a ring coloured as a warning signal, never one colour per metric
  (owner, 2026-11-13): green fine, amber worth a look, red a problem, grey nothing to judge
  (`signalHue` in `health/ui.tsx`). Seats on Clients are four small rings out of purchased (out of
  active when purchased isn't known), the count under each as 3/5 (the /5 grey) and its label; the
  share shows on hover only, and "not set up" is in Active's hover. Active, Logged in and Calling are
  green at 80% or more, amber from 50%, red below; Unused the other way round (green at 20% or less).
  Each opens those licenses (`PctRing`). The CRM syncs ring (`MetricRing`, reached of due) is green at
  the CRM warning line in Settings (95%), amber down to the critical line (80%), red below.
- A row's calls in the range sit under its name, "39 calls in 24 hours · last 1 h ago", not in a
  column (owner, 2026-11-13).
- CRM syncs is one cell everywhere (owner, 2026-11-13): the ring (due calls in the range that
  reached the CRM, of due), a strip over the range (an hour per cell for 24 hours, 6 hours for 3
  days, a day for 7 and 15; synced at the synced-day rate), synced cells out of cells with due calls,
  and the last call through. The range rolls back from now like the items page's window, so a count
  and the calls it opens agree. Computed in one pass over the range's calls (`loadEntities` in
  `lib/callanchor/health.ts`); device rows add calls across clients with each call's own client
  context (`addToJourney`).
- Pages never pull CallAnchor while rendering, and changing pages never waits on a pull (owner,
  2026-11-13). A page shows the store at once and asks the server for a pull (POST
  `health/pull`); the server plans it, answers straight away and runs the steps after its response
  (`after()`), 4 at a time, saving progress in `ca_pull_jobs` (`lib/callanchor/pull-job.ts`). The
  browser follows it with plain fetches (GET `health/pull`), shows a small corner indicator with the
  percentage and any failures by cause, and refreshes the page in place at most every 10 seconds
  while it runs (`PullProgress` in `health/Progress.tsx`). One job per scope (a fleet job covers every
  client), held by a lease renewed each batch; a stream is pulled only if last pulled over 5 minutes
  ago (`SYNC.pageEveryMs`), and the browser doesn't ask again for a scope for 5 minutes, remembered
  across reloads. Store reads show an estimated percentage (`LoadingNote`).
- Words on the health pages are everyday words for support staff, never rule or field names (owner,
  2026-11-13): say what we can't tell yet and when, not "baseline", "learning" or a rule's title.
- No week-long wait on a new phone or new agent (owner, 2026-11-13): its usual calls a day come from
  the longest full window it has, 1, 3 or 7 days, and the alert and phone page name that window.
  `RULES.baselineWindows` in `lib/callanchor/issues.ts`.
- Hover text on the health pages shows at once (owner, 2026-11-13): give an element a `title` and
  `InstantTips` (`health/Tips.tsx`, in the health layout) shows it in its own bubble, never the
  browser's delayed tooltip.
- Changing the range keeps the current table on screen until the new one is ready, with a spinner on
  the picked option (`RangeLink`); Suspense boundaries are keyed by page, never by range. Each page
  view computes the ranges not yet in memory after the response (`warmEntities`) (owner, 2026-11-13).
- Users never wait on data they've already seen (owner, 2026-11-13). The fleet, licenses and client
  summary loaders keep their last result in server memory and serve it at once, recomputing in the
  background when it's over 5 seconds old, one run per key (`cached` in `lib/callanchor/health.ts`);
  only the first read after a server start waits. While a pull runs, the page refreshes every 5
  seconds as a background transition, so new data appears in place without a loader, scroll jump or
  lost filters. A change that alters the numbers calls `clearHealthCache()`.
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
- A server page imports only components from a `"use client"` file, never constants or helpers: on
  the server those arrive as references, not values, and the page crashes at runtime while the build
  passes. Shared values go in a plain module such as `health/format.ts` (the Clients tab broke this
  way on 2026-11-13).
- Screenshots for decks: headless Chrome (playwright-core, `channel: "chrome"`) at 1600×1000, 2×
  scale, against the running dev server, with the `nextjs-portal` badge and "Audit note" button
  hidden. The owner chose a locally signed short-lived member session over the login form
  (2026-11-13). Keep screenshots and decks out of the repo: they hold customer data.
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
- Work the browser starts and follows goes through a route handler and `fetch`, never a server
  action: server actions share the router's queue with page changes, so a running one made tab
  changes wait or cancelled it (the browser-driven pull did this until 2026-11-13).
- To make a threshold editable, add it to `SETTINGS` in `lib/callanchor/issues.ts`; every loader in
  `health.ts` calls `loadSettings()` first, so pages and actions see the saved values.
- Journey counts come from `journeyStop()` and `isComplete()` in `lib/callanchor/issues.ts`, exposed as
  the `stopUpload`, `stopSent`, `stopCrm`, `complete` and `moving` stages, so a roll-up and the calls
  it opens agree. Each call stops at most once, at the first broken step. "Last call through" is
  `COMPLETE_SQL` in `store.ts`, which must match `isComplete` for delivered calls.
- A new id along the journey goes on its step in `journey()` (`health.ts`) and into `findById()`
  (`store.ts`), so Find by ID can open the call from it.
- Give every client and phone the same three numbers (`Pulse` in `lib/callanchor/issues.ts`): last good
  CRM sync, synced days out of days with due calls (7 and 30 days, as a day strip), and the recording
  chain. Judge each against its own history and absolute limits; other phones are only a hint.
- "Reached the CRM" is delivered out of due (`CALL_STAGES.due`) everywhere. Day counts come from SQL
  (`readDaily`), so `RECORDED_SQL` and `dueOf` must agree with the stage tests.
- A drop that loses data (a recording not uploaded, verified but not synced, a call never sent) stays
  flagged until it's fixed, back 15 days (`readOpenCalls`, `RULES.openLookbackDays`), not only for 24 hours. A rate problem says
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
| 2026-11-13 | New phone / new agent checked in 1, 3 and 7-day windows instead of waiting 7 days: after its first full day, "stopped capturing calls" compares with its last 1 day, from day 3 its last 3, from day 7 its last 7; the alert says which ("over its last 3 days"), the phone page says which window and when the next starts, and the hourly chart averages the full days before today it has. Badge "New phone · first day" with the start time on hover | Done, typechecks and lints; not pushed | `RULES.baselineWindows` and `licenseHealth` in `lib/callanchor/issues.ts`, `loadLicense` in `lib/callanchor/health.ts`, `NewPhone` in `health/_views/entities.tsx` |
| 2026-11-13 | Finish the Supabase Mumbai cutover for local dev too: from here, Neon Singapore returns ~32 KB/s (7 days of calls, 1.2 MB, take 37 s while the query runs in 4 ms), so a cold local read takes over a minute | Production is next to Neon and unaffected; local dev waits on every cold read | Awaiting owner |
| 2026-11-13 | (Superseded: owner chose to move the database to Mumbai.) Make local dev usable over a slow route to Singapore: either run local against a local Postgres (own store, pulled from CallAnchor), or cut what a page reads (stop loading 8 days of every call, about 6.4 MB, on each fleet visit) and stop the page waiting on CallAnchor pulls | Local took over a minute per page on 13 Nov: the owner's ISP route to Singapore gave Neon 56–230 KB/s (5.8 MB/s elsewhere), over HTTP, WebSocket and curl alike, and transfers over ~4 MB were cut off. Production runs in `sin1` beside Neon and isn't affected | Awaiting owner |
| 2026-11-13 | Ask CallAnchor to fill `externalCallId` on `mobile.call.create` (the phone's own call-log id) | It's empty on all 8,309 stored ingest logs, so the chain starts at CallAnchor's call id: a call on the phone can't be matched to its row here without it | Awaiting owner |
| 2026-11-12 | Give "phone couldn't save the recording" its own issue, apart from "Recordings stuck on the phone" | 12 stored calls have `mobile.recording.mark-unavailable`: the phone found no file, so waiting won't help. They still count as stuck on the phone (only the reason is shown now); the fix is the phone's microphone permission or dialer recording setting | Awaiting owner |
| 2026-11-12 | Decide what deleting an auto-added CallAnchor customer means | `ca_map_customers()` adds it back on the next snapshot pull. Either block deleting them, or keep a "not a customer" mark | Awaiting owner |
| 2026-11-05 | Alerts for new critical issues and a phone with no sync, by Slack or email (QA O1) | Nobody is told until someone opens the page. Needs a channel and the scheduled pull | Awaiting owner |
| 2026-11-05 | Get a CallAnchor role that can read `click-to-call-logs`, `bulk-dial-logs`, app builds, log retention and support users, and sample `licenses/{id}/history` on a client with licenses | Our `support_agent` login gets 403 on them, so they have no sample or contract entry. See "What our login can't read" in `callanchor-apis/docs/endpoint-inventory.md` | Awaiting owner |
| 2026-11-04 | Limit who sees raw payloads and log metadata | They carry customer phone numbers, agents' notes, actor emails and IPs, and every member with a CallAnchor login can open them | Awaiting owner |
| 2026-11-05 | Decide the open points in `docs/client-health-plan.md` section 10: whether license issues alert alone, acknowledge and notes, how suggestions get added | Working hours and thresholds are settled (no filter; Settings tab) | Awaiting owner |
| 2026-11-03 | Give local dev its own Neon branch (set a branch `DATABASE_URL` in `.env.local` and Vercel's Development env) | Local, preview and production all use the same database, so a local visit moves the live milestones and writes live rows, and local schema changes hit production at once | Awaiting owner |
| 2026-11-03 | Raise the S3 purge failure with CallAnchor | Every post-sync S3 deletion failed (0 of 228 succeeded on 3 Nov): their AWS user lacks `s3:DeleteObject`, and the logs mark it `info`. Recordings stay in S3 longer than intended | Awaiting owner |
| 2026-11-03 | Pull on a schedule (Vercel cron) as well as on visits (QA D3) | Data only moves when someone opens the dashboard: 6.5 hours stale on 5 Nov, and an unvisited weekend loses logs for good beyond CallAnchor's ~3-day retention. Needs unattended access (open question 1) | Awaiting owner |
| 2026-11-03 | Review `OPPORTUNITY_NOT_FOUND` with the affected client | It was the top CRM error fleet-wide on 3 Nov, so data matching, not an outage, drives the worst sync rates (open question 5) | Awaiting owner |
| 2026-11-02 | Rotate the session cookie exposed in the "CallAnchor x APIs" sheet and restrict access to the sheet | It also holds recording links, customer phone numbers and an AWS access key ID | Awaiting owner |

## Portal changes

Agreed changes. Newest first. Status is Planned, In progress or Done.

| Date | Change | Status | Link |
| --- | --- | --- | --- |
| 2026-11-13 | Refresh button at the right of the health tab bar: pulls now (streams older than 30 s) instead of waiting for the 5-minute auto-sync, then shows "Refresh in Ns" for 30 s; the server refuses a manual pull for the same scope started under 30 s ago | Done, typechecks and lints; pushed 2026-11-13; not yet clicked signed in | `RefreshButton` in `health/Progress.tsx`, `force` in `planPull` (`store.ts`) and `startPullJob` (`pull-job.ts`), `health/pull/route.ts` |
| 2026-11-13 | Needs action cell: under "1 critical 4 warning", the distinct calls not in the CRM across the row's open issues, each counted once, with a red (i) whose hover adds the worst issue ("50 calls not in the CRM · Recordings stuck on the phone"); column info tip says it counts issues, not calls | Done; Manish Minerals checked read-only (49 + 1 = 50); pushed 2026-11-13 | `notInCrm` on `Issue` in `lib/callanchor/issues.ts`, `needsOf` in `lib/callanchor/health.ts`, `NeedsCell` in `health/_views/entities.tsx` |
| 2026-11-13 | Calls & logs, Recording uploaded step: one "Stopped here" count with its non-overlapping reasons under it (Phone hasn't uploaded, Stuck after upload began, new Phone couldn't save it). Still on the phone, Not uploaded, Upload failed, Uploaded not verified and Still open 15 days repeat those calls, so they show only when a link opens them | Done; pushed 2026-11-13 | `UNDER`, `ONLY_WHEN_PICKED` in `health/_views/items.tsx`, `unsaved` stage in `lib/callanchor/issues.ts` |
| 2026-11-13 | No unsynced call left out of the issues: "CRM is rejecting calls" is always raised (the success rate picks Critical or Warning only); a catch-all "Other calls that didn't reach the CRM" picks up stopped calls no other issue covers (recordings the phone couldn't save, CRM failures older than 24 hours, odd reply codes), with the reasons as evidence, back 15 days; open calls now include sent-but-never-accepted ones; new "Stopped before the CRM" stage on Calls & logs | Done, typechecks and lints; checked read-only on all 54 clients: catch-all raised at 2 (1 and 34 older failed calls), always-on rejection at 1; seen locally by the owner; pushed 2026-11-13 | `clientIssues` in `lib/callanchor/issues.ts`, `readOpenCalls` in `lib/callanchor/store.ts`, `health/_views/items.tsx` |
| 2026-11-13 | Calls & logs, Accepted by the CRM step: one "Didn't reach the CRM" stage with its reasons indented under it (CRM rejected it (4xx), sign-in 401/403, no response or 5xx; empty ones hidden), counted once in the step. "Sent, not accepted" and "Sync failed" were the same calls (15 days: 45 in each, all 4xx), so they show only when a link opens them | Done, not pushed | `UNDER`, `ONLY_WHEN_PICKED` in `health/_views/items.tsx` |
| 2026-11-13 | Unified entity tabs: Overview, Issues, Clients, Licenses, Devices, Settings; shared columns (Health chip, Call journey, CRM syncs, Needs action) on a range (24h, 3, 7, 15 days) carried between tabs; module switches, the Clients table and the old Licenses panel removed; a client's tabs are Overview, Issues, Licenses, Devices and Calls & logs, the same tables scoped; Overview shows the worst five of each entity, failed CRM syncs and system logs | Done, builds; loader checked read-only against the store (counts add up across clients, licenses and devices); pushed 2026-11-13, not yet viewed signed in | `health/_views/entities.tsx`, `loadEntities` in `lib/callanchor/health.ts`, `health/HealthNav.tsx` |
| 2026-11-13 | Licenses tab: each module has its own left-menu filters (Calls & CRM: calls, reach, sync days; Device: model, app, recording, dialer); module change clears filters. Rings in a fixed colour per metric with "of Y" under the number and the share on hover; Purchased column removed; Reached CRM and Recordings as rings; CRM sync, 7 days as one shared cell in both Clients modules and the Licenses tab | Done, pushed 2026-11-13; not yet viewed signed in | `health/_views/licenses.tsx`, `MetricRing` in `health/ui.tsx`, `SyncCell` in `health/parts.tsx`, `health/FleetTable.tsx` |
| 2026-11-13 | Tabs split: Overview (Needs action, Module as left menu), Clients (Module and per-module Health as left menu, picks kept in the URL), Licenses (Module, Health and Use as left-menu filters, empty options hidden, All shows every license); client pages sit under the Clients tab and breadcrumb; shared `MenuLayout` | Done, pushed 2026-11-13 (`1ab99cb`); not yet viewed signed in | `health/FilterMenu.tsx`, `health/clients/page.tsx`, `health/licenses/page.tsx`, `health/FleetTable.tsx`, `health/HealthNav.tsx` |
| 2026-11-13 | Overview by module: Trials removed; Needs action split into CRM, Device, Portal and Usage, with CRM errors under CRM and system logs under Portal over a time range (24 hours default, 3, 7, 15 days); Clients table switches between Call journey, Licenses and Issues; Licenses switches between Health & use, Calls & CRM and Device (breakdowns moved into Device); license filters moved inside their section; severity and CRM status codes colour-coded as chips and badges | Done, pushed 2026-11-13 (`1ab99cb`); not yet viewed signed in | `health/page.tsx`, `health/FleetTable.tsx`, `health/_views/licenses.tsx`, `lib/callanchor/modules.ts`, `health/format.ts` |
| 2026-11-13 | Serve the last computed data at once and recompute in the background (5 s); refresh the page every 5 s while pulling, in place; cache cleared on internal marks and saved Settings | Done, builds; pushed with this turn's commit; not yet viewed signed in | `cached` in `lib/callanchor/health.ts`, `health/Progress.tsx` |
| 2026-11-13 | Overview, Clients and Licenses merged into one Overview page at `/health`: clients table with seat rings and licenses needing action, Licenses section below with filters; tabs now Overview and Settings; old routes redirect; section links open their section | Done, builds; pushed with this turn's commit; not yet viewed signed in | `health/page.tsx`, `health/FleetTable.tsx`, `LicensesPanel` in `health/_views/licenses.tsx` |
| 2026-11-13 | Seats merged into Licenses (seat column, Use filter, seat-use strip and per-client table); rings with formula tooltips for seat counts; batched pulls with a progress bar, percentage, live failure list and a 2-minute cooldown, one job per tab; estimated-percentage loaders; Customers section removed (redirects to Client health; Internal flag stays on the client page); boolean arrays sent as text so the postgres.js driver can save them | Done, builds; pushed with this turn's commit; not yet viewed signed in | `health/_views/licenses.tsx`, `health/Progress.tsx`, `health/ui.tsx`, `planPull` in `store.ts` |
| 2026-11-13 | Visual redesign after the owner's portal screenshot: hero headers with key numbers and attached stat strips on Clients, Overview, Licenses, Seats and every client page (client hero: health pill, CRM integration, last call through, reached-CRM bar, calls; strip: open issues, licenses, seats, last good sync); client tabs with icons inside the hero; tiles restyled with accents | Done, builds; pushed with this turn's commit; not yet viewed signed in | `health/ui.tsx`, `health/clients/[clientId]/layout.tsx`, `loadClientSummary` in `lib/callanchor/health.ts` |
| 2026-11-13 | Hierarchical navigation: client pages moved under `/health/clients/<client>/` (health, licenses, phone, seats, Calls & logs, call, issue); breadcrumb from the URL on every health page; client header with its own tabs; left menu below it; fleet Licenses, Seats and items with `?client=` and old flat client, phone, call and issue links redirect there. Links restyled: row links dark, counts as chips, actions as buttons; "Back to client" footers removed. Items page: left Kind and Stage filters; a page without sections now uses the full width | Done, pushed 2026-11-13 (`dd2be81`); not yet viewed signed in | `health/HealthNav.tsx`, `health/clients/[clientId]/`, `health/_views/`, `health/format.ts` |
| 2026-11-13 | Move the database from Neon Singapore to Supabase Mumbai (Free plan, via the Vercel Marketplace, env prefix `SB_` until cutover); driver swapped to postgres.js in `lib/db.ts` and `scripts/db.mjs`; copy all tables, then point `DATABASE_URL` at Supabase and move Vercel functions from `sin1` to `bom1` | In progress: Supabase `cid-autopsy-bom` provisioned in `ap-south-1` and connected with prefix `SB`; schema applied; tables locked from Supabase's public REST API with RLS; postgres.js set to pass JSON text through (it double-encoded it); data copy from Neon running. Production still on Neon until the owner says push. With 15/30-day retention the database should stay near 120 MB, well inside the Free plan's 500 MB | `lib/db.ts`, `scripts/db.mjs`, `vercel.json` |
| 2026-11-13 | Client health Overview tab (`health/overview`, first in the sub-bar): totals for clients, phones and seats, and one row per client with health, open issues, calls, last call through, phones needing action, seat use and unused seats, each opening its view. Cross-links: Health · Phones · Seats on the client page, phone page, filtered Licenses and Seats pages and their rows; the Clients table's seat and phone counts open that client's Seats and Licenses. Licenses rows' client name now opens the client (Phones filters) | Done, pushed 2026-11-13 (`dd2be81`); not yet viewed signed in | `health/overview/page.tsx`, `loadOverview` in `lib/callanchor/health.ts`, `ClientLinks` in `health/parts.tsx` |
| 2026-11-13 | Issue lists ("Needs action" and the client, phone and fleet lists) are a table, one row per issue, instead of a card grid | Done, pushed 2026-11-13 (`dd2be81`); not yet viewed signed in | `IssueList` in `health/parts.tsx` |
| 2026-11-13 | Full-width frame (header, member and admin pages); "Whole page" removed from the health left menu, each page opens on its first section; licenses page's phone table is its own section and the device-model and app-version lists are full-width sections; Settings form full width; CallAnchor Config renamed CallAnchor, route `call_anchor_config` → `call_anchor` with permanent redirects | Done, pushed 2026-11-13 (`dd2be81`); not yet viewed signed in | `components/MemberShell.tsx`, `health/HealthNav.tsx`, `next.config.ts` |
| 2026-11-13 | Journey view: call page leads with where the call stopped, a five-step journey (phone, app, recording, sent, CRM) and the reference ids per step, with the log tables as technical detail; client and phone pages lead with a journey roll-up (stops per step, each opening its calls; old funnels under "Step-by-step counts"); fleet table has a Journey 24h column; client, phone and fleet rows show the last call that went all the way through; Find by ID (call, CRM request, upload session, recording file, job, log line, correlation or license id). Frame: frozen header, Clients/Licenses/Seats/Settings sub-bar with Find by ID and Show internal, left menu of sections that open on their own | Done, pushed 2026-11-13 (`dd2be81`); not yet viewed signed in | `health/parts.tsx`, `health/HealthNav.tsx`, `health/find/`, `journeyStop` in `lib/callanchor/issues.ts` |
| 2026-11-12 | Audit notes 1–7: phone's "recording unavailable" reason on calls (`ca_calls.unavailable_at`/`unavailable_reason`, items page, call problem and journey); "CRM reply" heading for delivered syncs; license issue titles link to their rows (client and licenses pages); left menu for health pages with "On this page" sections, replacing the tabs; internal clients with Mark internal (admins) and Show internal clients; Settings admins only; CallAnchor clients become customers with a Product column | Done, pushed 2026-11-12 (`b27945b`); notes 1–7 marked done. Not yet viewed signed in. The deploy's migration adds all 54 clients as customers | `health/HealthNav.tsx`, `health/actions.ts`, `db/schema.sql` |
| 2026-11-12 | `npm run audit:notes -- --mark <ids> <done\|wontfix\|open> "what changed" [--commit <ref>]` closes notes from the review, same rules as the admin page; `--commit` adds the short hash to the resolution | Done, pushed 2026-11-12 (`b27945b`) | `scripts/audit-notes.mjs` |
| 2026-11-12 | Auditor permission: Admin Console checkbox on create and Make/Remove auditor per member; floating Audit note button on member pages (type, comment, highlighted text) saving URL, title, heading, query, viewport, browser and host to `audit_notes`; `/admin/audit-notes` review page with open/done/won't fix; `npm run audit:notes` for the weekly review | Done, pushed 2026-11-12 (`c882582`); tables created by that deploy. Not yet viewed signed in | `components/AuditNoteButton.tsx`, `app/admin/(console)/audit-notes/`, `scripts/audit-notes.mjs` |
| 2026-11-05 | Global search bar in CallAnchor over `ca_events`, for quick search and analysis | Planned; owner said it comes next | |
| 2026-11-05 | Linked events: callouts keep their call's type, length, recording flag, start and agent last 4 from the payload; calls with no ingest log get their phone from the agent number; portal events (audit log) stored as a stream, linked to license, integration and callout; `ca_events` view joins all three; "didn't connect" now uses the real call length; call page shows the call facts, license page its portal events | Done in code, checked in PGlite; not applied to the shared DB (the agent's apply was blocked) and not pushed. Applies on the next deploy; the next dashboard visit then backfills stored callouts and 90 days of portal events in the background | `lib/callanchor/links.ts`, `db/schema.sql`, `lib/callanchor/store.ts` |
| 2026-11-05 | Calls that didn't connect (missed, rejected, or synced only by `call.completed`) no longer count as "not recorded" or toward "Phone isn't recording calls"; new `notConnected` stage; `ca_calls.call_type` from the ingest log, shown on the items page | Done; column and backfill applied to the shared DB (not recorded: 4,372 → 109). Not pushed | `isUnconnected` in `lib/callanchor/issues.ts`, `db/schema.sql` |
| 2026-11-05 | API console for admins only: new member role `admin`, settable on create and per member in the Admin Console; console page, run action and its link gated | Done; role constraint applies on the next deploy, then set your own role to Admin | `requireApiConsoleAccess` in `lib/callanchor/session.ts`, `app/admin/` |
| 2026-11-05 | Owner's QA answers: both sync events valid (R3 note removed); no working-hours filter, elapsed time day by day; Settings tab for 13 thresholds; Seats tab with seat use per client and every unused seat since when (seat notes left the issue lists); Clients / Licenses / Seats / Settings tabs | Done; `ca_health_settings` applies on the next deploy. Not yet viewed signed in | `health/settings/`, `health/seats/`, `SETTINGS` in `lib/callanchor/issues.ts` |
| 2026-11-05 | QA follow-up: last good sync, synced days and recording chain for every client and phone; one "reached the CRM" (delivered out of due); recordings and unsent calls flagged until fixed; 5-minute grace for server steps; "since" from the run of bad days; issue episodes tied to the data; phone rules that work with one phone; seat use; integration changes recorded and each integration checked alone; duplicate 2xx flagged; fleet stall; inactive clients muted; issue cards open their rows with the evidence above; "new since your last visit"; trials section; busy-client log streams chosen by stored calls | Done; schema applies on the next deploy. Not yet viewed signed in | `docs/client-health-qa.md` §14, `lib/callanchor/issues.ts` |
| 2026-11-05 | CallAnchor contract 17 → 29 operations, checked live: 12 new reads (callee, AI insights, AI credits, seat compliance and settings, disposition sets, portal admins, notifications, onboarding, audit log entry, `auth/me`, latest app build) and new fields on tenant, call contacts and disposition fields. Every operation now has a generated curl and redacted sample (`docs/api-reference.md`), and every Postman request carries its sample response. The API console page shows each operation's curl and sample too (`src/reference.ts` feeds both) | Done; console not yet viewed signed in, not pushed | `callanchor-apis/openapi/`, `callanchor-apis/docs/api-reference.md` |
| 2026-11-05 | Client health plan, all four phases: fixes A, E, F, J; calls linked to licenses through `metadata.licenseId`; `ca_calls`, `ca_licenses` (with change history), `ca_issue_state`, `ca_reply_suggestions`; issue engine; fleet triage, client page redesign, licenses, license and issue pages, call journey; coverage line; own log streams for the 3 busiest clients | Done, schema applied to the shared DB; not yet viewed signed in. License statuses fill in as new mobile logs are pulled | `docs/client-health-plan.md` §11, `lib/callanchor/issues.ts`, `app/dashboard/(app)/call_anchor/health/` |
| 2026-11-04 | Full payloads and metadata: call pages read each CRM request live (payload, endpoint, attempts, replies, errors); log lines are stored whole and shown with their metadata; CRM sync log lines now join their call through `metadata.callRecordId` | Done, not yet viewed signed in. Older rows fill in on the next background 5-day refresh | `health/calls/[callId]/`, `lib/callanchor/store.ts`, `db/schema.sql` |
| 2026-11-04 | Item-level drill-down: every flag, error, outcome and count links to its rows (syncs, recordings, system logs), with per-call timelines | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor/health/items/`, `health/calls/[callId]/` |
| 2026-11-04 | Count a 2xx CRM reply as success, and either `call.completed` or `recording.ready` as a synced recording | Done | `lib/callanchor/labels.ts`, `lib/callanchor/health.ts` |
| 2026-11-03 | Store health data in Postgres and pull only what's new from each stream's milestone; refresh the last 5 days once a day | Done; tables exist in the shared Neon DB (local `predev` migrated them) | `lib/callanchor/store.ts`, `db/schema.sql` |
| 2026-11-03 | Client health dashboard: consolidated and per-client view of calls, recordings, uploads, CRM syncs, CRM replies and errors | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor/health/` |

## Feedback log

One line per piece of feedback, newest first: date, what the owner said, and what changed.

- 2026-11-13: Asked why a client stopping 20 calls at upload (24h) shows only "1 critical 3 warning".
  Explained: Needs action counts open issues, not calls; one issue (per phone, or per client)
  covers every call it affects, and it is right now over 15 days, not the picked range. Proposed
  showing the call count in the chip (Recommendations).
- 2026-11-13: Asked for a manual Refresh button, top right, that skips the 5-minute auto-sync but
  can be clicked only once in 30 seconds; then commit and push. Built it and pushed today's work.
- 2026-11-13: Asked why the data line read "pulled 5 h ago · 5-day refresh 7 h ago · system logs
  from 10 Nov · loaded in 25.6s". "Pulled" is the oldest stream, and VM German's own log stream had
  stopped (it is no longer among the busy clients; the shared stream covers it). Fixed: the fleet
  status leaves out retired per-client log streams (`readStoreStatus` in `store.ts`). The refresh is
  daily, so 7 h is normal; "from" is the oldest stored log; 25.6 s was a cold recompute.
- 2026-11-13: Needs action line was cut off. Wanted a red info icon instead: the cell shows "50
  calls not in the CRM" and a red (i); hovering it reads "50 calls not in the CRM · Recordings stuck
  on the phone". With no calls behind the issues, the worst issue shows as text, as before.
- 2026-11-13: Calls & logs upload step showed the same 49 calls as five problems ("still duplicate
  errors"), and asked to build the call count in Needs action. Folded the upload step like the CRM
  step and built the cell. Rule added to the SOP: a step's stages never count the same call twice.
- 2026-11-13: Still saw only 5 issues for Manish Minerals (20 stopped at upload). Checked: all 20
  are on one phone, under its one critical "Recordings stuck on the phone" (49 recordings, 29 older
  than 24 hours); the fifth issue is the new catch-all. Fleet-wide the catch-all found 2 clients, one
  with 34 failed CRM syncs older than 24 hours that no issue showed before. Re-offered the call count
  in the Needs action cell.
- 2026-11-13: "Success range percentage is only to categorize critical, warning, healthy, but I
  don't need any errors/issues to be left behind." Made thresholds pick the level only, added the
  catch-all issue, and widened the SOP rule.
- 2026-11-13: "If a call is not synced it's also an issue." Added it to the SOP. Checked the code:
  two kinds of unsynced call raise no issue today (Recommendations).
- 2026-11-13: Asked for a PPT of the dashboard with screenshots, pitched as: what it helps with;
  still under audit and being optimised; makes CS proactive instead of reactive to escalations;
  shows where critical action is needed instead of searching log dumps. Built a 12-slide .pptx
  (real data kept, by the owner's choice), now in the git-ignored `deck/` folder with its
  screenshots. See "Screenshots for decks" under Happy implementation. Then asked for a team email
  showcasing it, with long-term impact and a request for a demo slot; drafted in chat.
- 2026-11-13: Asked what "Open items" on Kohinoor - Pune's critical "Verified recordings not synced
  to the CRM" opens, given the journey shows 1 stopped at upload and 44 at the CRM. It opens the
  `unsynced` list over 15 days (verified 5+ min ago, never accepted by the CRM), which spans the
  journey's "never sent" and "refused by the CRM" stops; the journey counts only the page window.
  Answered; nothing changed.

- 2026-11-13: Asked to commit and push everything, including the Supabase driver and `bom1` region
  changes that were waiting. Pushed to main.
- 2026-11-13: Rings shouldn't be one colour per metric but a warning signal. Seat rings are green at
  80%+ (Unused: 20% or less), amber from 50%, red below; the CRM syncs ring uses the CRM success lines
  from Settings.
- 2026-11-13: The seat rings looked bad: dropped the "5 purchased" line, the count now reads 5/5
  (the /5 grey), and the share shows on hover only, in a smaller ring.
- 2026-11-13: Asked how the journey dots show a client stopping at two steps. Answered: each step
  gets its own red dot and count, text lists both ("stops at upload, crm"); counts never overlap
  since a call stops once, at its first break. No change.

- 2026-11-13: Wanted seats out of purchased again (Active, Logged in, Calling, Unused, the share in
  the ring) and calls moved under the name. Built `PctRing` and the seat cell; "X calls in <range> ·
  last …" now sits under the name on Clients, Licenses and Devices; the Calls columns went.
- 2026-11-13: 1 failure in 10 and 10 in 100 are both 10%, but clients differ in size; wanted focus
  where it's needed, checked before building. Chose: severity tier, then size (calls surely lost);
  enough failures for Critical but no client left out; an Impact column. Built all three.
- 2026-11-13: Left menus should be multi-select and collapsed, showing only what's picked. Done for
  the entity tabs (`?health=critical,warning`). Also: phones still showed …1234 although all 135 full
  numbers were saved: the server's kept results were two steps stale; a finished pull now marks them
  stale and recomputes the fleet assessment first, and the page refreshes again 8 s after.
- 2026-11-13: Asked why call ids and phones were shortened, to show them in full, and to show the
  agent's name greyed under the phone. Call ids now show whole; full numbers are stored
  (`ca_licenses.number`, migrated on the shared Neon DB with the owner's OK, "pull fresh": the next
  pull refetches every license, nothing deleted); the agent is a grey line under the number.
- 2026-11-13: The "New phone" badge showed for 73 phones whose clients have no tracked calls; now only
  for phones with a known start. Agent names no longer wrap.
- 2026-11-13: Asked to check in 1, 3 and 7-day windows and answer accordingly. A phone's usual calls
  a day now come from the longest full window it has, and every message names that window.
- 2026-11-13: Asked where the 7-day wait on a new phone comes from (`RULES.baselineDays`; it only
  held back "stopped capturing calls", the drop-against-usual check) and said not to wait 7 days.
  Now that check starts after one full day, averaging over the days seen so far.
- 2026-11-13: Asked where the agent names were. The shared Neon database lacked `agent_name` and
  `ca_pull_jobs` (dev had started before them). With the owner's OK ran `npm run db:migrate` there;
  planning a pull now fetches the client list at once while an assigned phone has no name.
- 2026-11-13: The "New phone" hover text was still jargon (rule names). Rewritten in everyday words:
  we don't know its usual number of calls yet, so for 7 days we can't warn about fewer calls.
- 2026-11-13: "learning its usual calls" was confusing. Now a badge "New phone · day 3 of 7" (or "New
  agent" after a reassignment), with what waits and when it starts on hover; same words on the phone page.
- 2026-11-13: Asked what "learning its usual calls" means (a phone's first 7 days of calls, from
  first tracked or last reassigned, before "calls dropped"/"gone quiet" rules judge it; now on hover);
  asked for the agent's name with each phone (stored as `ca_licenses.agent_name`, shown on license
  and issue rows, searchable); the search box cut off its hint (widened).
- 2026-11-13: Hover text (health chip) took long to show, and switching range looked like a reload.
  Hover text on health pages is now instant (`InstantTips`); a range change keeps the table on screen
  with a spinner on the picked range, and the other ranges are computed in the background. Not a pull.
- 2026-11-13: Changing tabs set off the pull; wants the CallAnchor pull to run in the background.
  Moved it to the server (`after()` behind POST `health/pull`, progress in `ca_pull_jobs`), followed
  by fetch outside the router, shown as a small corner indicator. Updated the pull rule.
- 2026-11-13: Asked why one call showed under four CRM filters, and to group them from the data.
  They were nested tests (rejected ⊂ failed ⊂ sent not accepted ⊂ didn't reach); every failure in
  15 days is a 4xx, mostly Salesforce `OPPORTUNITY_NOT_FOUND` for one client. Grouped under one
  parent with reasons nested.

- 2026-11-13: Asked for a unified health view: tabs per entity (Issues, Clients, Licenses, new
  Devices), each row one entity with Health chip, Call journey, CRM syncs and Needs action on a time
  range, the same rows inside a client. Answered 8 questions (device = model; Overview kept; client
  page = same tabs scoped; range 24h/3/7/15d drives journey and CRM). Recorded the rule; building.
- 2026-11-13: Asked how "Reached CRM, 24h" differs from "CRM sync, 7 days" on Licenses. Explained:
  the first is the share of due calls in a rolling 24 hours that got a 2xx; the second is a 7-day
  strip of IST days (synced at 80% of due) plus the last call that went all the way through. No change.

- 2026-11-13: Pointed out Health and Use belong to the first Licenses module only; Calls & CRM and
  Device need their own filters. Asked for rings in fixed colours with the share on hover, "X of Y"
  under the number instead of a Purchased column, and CRM sync, 7 days for both clients and
  licenses. Built all of it; recorded the rules.
- 2026-11-13: Reported the new Clients tab failing to load in production. The page read its module
  list from the browser-only Clients table file; moved it to `health/format.ts` and added the rule.
- 2026-11-13: Asked to split the tabs: Overview is Needs action with its modules as the left menu;
  Clients a tab with its modules as the left menu and Health counted within the picked module;
  Licenses a tab with its modules, and Health and Use as proper filters, hiding options with nothing
  behind them. Built all three; recorded the tab rules in the SOP.
- 2026-11-13: Asked for the Overview to be thought of by module: Needs action shows issues and errors
  per module (portal, device, CRM…), Clients shows per-client stats per module (call journey,
  licenses, issues), Licenses per-license stats per module (device, model…). Also asked to colour-code
  severity chips and CRM status codes. Built both; added the rules to the SOP.
- 2026-11-13: On Overview, kept Needs action but asked to remove the platform line and the license
  filters showing under it, remove Trials, and fold CRM errors and System logs into Needs action as
  filters with a 24-hour default and a changeable time range. Done; platform faults now head the
  System logs view.
- 2026-11-13: Showed two loaders at 0% and asked not to make users wait: refresh every 5 seconds so
  the page is usable while loading, without new data interrupting. Measured the slow read: the query
  runs in 4 ms, but the route from here to Neon Singapore carries ~32 KB/s, so 7 days of calls take
  37 s locally. Built serve-last-then-recompute caching and in-place 5-second refreshes during pulls.
- 2026-11-13: Said "great job with the overview" and asked to merge Overview, Licenses and Clients
  with all details together; tabs to be split out later. Merged them into one Overview page read
  once from the store. Earlier: the Clients page sat at 95% for 70 seconds; not yet diagnosed (the
  owner stopped the timing run), but the merge removes a second full assessment.
- 2026-11-13: Asked why every page change pulls streams again. A stream counted as due 30 seconds
  after its last pull, and the browser's 2-minute cooldown lived in memory. Pages now pull a stream
  only after 5 minutes, and the cooldown is 5 minutes, kept in session storage (`a00357c`). All 60
  streams were healthy, with no errors left after the boolean fix.
- 2026-11-13: Asked to remove `/customers` and use clients, keeping the Internal/External flag.
  Removed the section and its Salesforce pages (54 customers, all CallAnchor clients; no org
  connected); the flag already lives on the client page in `ca_client_flags`.
- 2026-11-13: Asked why going from Overview to Licenses pulled again ("0 of 60"). Live edits
  reloaded the page mid-pull, and unfinished or failed streams stay due. Made the pull one job per
  tab that survives page changes, with a 2-minute cooldown.
- 2026-11-13: Asked what "14 failed so far" were. All were `cannot cast type boolean to boolean[]`:
  the uncommitted postgres.js driver sends JS boolean arrays as one boolean. Sent them as text
  cast in SQL, and the progress panel now lists failures by cause.
- 2026-11-13: Called the "5 · 5 · 5 · 3" seat column broken; wants each as a number with a ring
  filled by percentage (active ÷ purchased, logged in ÷ active, calling ÷ active), keeping the column
  names, with the formula in an info tooltip. Built the rings and tooltips.
- 2026-11-13: Asked for a loader with a percentage, pulling batch by batch so loading doesn't look
  endless. Moved pulls out of page rendering into batched browser-driven pulls with progress.
- 2026-11-13: Asked to merge Licenses and Seats, since an unused seat is an unused license. Merged
  them into Licenses.
- 2026-11-13: Shared a screenshot of the CallAnchor support portal ("neat and eye friendly") and
  called the health UI lame. Rebuilt the page headers as dark heroes with key numbers, stat strips
  with icons and accents, and icon tabs; added the look to the SOP.
- 2026-11-13: Asked to clean all data after the push to start fresh. Chose pulled data and settings,
  on Neon and Supabase. Emptied 15 tables on Neon (80,920 rows) and 14 on Supabase (37,636; no
  `ca_daily` there yet), including Settings and Internal marks; members, customers, audit notes,
  CallAnchor logins and reply suggestions kept. The next Clients visit pulls 5 days.
- 2026-11-13: Said "test first", then "commit", then "push". Tested the link helpers, redirects and
  breadcrumb (5 passing tests on `trail.ts`, `format.ts`, `_views/query.ts`) and the staged commit
  alone on the Neon driver; committed and pushed `dd2be81`. The database move stays uncommitted.
- 2026-11-13: Asked for the Calls & logs filters to follow the actual flow, with standard UI
  notation so one view gives clear visibility. Rebuilt the panel as the journey stepper with status
  colours, per-step "stopped" counts, a count on every stage and a legend.
- 2026-11-13: Asked for collapsible sections, one open at a time, everywhere there are several.
  Made the Calls & logs filter panel an accordion (Kind and each Stage group); added the SOP rule.
- 2026-11-13: Accepted Supabase's terms, and set retention: detailed data 15 days, snapshots (cached
  info, so pages needn't pull each time) up to a month. Provisioned Supabase in Mumbai, added the
  `ca_daily` snapshot so 30-day day strips survive the 15-day prune, and cut call lists and open
  drops to 15 days. Made the retention rule an SOP rule.

- 2026-11-13: Asked what the Stage list on Calls & logs is and whether it looks clean. Explained it
  filters calls by where they are in the journey; agreed it isn't clean (37 options, no counts). Added a
  recommendation; nothing built yet.
- 2026-11-13: Said the navigation is bad: from an error they can't trace back where they came from.
  Wants every page hierarchical, client on top with everything inside it, visible in the URL, tabs,
  sub-tabs and left menus; and buttons and readable sections instead of hyperlinks everywhere. Moved
  client pages under `/health/clients/<client>/`, added the breadcrumb and client tabs, and restyled
  links as row text, chips and buttons. Rules added to the SOP.
- 2026-11-13: Asked for Stage and Kind filters on the left of the items page. Built the filter panel.
- 2026-11-13: Asked to move the database near India, as an internal app. Neon has no India region
  (Singapore is its closest); Mumbai connects in ~35 ms from the owner's machine against ~140 ms.
  Owner chose Supabase in Mumbai on the Free plan. Swapped the driver to postgres.js and started
  provisioning; the Supabase terms need the owner's acceptance in the browser.

- 2026-11-13: Said local takes too long to pull data and render. Measured it: the database round trip
  is ~140 ms, but throughput from the owner's machine to Neon in Singapore was 56–230 KB/s while the
  internet elsewhere ran at 5.8 MB/s, and a Singapore test server sent nothing in 60 s, so it's the
  ISP's route, not the code or Node. A fleet visit reads ~6.4 MB of calls (65 s at that speed) and
  waits on ~57 CallAnchor pulls first. No code changed; added a recommendation with the options.

- 2026-11-13: Said Seats, Licenses and Clients are related and should link to each other, with a
  Client Health Overview page. Built the Overview tab and Health · Phones · Seats links on every
  client-scoped page and row.
- 2026-11-13: Asked for the "Needs action" issues as rows, not cards, for better use of space.
  `IssueList` now renders a table, one row per issue, everywhere it's used.
- 2026-11-13: Showed the "By device model" list squeezed into a side column and blank space beside
  the page; wants content shifted left and stretched to the right, no side margins, no "Whole page"
  option anywhere, and CallAnchor Config / `call_anchor_config` renamed CallAnchor / `call_anchor`.
  Built all four; old URLs redirect.
- 2026-11-13: Said the health UI is tacky and confusing for non-devs; liked the call page's journey
  and wants the whole UI at journey level (phone → app → upload → CRM → synced with recording), to
  see which client faces what issue, the last successful call per license and client, and the ids
  linked from phone to CRM. Built the journey roll-ups, call journey with ids, last call through and
  Find by ID. Found the phone's own call id is never sent; added a recommendation.
- 2026-11-13: Asked to freeze the top bar, move Clients/Licenses/Seats/Settings into a top sub-bar,
  and make the On this page sections a left menu where each opens on its own. Built it and replaced
  the left-menu rule.

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
  structured, ahead of a global search bar in CallAnchor. Found that the callout list already
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
