# Client health: QA report

Date: 5 Nov 2026. Reviewed by reading every file of the health tool and running read-only counts on
the store (the shared production database). Counts only, no customer data, no CallAnchor calls. Data
as of 5 Nov, 03:05 IST. No code was changed.

Scope: `lib/callanchor/issues.ts`, `health.ts`, `store.ts`, `labels.ts`, `db/schema.sql`, and every
page under `app/dashboard/(app)/call_anchor/health/`. Measured against the owner's goals:

- A recorded call must be uploaded, have its recording, and be synced to the CRM. Any drop is
  flagged early.
- A purchased license must sync its calls consistently, every working day, not only once.
- The data is unambiguous and the UI isn't deeply nested.

Severity: **P0** blocks the goal, **P1** shows a wrong or misleading number, **P2** is unclear or
inconvenient.

## 1. Summary

The design is sound and the per-call table (`ca_calls`) is the right base. Five things stand between
it and the goals:

1. **The new build has never run on real data.** The license link, full log lines, per-client log
   streams and issue memory are all empty (section 3).
2. **Everything is judged on the last 24 hours.** A recording broken for two days, or a client at 0%
   for six days, either disappears or looks new (sections 4 and 6).
3. **License rules mostly compare a phone with other phones**, so they can't fire at the 16 clients
   with one phone, and nothing measures whether a phone syncs every day (section 5).
4. **The same word means different numbers on different screens**, such as "reached the CRM" (section 9).
5. **Nobody is told.** Data moves and issues are found only when someone opens the page (section 10).

## 2. Data snapshot

| Measure | Value |
| --- | --- |
| Clients | 53: 22 active, 13 trial, 18 inactive |
| Calls stored | 10,211; 3,282 in the last 24 hours |
| Calls in 24 hours with no stored ingest log | 2,167 (66%) |
| Calls linked to a license | 0 |
| Licenses stored / in the tenants | 14 / 132 |
| License changes, issue states, reply suggestions | 0, 0, 0 |
| Per-client log streams | 0 (3 clients qualify) |
| Time since the last pull | 6.5 hours |
| Active or trial clients with exactly one license | 16 of 35 |
| Active seats logged out | 36 of 88 (41%) |
| Clients with two active integrations | 4 |

## 3. Data pipeline (P0)

| ID | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| D1 | No pull has run since the new store code. `raw`, `license_id`, `ca_licenses`, `ca_license_changes` and `ca_issue_state` are empty or nearly so | 0 of 5,221 `call.create` logs have `raw`; 14 of 132 licenses stored | One signed-in visit, then re-run these counts |
| D2 | The per-client log streams for busy clients were never created, so finding D (missing logs) is still open | 66% of the last 24 hours' calls have no ingest log | Confirm the streams appear after D1. If not, debug `busyClients()` in `store.ts` |
| D3 | Pulls happen only on visits | 6.5 hours stale at the time of checking. CallAnchor keeps logs about 3 days, so an unvisited weekend leaves gaps for good | Scheduled pull (existing recommendation) |
| D4 | License attribution comes only from the ingest log | Even after D1, busy clients' phones would show a fraction of their calls | Fix D2 first; find a second source for the license (open question) |
| D5 | Logs stored before 5 Nov will never get a license | CallAnchor has dropped them | Accept, and show "license history from <date>" |

## 4. Recording chain: recorded → uploaded → verified → synced

Last 7 days:

| Step | Calls | Drop | Flagged now |
| --- | --- | --- | --- |
| Recorded (`pending_upload`) | 1,491 | | |
| Upload started | 1,326 | 165 never uploaded | 49. The 116 older than 24 hours appear nowhere |
| Uploaded | 1,325 | 1 | yes |
| Verified | 1,325 | 0 | |
| Synced (`recording.ready` 2xx) | 1,259 | 66 not synced | 22. The 44 older than 24 hours appear nowhere |

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| R1 | P0 | Issues read only the last 24 hours (`clientIssues`, `issues.ts:254`). A broken recording drops off the list without being fixed | Keep a recording flagged until it's resolved, back to the start of the store |
| R2 | P0 | The 30-minute grace is far too slow for steps on the server. Upload to verified takes 4 s at the median, 9 s at p90 and 3.8 min at most | About 5 minutes for verify and sync. Keep a longer grace only for the phone's upload |
| R3 | P1 | A recorded call counts as synced when only `call.completed` reached the CRM. The recording never did | 5 calls in 7 days. For recorded calls, require `recording.ready` (this changes the 4 Nov rule, so it needs the owner) |
| R4 | P1 | CallAnchor marks 23 calls `not_recorded`, yet they were uploaded and verified. They count as "Uploaded" but not as "Recorded", and nothing flags the contradiction | Flag the contradiction; count them in Recorded |
| R5 | P1 | 1,009 calls delivered `recording.ready` but have no ingest log, so they're missing from the "Recorded" step (about 40% undercount) | Fix D2; meanwhile treat a `recording.ready` callout as proof the call was recorded |
| R6 | P1 | A recorded call at a client whose integration lists only `call.completed` is checked by no rule. `unsynced` needs `takesRecordings`, and `missing` skips `pending_upload` (`issues.ts:104-131`) | Check against whichever events the integration takes |
| R7 | P2 | "Late sync" counts from ingest, so it includes the phone's upload wait and overlaps "Phones haven't uploaded" | Measure from the moment the call was ready to send |

## 5. Licenses (agents)

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| L1 | P0 | No call is linked to a license (D1, D4). Every phone shows 0 calls and "learning" | D1, D2 |
| L2 | P0 | "Stopped capturing", "stuck on phone", "not recording" and "CRM rejects this phone" all need other phones to compare against (`issues.ts:592-650`). They can't fire at the 16 clients with one phone | Rules against the phone's own history and absolute limits; use peers only as a hint |
| L3 | P0 | There's no "last good CRM sync" per phone, so "no sync since Tuesday" can't be seen | Store and show it; flag after N working hours while logged in |
| L4 | P1 | Nothing measures consistency. A phone that syncs on 3 days out of 7 looks healthy on each good day | Days synced ÷ days active, over 7 and 30 days, shown as a day strip |
| L5 | P1 | No rule compares a phone's sync rate with its own past. A slow decline is never caught | Flag a fall against its 7-day level |
| L6 | P1 | A phone's "verified, not synced" recordings have no rule; that check exists only per client | Add the recording chain per license |
| L7 | P1 | Purchased seats: logged out is info only, and only if an agent is assigned. An unassigned seat gets nothing, and the Licenses page hides info by default | 36 of 88 active seats are logged out. 10 phones are logged in but never called. Show seat use; flag a seat unused for more than a day |
| L8 | P1 | "Stopped capturing" needs a 7-day baseline and at least 3 calls a day, and ignores working hours | Cover new and low-volume phones with "no call in N working days" |
| L9 | P2 | Logins, logouts and device swaps are seen only on a visit (at most every 10 minutes), so short logouts and churn are missed | Scheduled pull (D3) |
| L10 | P2 | When a phone gets a new agent, the old and new agents' baselines are mixed together, and the history shows "a member → another member" | Start a new baseline when the agent changes, and name the change |
| L11 | P2 | App updates and device swaps are recorded but never linked to a later drop | Mark changes on the phone's day strip |
| L12 | P2 | A rolled-up phone issue is counted over the affected phones, but its drill opens the whole client's calls, and its hourly spark is flat | Drill to the affected phones only; build the spark from their calls |
| L13 | P2 | The status "Note" (info, for example an older app) counts as OK on the fleet but sorts as its own status | Treat it as healthy with a note |

## 6. Over time

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| T1 | P0 | Long-running failures look new. One client has synced 0% on each of the last 6 days (570 calls on 4 Nov), yet its "since" is within the last 24 hours | "Since" from the stored history, not the 24-hour window |
| T2 | P1 | An issue unseen for 6 hours starts again. With visits only, every weekend resets every issue | Tie episodes to the data, not to visits |
| T3 | P1 | Fixed thresholds only. One client went 57 → 79 → 78 → 17% (caught, since 17% is under the line); a steady client falling from 100% to 90% stays quiet | Add a "below its own baseline" rule |
| T4 | P2 | No day-over-day view for a client or a phone, though the data is stored | 7-day strip per client and per license |
| T5 | P2 | "Client went quiet" ignores weekends and holidays | Working days, set by the owner (open point) |

## 7. Integrations (CRM endpoints)

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| I1 | P0 | Switching an integration off silences the missing-callout and unsynced checks, and "No active CRM integration" is only info. Integration changes aren't recorded | 2 clients have 58 calls in 24 hours and no active integration. Record integration changes the way license changes are; flag an integration switched off at a calling client |
| I2 | P1 | A call counts as reached when any integration accepted it, so one CRM's failures are hidden by another's success | 4 clients have two integrations (0 hidden today). Check each integration separately |
| I3 | P1 | The same goes per event: a failed `recording.ready` is hidden by a delivered `call.completed` | Same as R3 |
| I4 | P1 | A 2xx delivered twice, probably a duplicate CRM record, isn't flagged | 4 calls, 10 replies in 7 days |
| I5 | P2 | A stale integration health check is info only | Warning when calls are flowing |

## 8. Account and CallAnchor platform

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| A1 | P1 | Seat use (purchased → assigned → logged in → syncing) is shown nowhere. It's the clearest renewal-risk signal | One row per client on the fleet table |
| A2 | P2 | Inactive clients still get CRM issues; only account and quiet issues are muted | Mute all, or show them separately |
| A3 | P2 | No trial-conversion view, though 6 trial phones never called | Trial section |
| A4 | P2 | "`N` recorded of no limit" is broken copy (`issues.ts:456`) | Fix the wording |
| P1 | P1 | A CallAnchor-wide stall shows as many client issues, not one fleet issue | Fleet rule: callouts stopped across most clients |
| P2 | P2 | Platform-fault drills don't filter by severity, so the count and the rows only agree by chance (`PLATFORM_FAULTS`) | Same filter in both |

## 9. Numbers that disagree with each other

| ID | Sev | Where | Problem |
| --- | --- | --- | --- |
| N1 | P1 | Fleet "Reached CRM" vs the client page | The fleet divides by all calls (`health.ts:305`), the client page by settled calls. One client shows 64.7% on the fleet and 100% on its own page. A client with no integration shows 0% in red |
| N2 | P1 | `crm_rejecting` | Severity uses the 4xx share, but the evidence prints the overall success %, so a card can show 70% and still be only a warning |
| N3 | P1 | "CRM is rejecting every call" | With only 401 and 403 replies, it fires with an impact of 0 calls |
| N4 | P1 | "Recordings stuck on the phone" | The count includes "uploaded, not verified", which is on the server; the drill opens `waiting` only, so the count and the rows differ |
| N5 | P1 | CRM funnel | "Calls" (ingested, 1,115) is smaller than "Sent" (3,177); the bar caps at 100% |
| N6 | P1 | Call page | The stored timeline says "delivered (CallAnchor: failed)"; the live request card shows "failed" in red for the same 2xx |
| N7 | P2 | Call journey | "Sent" shows Not expected for a recorded call when only `call.completed` is configured; with no integration it shows "Not yet" forever |
| N8 | P2 | Fleet error table vs issues | Errors are counted by callout time, issues by call time, so their 24-hour totals differ |
| N9 | P2 | Clients tile | Counts 53 clients, including 18 inactive the table hides |
| N10 | P2 | Calls tile | A rolling 24 hours (2,446) beside CallAnchor's calendar "today" (725) |
| N11 | P2 | "Uploaded" | Means verified on the fleet, upload-complete in the client funnel |
| N12 | P2 | Client page | Issues always cover 24 hours while the window picker (3, 7, 30 days) changes the funnels; a 30-day drop can have no issue |

## 10. UI, navigation and the operator

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| U1 | P1 | Five clicks to evidence: fleet → client → issue → items → call → license. The issue page is mostly a stop-over before "Open the affected items" | The issue card opens its calls directly, with the evidence and checklist in a panel above the list |
| U2 | P1 | The issue card has two different links (the impact text and "Open") | One link |
| U3 | P2 | Breadcrumbs lose your place: items and call pages don't link back to the issue, and the license page skips the Licenses list | Carry the origin in the breadcrumb |
| U4 | P2 | The fleet page is long: coverage, 9 cards, platform line, tiles, table, error table, log sources | Tiles first; collapse the error table |
| U5 | P1 | The recording chain sits beside the CRM funnel, below the issues | Make it the first thing on the client and license pages |
| U6 | P2 | "Ongoing" on account issues, which have no timing | Label them "Account state" |
| U7 | P2 | The Phone filter on the items page shows the raw license id | Show `…1234` |
| O1 | P0 | No alerts. "Flag sooner" needs someone to open the page | Slack or email for new critical issues and for a phone with no sync |
| O2 | P1 | No owner, acknowledge, notes or resolved list | Phase 4 items in the plan |
| O3 | P2 | No "what changed since my last visit" | Diff against the last visit |
| O4 | P2 | CallAnchor's portal and ours can disagree on whether a call was delivered (the 2xx rule), with no note explaining why | A one-line explanation wherever they differ |

## 11. Proposed model: one shape at every level

Give each license, integration and client the same three numbers, each against its own history:

1. **Last good sync**: when it last reached the CRM, flagged after N working hours.
2. **Consistency**: days synced ÷ days active over 7 and 30 days, as a day strip.
3. **Chain health**: recorded → uploaded → verified → synced, with drops flagged until fixed.

The fleet table, client page and license page then show the same columns at different zoom levels.
This replaces several one-off rules, removes the need to compare with peers, and keeps navigation
shallow.

## 12. Order of work

1. D1 to D3: one signed-in visit, verify the empty tables fill, add the scheduled pull.
2. Recording chain: R1, R2, R4 to R6, and R3 once the owner decides.
3. Licenses on consistency: L2 to L8, and section 11.
4. Integrations and time: I1, I2, I4, T1 to T3.
5. One definition per number: N1 to N7.
6. Navigation and alerts: U1, U2, U5, O1.

## 13. Needs the owner

- R3: for a recorded call, should only `recording.ready` count as the recording reaching the CRM?
- Working hours and working days for "should be calling" and "quiet" (L8, T5).
- How long a phone or integration may go without a sync before it's flagged (L3).
- Whether a seat unused for a day is a warning or a note (L7).
- The alert channel and who receives alerts (O1).

## 14. Status after the 5 Nov build

Built on 5 Nov 2026 the same day, then revised with the owner's answers to section 13. Thresholds are on the health Settings tab. Checked read-only against the store: 165 recordings never uploaded
are now flagged (all 116 older than 24 hours included); the client at 0% for six days reads "since 7
days, 6 days with calls"; every funnel is monotonic. The schema was checked in an in-process Postgres
and applies on the next deploy. The pages haven't been viewed signed in yet.

| Finding | Status |
| --- | --- |
| D1 | Needs one signed-in visit after deploy, then the counts in section 2 again |
| D2 | Fixed: busy clients are chosen by stored calls over 24 hours. CallAnchor's calls-today count restarts at midnight IST, which dropped every client from the list each morning |
| D3, O1 | Not built: need unattended access and an alert channel |
| D4 | Partly: a phone's last call also comes from CallAnchor's lifetime count rising (`calls_grew_at`), which doesn't need its logs |
| D5 | Built: the client page says from when calls are linked to phones |
| R1 | Built: recordings and calls never sent stay flagged back 30 days until fixed, with how many are older than 24 hours |
| R2 | Built: 30 minutes for the phone's upload, 5 for verify, sync and callouts |
| R3 | Settled: both events are valid syncs; `recording.ready` is a connected, recorded call and `call.completed` a missed or rejected one (owner). No note |
| R4, R5 | Built: an upload or a delivered `recording.ready` proves a recording; the contradiction is a note |
| R6 | Built: verified recordings are checked against whichever events the integration takes |
| R7 | Built: late is measured from when the call was ready to send |
| L1 | Fills after D1 |
| L2 | Built: phone rules use the phone's own history and absolute limits; other phones are a hint. With one phone, the client's issues cover it |
| L3 | Built: last good sync on every phone; "No CRM sync since …" when its calls stop while other phones sync. Warning after 2 hours, critical after 12, both on the Settings tab |
| L4, L5 | Built: synced days out of days with due calls, 7 and 30 days, as a day strip; flagged under 80%. A fall of 15 points against the last 7 days is flagged |
| L6 | Built: the recording chain on every phone's pulse and page |
| L7 | Built: a Seats tab with seat use per client and every unused seat (unassigned, logged out, or no call for a day) since when. Not issue cards (owner) |
| L8 | Built: "No call in N days" for any logged-in phone that has called before (3 days, on the Settings tab) |
| L9 | Waits for D3 |
| L10, L11 | Built: a new agent starts a new baseline and is named live; changes mark the day strip |
| L12 | Built: a shared phone issue opens only the affected phones' calls, with their summed hourly spark |
| L13 | Built: notes don't change a phone's status |
| T1 | Built: rate issues start at the first of the run of bad days |
| T2 | Built: a new episode only when the data begins after the issue was last seen |
| T3 | Built: "Fewer calls reaching the CRM than usual" |
| T4 | Built: 7-day strip on the fleet table and licenses, 30 days on client and license pages |
| T5 | Settled: no working-hours filter; elapsed time, day by day (owner) |
| I1 | Built: integration changes are stored; switched off at a calling client is critical; no integration at a calling active client is a warning |
| I2 | Built: with two or more integrations, each is checked alone |
| I3 | As R3 |
| I4 | Built: `duplicate_deliveries` per call; flagged over 7 days |
| I5 | Built: warning when calls are flowing |
| A1, A3 | Built: seat use per client; a trials section on the fleet page |
| A2 | Built: an inactive client's issues are kept as notes |
| A4 | Fixed |
| P1 | Built: most busy clients quiet at once is one fleet issue |
| P2 | Fixed: platform-fault drills filter like their counts |
| N1 | Fixed: delivered out of due everywhere; no integration shows "—", not 0% |
| N2, N3, N4, N5, N6, N7, N9, N10, N11 | Fixed |
| N8 | Explained on the error table |
| N12 | Explained on the client page's issues |
| U1, U2 | Built: an issue card is one link to its rows, with the evidence and checklist above them |
| U3 | Built: items show the issue and phone in the breadcrumb; calls link back to the items; license pages to Licenses |
| U4 | Built: tiles first; errors, trials and log sources collapsed |
| U5 | Built: last sync, synced days and recording chain come first on client and license pages |
| U6 | Built: account issues read "Current state" |
| U7 | Fixed: phones show as …1234 |
| O2 | Not built (phase 4) |
| O3 | Built: "New since your last visit" on the fleet page |
| O4 | Built: a one-line explanation wherever our status differs from CallAnchor's |
