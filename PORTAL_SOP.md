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
- The CallAnchor contract changes in `callanchor-apis/openapi/callanchor.openapi.yaml` first, then
  gets regenerated. Generated files are never edited by hand.
- CallAnchor GET APIs may be used freely to pull data. Any non-GET call needs the owner's approval
  first (owner, 2026-11-03).
- Never run `sendOtp`, a write operation or `getRecordingLink` against production unless the owner
  asked for that specific action. `sendOtp` calls a real phone.
- CallAnchor data is stored, not re-pulled from scratch. Visits pull only what's new since each
  stream's saved milestone. The trailing 5 days are refreshed once a day, and every pull saves its new
  milestone (owner, 2026-11-03). See `lib/callanchor/store.ts`.
- A CRM sync succeeded when the CRM replied 2xx, even if CallAnchor marked the callout failed.
  `call.completed` and `recording.ready` both count as the call reaching the CRM, so either one syncs
  its recording (owner, 2026-11-04). See `crmStatus` in `lib/callanchor/labels.ts`.
- Every error, flag and count on the health pages opens the items behind it, one row per item, down
  to a single call's timeline (owner, 2026-11-04).
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
- Store derived, masked data rather than raw CallAnchor responses. The health store keeps labels and
  ids, never payloads or CRM replies.
- Link a health number to its items with a `Drill` and `itemsHref()`; the items page
  (`health/items`) reads the store with the same filters, and `health/calls/<id>` shows one call.
- Run slow background work, like the 5-day refresh, with `after()`, so it doesn't block the page.

## Recommendations

Agent proposals awaiting the owner's decision. Newest first.

| Date | Recommendation | Why | Status |
| --- | --- | --- | --- |
| 2026-11-03 | Give local dev its own Neon branch (set a branch `DATABASE_URL` in `.env.local` and Vercel's Development env) | Local, preview and production all use the same database, so a local visit moves the live milestones and writes live rows, and local schema changes hit production at once | Awaiting owner |
| 2026-11-03 | Confirm the health thresholds: critical below 80% sync success, warning below 95%, critical at 3 stuck recordings, 30-minute grace for a pipeline stage | They decide what's flagged; they're starting guesses (`THRESHOLDS` in `lib/callanchor/health.ts`) | Awaiting owner |
| 2026-11-03 | Raise the S3 purge failure with CallAnchor | Every post-sync S3 deletion failed (0 of 228 succeeded on 3 Nov): their AWS user lacks `s3:DeleteObject`, and the logs mark it `info`. Recordings stay in S3 longer than intended | Awaiting owner |
| 2026-11-03 | Pull on a schedule (Vercel cron) as well as on visits | Data only moves when someone opens the dashboard, so quiet hours leave gaps beyond CallAnchor's ~3-day log retention. Needs unattended access (open question 1) | Awaiting owner |
| 2026-11-03 | Confirm 90-day retention for the stored health data | Older rows are deleted to keep the tables small | Awaiting owner |
| 2026-11-03 | Review `OPPORTUNITY_NOT_FOUND` with the affected client | It was the top CRM error fleet-wide on 3 Nov, so data matching, not an outage, drives the worst sync rates (open question 5) | Awaiting owner |
| 2026-11-02 | Rotate the session cookie exposed in the "CallAnchor x APIs" sheet and restrict access to the sheet | It also holds recording links, customer phone numbers and an AWS access key ID | Awaiting owner |
| 2026-11-02 | Limit the API console to chosen members | Its responses contain customer data, and every member with a CallAnchor login can use it | Awaiting owner |

## Portal changes

Agreed changes. Newest first. Status is Planned, In progress or Done.

| Date | Change | Status | Link |
| --- | --- | --- | --- |
| 2026-11-04 | Item-level drill-down: every flag, error, outcome and count links to its rows (syncs, recordings, system logs), with per-call timelines | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor_config/health/items/`, `health/calls/[callId]/` |
| 2026-11-04 | Count a 2xx CRM reply as success, and either `call.completed` or `recording.ready` as a synced recording | Done | `lib/callanchor/labels.ts`, `lib/callanchor/health.ts` |
| 2026-11-03 | Store health data in Postgres and pull only what's new from each stream's milestone; refresh the last 5 days once a day | Done; tables exist in the shared Neon DB (local `predev` migrated them) | `lib/callanchor/store.ts`, `db/schema.sql` |
| 2026-11-03 | Client health dashboard: consolidated and per-client view of calls, recordings, uploads, CRM syncs, CRM replies and errors | Done, not yet viewed signed in | `app/dashboard/(app)/call_anchor_config/health/` |

## Feedback log

One line per piece of feedback, newest first: date, what the owner said, and what changed.

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
