# Client health: plan for finding critical issues

Status: built 5 Nov 2026, all four phases (see section 11). Measured against the stored data on 4 Nov
2026 (counts only). Thresholds and rules here are starting points for the owner to confirm; they live
in `RULES` in `lib/callanchor/issues.ts`. `PORTAL_SOP.md` records what's agreed.

## 1. What's stored today

| Table | Rows | Covers | Key fields |
| --- | --- | --- | --- |
| `ca_callout_events` | 11,834 | 29 Oct to 4 Nov, 17 clients, 9,858 calls | `call_id`, `client_id`, `event_type`, `status`, `http_status`, `attempt`, `duration_ms`, `label` |
| `ca_system_logs` | 21,528 | 31 Oct to 4 Nov, 26 clients, 13,305 resources | `resource_id`, `client_id`, `source`, `severity`, `detail` |
| `ca_client_snapshots` | 53 | Latest state per client | tenant counts, integrations, OneAPI, lifetime aggregate |
| `ca_sync_state` | 55 streams | Milestones per stream | no stream errors at the time of profiling |

Of the 53 clients, 22 are active, 13 on trial and 18 inactive. Only two CRM platforms appear.

## 2. How the data joins

These are the joins the plan relies on, with how well each one held.

| Join | Result | Use |
| --- | --- | --- |
| `mobile.*` logs `resource_id` = callout `call_id` | 4,918 of 5,220 ingested calls have callouts. `client_id` agreed on all 4,918 | The call's journey, from the phone to the CRM |
| `mobile.call.create.detail` gives the event CallAnchor should send | `not_recorded` sent `call.completed` 3,590 times. `pending_upload` sent `recording.ready` 1,309 times. The exceptions are small (18 + 1) | Lets us flag a callout that should have been sent but wasn't |
| `custom-webhook-sync` logs to callouts | Matches no id we store. But 99% of them match a callout from the same client within 3 s. The log's metadata carries `callRecordId` and `integrationId`, which we drop today | The same delivery seen twice. Storing `callRecordId` should join it to the call directly |
| Mobile logs to a license | Mobile logs carry `actorType: mobile` and an `actorId`, which we don't store. The tenant lists every license with its id and assigned member id. Which of the two `actorId` is hasn't been confirmed | The only per-call link to a license. See section 6 |
| Callout `call_id` to `call.create` log | 2,958 calls have callouts but no `call.create` log, inside the log window. 2,061 of them belong to the busiest client | Shows the system logs are incomplete. See finding D |
| Snapshot integrations to callouts | 15 clients have an active integration with empty `eventTypes`. 11 of them send `recording.ready` anyway | Shows `takesRecordings` is wrong. See finding A |

## 3. Findings that change the design

**A. Recording sync checks are off for 11 sending clients.** `takesRecordings` is true only when an
integration lists `recording.ready`. But 15 active integrations list no events, and 11 of those
clients send `recording.ready`. For them, "uploaded, not synced" is never checked. Empty
`eventTypes` probably means all events (to confirm with CallAnchor).

**B. Retries never fix a CRM rejection.** Of 660 calls retried after a failure, 659 got the same
error on every attempt. Of 661 retried sequences, 655 ended failed. So a 4xx is persistent: someone
has to fix the data or the webhook. This is measured from attempts, not from what the CRM said.

**C. Some calls never reach the CRM, and nothing flags them.** These calls were ingested more than
30 minutes ago and got no callout at all:

- 164 recorded calls (`pending_upload`) across 8 clients that have an active integration
- 26 calls skipped for the trial recording limit (`skipped_trial_limit`). The pipeline doesn't
  count them at all

Today a flag appears only when a client delivered nothing at all in 24 hours.

**D. The stored system logs have gaps.** 2,958 calls have callouts but no `call.create` log. They
cluster in the highest-volume client, even though its other logs are stored. So the recording
counts, and the stuck and waiting lists, undercount for busy clients. The empty hours on 30–31 Oct
are only the edge of CallAnchor's ~3-day log retention. Possible causes: the 150-page cap on the
fleet-wide logs pull, or pages shifting while we read. `GET /api/support/logs?clientId=` exists
(fixture `listSystemLogs.byClient.json`), so we could pull per client for the busiest ones.

**E. `attempt` may be stale.** `saveCallouts` updates status, HTTP code, duration and label on
conflict, but not `attempt`. 4,418 rows show attempt 2 or more, and only 1,786 of them have an
earlier attempt stored. We need to confirm whether a row is one attempt or one delivery that
CallAnchor updates.

**F. Sign-in failures are detected from reply text.** `AUTH_PATTERN` matches words in the CRM's
reply. Each client's webhook replies in its own format, so only HTTP 401 and 403 are reliable.

**G. Failures are fast rejections, not timeouts.** Failed callouts take 160 ms at the median, and
delivered ones take 1.9 s. The 47 failures with no HTTP response also end within 0.5 s, so they're
refused connections rather than timeouts.

**H. Some calls sync late.** 4,802 calls synced within a minute. 18 took more than 15 minutes, and
3 took more than 6 hours. No view shows this yet.

**I. Some clients changed their reply format.** For 3 clients, the shape of the success reply
changed during the window. The reply's content can't be trusted, but a change in its format usually
means someone edited the webhook code. That makes it a useful early warning.

**J. Some flags are noise.** 17 of the 18 inactive clients show "Recording limit reached", and
inactive clients fill the fleet table.

## 4. Which signals to trust

The owner's rule: CRM replies are custom code written per client. They don't identify errors.

| Tier | Signals | Role |
| --- | --- | --- |
| Trusted (CallAnchor and HTTP) | HTTP status class, no response, duration, attempts and their result, expected vs sent event, pipeline stages and timing, counts against the client's own baseline | Decide whether something is an issue, and how severe |
| Evidence (the CRM's reply) | Masked reply or error text, reply shape | Shown as "what the CRM said". Grouped for reading only. Never changes severity |
| Owner-curated (later) | Suggestions: a reply pattern plus a scope (platform or client), mapped to a category and a suggested fix | Adds a hint next to the evidence. Becomes the structured reply layout once that's agreed |

Grouping by label stays, because it's useful for reading. But a group's title is the trusted part,
for example "HTTP 400 · persistent · 1,456 calls". The reply text sits under it as a sample.

## 5. From flags to issues

Today a flag is a sentence computed on each page load. The plan turns each one into an issue: one
problem of one kind, for one license, one client or the whole fleet. Each issue carries:

- A severity, from trusted signals only
- Its impact, in unique calls not in the CRM. Calls, not events: one call can have 12 attempts
- When it was first and last seen, and whether it's new, ongoing or fading (the last 3 hours
  compared with the previous 24)
- Evidence: the trusted numbers, then up to 3 masked reply samples
- A drill to its calls, which already works through `items` and `calls/<id>`

Kinds of issue, with a first rule for each:

| Kind | Rule (trusted signals only) | Severity |
| --- | --- | --- |
| CRM rejecting everything | 5 or more calls in the last 2 h, all ending 4xx | Critical |
| CRM rejecting persistently | Calls whose final outcome is 4xx, at or above the failure-rate thresholds | Critical below 80% success, warning below 95% |
| CRM unreachable | No HTTP response or 5xx on 3 or more calls in a row | Critical |
| CRM sign-in rejected | HTTP 401 or 403 | Critical |
| Expected callout missing | Call ingested, integration active, no callout after 30 min | Critical at 3 or more calls, else warning |
| Calls skipped for the trial limit | `skipped_trial_limit` | Critical if the client has an integration, else warning |
| Recording stuck, waiting or not synced | As today, after fix A | As today |
| Client went quiet | Calls today, or the 7-day baseline, is above 0 but there are no callouts or logs for N hours | Warning |
| Late sync | First delivery more than 15 min after the call | Warning at 5 or more calls |
| Reply format changed | A new success reply shape for a client | Info |
| CallAnchor platform fault | S3 purge, `normalize-cleanup`, retention-purge errors | Info, shown once fleet-wide |
| Our data is incomplete | Stream error, logs missing for calls (finding D), stale snapshot | Shown as a coverage warning, not as client health |
| Account | Limits, trial, license cap, OneAPI. Silent for inactive clients | As today |
| License issues | See section 6 | Rolled up into the client's health |

## 6. Per-license status

Client health hides the case where one phone is broken and the others are fine. Each license, which
is one number on one Android device, gets its own status, issues and drill, and these roll up into
the client.

**What we have per license today.** CallAnchor's tenant response lists each license: logged in,
active, assigned member, last login and login history, device brand and model, firmware, Google
dialer present, app version, recording enabled, call capture policy and lifetime call count (field
list from the `getClientTenant.json` fixture). The store reads the tenant only when someone opens
the dashboard, at most once every 10 minutes (`SYNC.snapshotEveryMs`). It keeps only the client's
totals, so license history needs both a license table and scheduled pulls (the cron
recommendation in `PORTAL_SOP.md`). There are 132 licenses: 77 logged in, at most 14 per client.
In active clients, 36 of 88 licenses are logged out, and 10 logged-in licenses (6 of them on trial
clients) have never made a call.

**What's missing.** The stored calls, callouts and logs don't say which license they came from, so
we can't yet measure anything per license over time. The mobile logs carry an `actorId`, and that's
the link we'd use. Fallbacks: the tenant's `callRecords[].teamMemberId` (a short preview only), and
the anchor log's `agentNumber` (one GET per call, too costly). Step 0 is to confirm, with one GET,
whether `actorId` is the license id or the member id (open question 16).

**Status per license**, from trusted signals only:

| Status | Rule | Severity |
| --- | --- | --- |
| Not capturing | Logged in, the client is calling, but this license has had no calls for N hours, when its 7-day baseline says it usually does. Or it has never made a call | Warning. Critical if it lasts a working day |
| Not recording | Recording is on for the license or client, but most of its calls come in `not_recorded` | Critical: the phone can't record |
| Recordings stuck on the phone | Its recordings are waiting, or failed to upload, while other licenses upload fine | Warning. Critical at 3 or more |
| Upload or cleanup errors | `upload-failed` or `normalize-cleanup` logs for its calls | Warning |
| CRM rejects this license | Its calls fail at a much higher rate than its peers in the same client (HTTP class only, not the reply text) | Warning. Points at agent mapping or data, not the webhook |
| Late syncs | Its calls reach the CRM late, often because the phone went offline | Info. Warning at 5 or more calls |
| Logged out | A license that is assigned and active is logged out while the client is active | Info |
| Outdated app | Older than the app version most licenses in the fleet run | Info |
| Device risk | A device model or firmware where other licenses in the fleet show "not recording" or "stuck" | Info. A cross-fleet hint |
| Login churn | Frequent logouts or device switches in its login history | Info |
| Healthy, idle | Calls flowing with no issue / not logged in and not expected to call | — |

**Roll-up.** A client's health includes "2 of 14 licenses critical". When most of a client's licenses
show the same problem, it's raised once as a client issue, not as many license issues, because the
cause is likely shared (the webhook, an account limit or a settings change).

**Privacy.** The store keeps the license id, the last 4 digits of the number, its state, device, app
version and recording settings. Agent names and full numbers stay out of the store. The client and
license pages read them live from the tenant, as the licenses table does today.

## 7. Data changes (when building)

1. **Fixes:** derive `takesRecordings` with empty `eventTypes` treated as all events. Update
   `attempt` on conflict. Store the callout's `requestId`. Count `skipped_trial_limit`. Treat only
   401 and 403 as sign-in failures.
2. **License link:** store `actor_type` and `actor_id` on system logs, but never `actorEmail`.
   Also store the webhook-sync log's `callRecordId`.
3. **`ca_licenses`, one row per license.** Updated with each snapshot: client, license id, assigned
   member id, last 4 digits, active, logged in, last login time, device, firmware, dialer, app
   version, recording enabled, call policy and lifetime calls. Keep a dated row when the state
   changes (a login, logout, app update or device switch), so the license page can show its history.
4. **`ca_calls`, one row per call.** Kept up to date on each save: client, license, ingested time,
   recording detail, stage timestamps, expected event, best CRM outcome, first delivered time,
   attempt count, and last HTTP code and label. Issues, the funnel and the drills then read one
   table, per client or per license, instead of rebuilding call state from all logs on every page.
5. **Coverage:** count each stream's rows per hour, and count calls with callouts but no log, so the
   UI can say where the data is thin. Try per-client log pulls for the highest-volume clients
   (GET only, which is allowed).
6. **`ca_issue_state`:** scope (fleet, client or license), first seen, last seen, and later, who
   acknowledged an issue and a short note. Issues are still computed; this only remembers state
   between loads.
7. **`ca_reply_suggestions`:** pattern, scope, category, suggestion and author. Empty at first.
   Filled as suggestions come in.

Everything stays masked, with no payloads, as the SOP requires.

## 8. UI

The aim: an operator can answer "what's broken, how bad, since when, and what do I check" in under
a minute, then drill down to the call that proves it.

**Fleet page, as triage.**

- A "Needs action" band at the top: one card per critical or warning issue, worst impact first.
  Each card says the client, what's wrong in plain words, the impact ("312 calls not in the CRM
  since 09:40"), whether it's new or ongoing, a small hourly spark, and one Open button.
- Below it, a calmer client table: Client · Health · Calls 24h · Reached CRM (% of calls) ·
  Recordings (uploaded/synced) · Open issues · Last activity. Inactive clients are hidden by
  default behind a toggle.
- Platform faults go in one quiet line.
- A data coverage line, saying when data is thin or behind, replaces today's raw store note.

**Client page, top-down.**

1. A verdict: the health badge plus one sentence, such as "CRM is rejecting every call since
   3 Nov, 09:40".
2. Issue cards, the same component as on the fleet page.
3. The call journey as a funnel: Calls → expected callout sent → CRM accepted, and Recorded →
   uploaded → verified → synced. Each drop opens the calls lost at that step.
4. CRM replies in two columns: "What we know" (HTTP class, attempts, persistent or transient,
   timing) and "What the CRM said" (masked samples, labelled as the client's own format, with a
   space for suggestions).
5. Licenses: one row per license, with its status badge, calls today against its baseline,
   recorded and uploaded counts, CRM success, last call, app version and device. Worst first, and
   each row opens the license page. Problem licenses also show in the verdict line ("2 of 14 phones
   not recording").
6. The trend chart, with failures split by HTTP class.
7. Integrations, account and audit, collapsed by default.

**Licenses page (new, fleet-wide).** Every license that needs action, across clients, filterable by
status, client, app version and device model. A side panel groups problems by device or app version,
which shows when an issue follows a phone model rather than a client.

**License page (new).**

- A header with the client, the number's last 4 digits, the agent (read live) and its status
- Its issues
- Its own call journey funnel and an hourly activity strip, against its 7-day baseline
- Device, app and settings, with a history of changes (logins, logouts, app updates, device
  switches), so "it broke after the app update" is visible
- Its calls, paged, each opening the call page

**Issue page (new).** One issue in depth: an explanation, the trusted evidence, an hourly timeline,
the affected calls (paged), reply samples, matching suggestions, and a short "what to check"
checklist for its kind. Acknowledge and note come later.

**Call page.** A journey stepper above the timeline: Ingested → Uploaded → Verified → Sent →
Accepted, marking expected vs actual and the time between steps. It also names the license, which
links to the license page.

**Fleet page.** Issue cards can be license-level ("…4821 at Client X is not recording"). The client
table gets a Licenses column, for example "12/14 OK · 2 critical".

**Throughout:**

- Plain words
- Times in IST, with "since" and "still happening?"
- Status shown with colour, icon and a word
- Every number links to its rows, as today
- Thresholds explained where they apply
- Works at phone width

## 9. Phases

1. **Correctness:** fixes A, C, E, F and J, plus the coverage counts. Confirm what `actorId` points
   to, then start storing the license link and `ca_licenses`, so per-license history builds up from
   then on. Small, with no new pages. The numbers the dashboard already shows become right.
2. **Call state:** the `ca_calls` table with its license column, the issue engine (sections 5 and
   6), and the funnel numbers.
3. **Triage UI:** the fleet and client redesign, including the client's license table.
4. **Depth:** the licenses and license pages, the issue page, call stepper, issue state, the
   suggestions registry, then the structured reply layout once agreed.

Per-license baselines need about 7 days of stored history. Until then, license statuses that
compare against a baseline show "learning".

## 10. Needs the owner

- Confirm or adjust the rules and thresholds in sections 5 and 6.
- Per license, what counts as "should be calling": its own 7-day baseline, working hours (which
  ones?), or both?
- Should license issues alert on their own, or only through the client roll-up?
- Hide inactive clients by default?
- Do you want acknowledge and notes on issues (phase 4)?
- How will suggestions arrive (a form in the portal, or edits here), and who can add them?
- Questions for CallAnchor are added to `callanchor-apis/docs/open-questions.md` (12–16).

## 11. What was built (5 Nov 2026)

| Phase | Where |
| --- | --- |
| Fixes A, E, F, J; license link; `ca_licenses` with a change history; per-client log streams for the 3 busiest clients (finding D); coverage line | `lib/callanchor/store.ts`, `lib/callanchor/labels.ts`, `db/schema.sql` |
| `ca_calls`, rebuilt by `ca_refresh_calls()` after every save; the issue engine; funnels | `db/schema.sql`, `lib/callanchor/issues.ts`, `lib/callanchor/health.ts` |
| Fleet triage (needs-action band, calmer client table, inactive hidden), client page top-down | `health/page.tsx`, `health/FleetTable.tsx`, `health/[clientId]/page.tsx` |
| Licenses and license pages, issue page, call journey stepper, `ca_issue_state`, `ca_reply_suggestions` | `health/licenses/`, `health/issues/`, `health/calls/` |

Where the build differs from the plan:

- **The license link is `metadata.licenseId`, not `actorId`.** Step 0 showed `actorId` is the member
  on `upload-complete` (open question 16).
- **No double counting of recorded calls.** A recorded call that never reached the CRM stays under
  "Recording waiting, stuck or not synced". "Expected callout missing" covers calls that weren't
  recorded and got no callout. Finding C's 164 are the waiting recordings.
- **Issues cover the last 24 hours for rates**, with an 8-day read for baselines; recordings and calls
  that never reached the CRM stay flagged back 30 days (QA follow-up, `docs/client-health-qa.md` §14).
  The client page's window sets its funnels, replies and trend only.
- **First seen** is the earliest of the oldest affected call, the run of bad days, and
  `ca_issue_state`. An issue starts a new episode only when its data begins after it was last seen.
- **"Not recording"** needs recording on for the license, the phone itself recording most of its calls
  over the last 7 days, or other phones at the client recording most of theirs. This keeps clients
  that don't record by choice from being flagged.
- **"Client went quiet"** is a day with no calls or callouts, for a client with at least 5 calls a day
  over the last 7 days. Plain elapsed time, no working hours (owner, 2026-11-05); the length is on the
  Settings tab.
- **Not built yet:** acknowledge and notes on issues, a way to add suggestions (the table exists and
  is read; rows are added by hand for now), and per-license history before license-linked calls
  are stored. License baselines show "learning" until about 12 Nov 2026.
