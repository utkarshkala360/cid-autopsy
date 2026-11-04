# Open questions

Questions for the client health system. Write your answer under each one, and change `Open` to
`Answered`. Background is in [understanding.md](understanding.md).

## Do first

Not a question, but outstanding: rotate the session cookie that appears unmasked in the "CallAnchor
x APIs" sheet (Send OTP and Verify OTP rows), and restrict who can open the sheet. It also holds
live recording links, customer phone numbers and an AWS access key ID.

- Status: Answered
- Notes: It's internal and not visible to anyone

## Blocking the health system

### 1. Unattended access

Login needs an OTP call to a person. How long does a session last, and can we get a service account
or API key? Scheduled monitoring can't run without this. The app now checks sessions with
`GET /api/portal/profile`, and members refresh them with an OTP, but that needs a person present.

- Status: Answered
- Answer: Doesn't matter how it will reset - we need to ensure - whoever signs-in will have save level of view of data pulling - so the data should be unified - and if one logs in the same session can be reused by the other agents/system.

### 2. Client count and polling limits

How many clients are there, and how often may we poll `/api/fleet` and the per-client endpoints in
production? Are there rate limits? There were 47 clients on 2 Nov 2026, so the count is known.

- Status: Answered
- Answer: There are roughly 25 clients - others are test. It will gradually increase not suddenly

### 3. What "push" means

The only write captured is the OneAPI refresh (`backfill`). What should we push? The audit log shows
a manual sync-all, but that endpoint isn't in the sheet. Please capture it and any other actions you
want, using browser dev tools.

- Status: Answered
- Answer: Ignore backfill for automations - let it me for manual visibility.

## Needed for correct numbers

### 4. Quota counters

The sample shows `trialPlatformSyncs` at 17, while `callout-logs` shows 109 delivered.
`trialRecordedCalls` shows 8, with 9 `recording.ready` events in the 20-row preview alone. Which is
correct, and what do the counters actually count?

- Status: Answered
- Answer: Trial platform syncs are allowed syncs when the client status is Trial. When client status is set to Active - even though the Trial platform sync is X - it will be ignored. Even in trial - it can be reset multiple times from admin portal so even though calls increase the limits could reset again and again.

### 5. `OPPORTUNITY_NOT_FOUND`

Is this a real failure, or expected for leads who shouldn't sync? This decides whether the 43% sync
success rate means anything.

- Status: Answered
- Answer: Need a better way of handling it - where we can define what a behaviour is. If the customer expects the call recording not to be synced if opportunity not found - it's a success (with warning), if they want one to be created, it's a failure, etc.

### 6. Gap between call and disposition

The median gap from call start to disposition is about 158 minutes in the sample. Are agents really
filling these in hours later, or is `startedAt` affected by delayed upload or device time?

- Status: Answered
- Answer: Not sure - how does it matter?

### 7. Field definitions

What does `cachedLicenseSeats: -1` mean, given a contract limit of 5? What does a `null` quota limit
in `/api/fleet` mean: unlimited? What are all the `status`
values (`trial`, `active` and `inactive` seen by 3 Nov 2026)? Do the `trial*` and `contract*` counters
ever differ?

- Status: Answered
- Answer: Not sure about contract - but anycase - the number of licenses allowed to the client - should be the actual number of agents fully utilising the platform - if there is reduced usage, or reduced syncing due to issues - that is a client health risk

### 11. Missing `recording.ready` when the upload beats `call.completed`

On one client, uploaded and verified recordings got no `recording.ready` webhook whenever
`call.completed` went out before, or within ~0.1 s of, the upload finishing (6 calls, 31 Oct to
4 Nov 2026). When `call.completed` went out 0.1 s or more after the upload finished, `recording.ready`
always followed (18 calls). Is this a race on CallAnchor's side? Or does `call.completed` carry the
recording in that case, so no separate event is sent?

- Status: Answered
- Answer: Either event reaching the CRM counts as a successful sync (owner, 4 Nov 2026), so the dashboard no longer flags these calls. Why CallAnchor skips `recording.ready` is still unknown.

### 12. Empty `eventTypes` on an active integration

15 clients have an active integration whose `eventTypes` is empty, and 11 of them still send
`recording.ready` (4 Nov 2026). Does an empty list mean every event?

- Status: Answered
- Answer: Not sure - give me list of events you have seen so far from db
- Follow-up (5 Nov 2026): The store has seen two event types sent: `call.completed` (8,670 callouts,
  15 clients) and `recording.ready` (3,316, 17 clients). Integrations list three: those two and
  `recording.deleted`, which has never been sent. The clients whose active integration lists no
  events receive both: `call.completed` at 10 of them, `recording.ready` at 12. So the portal now
  treats an empty list as every event. CallAnchor can still confirm it.

### 13. What `custom-webhook-sync` logs point to

Their `resource_id` matches no callout `id` or `callId`. But 99% of them match a callout from the
same client within 3 s. Is `resource_id` the callout's `requestId`? Their metadata also carries
`callRecordId`. Is that the callout's `callId`?

- Status: Answered
- Answer: Give examples for me to trace and answer

### 14. Is a callout row one attempt, or one delivery that gets updated?

4,418 stored rows show `attempt` 2 or more, and only 1,786 have an earlier attempt stored for the
same call and event. Does CallAnchor update one row as it retries, or add a row per attempt?

- Status: Answered
- Answer: Each retry is stored as an event - let me know what goes to a row
- Follow-up (5 Nov 2026): One row in `ca_callout_events` is one attempt: one callout event, keyed by
  its id, with its event type, attempt number, status, HTTP code, duration and masked reply. No
  request id has two rows with the same attempt number. A retry is a new row, and a re-read of the
  same event now also updates its `attempt`. Rows stored with attempt 2 or more but no earlier
  attempt are retries whose first attempt is older than the stored window. Per-call questions read
  `ca_calls`, one row per call, built from all its attempts.

### 15. Calls with callouts but no `mobile.call.create` log

2,958 calls in the log window have CRM callouts but no `call.create` log. 2,061 of them are from the
busiest client. Are some calls created without that log (for example by a scheduled sync)? Or does
`GET /api/support/logs` drop rows at high volume?

- Status: Answered
- Answer: Could be that the data is removed after retention period - so let's keep this question open - and later we will only allow latest 7 days of stats to be analyzed for health monitoring.

### 16. Which license made a call

Mobile system logs have `actorType: mobile` and an `actorId`. Is `actorId` the license id
(`tenant.licenses[].id`) or the member id (`licenses[].assignedTo.id`)? Either way, it's the only
per-call link to a license we've found. The fixtures come from different clients, so they can't
settle this. One live GET of a client's tenant and its system logs will.

- Status: Answered
- Answer: Not sure - explain the impact first

## To confirm with live data

The read operations were checked live on 2 Nov 2026, across all 47 clients for the per-client ones.
Several fields turned out to be nullable, including quota limits, `cachedLicenseSeats` and
`assignProductStatus`.

These should settle themselves on the first `npm run ca -- check`. Answer here if you already know.

### 8. Shape of `GET /api/clients`

The sheet shows a single object. Is the response an array or `{ items: [...] }`?

- Status: Answered
- Answer: An array, confirmed live on 2 Nov 2026.

### 9. Page size on `callout-logs`

The sample asked for `limit=50` and got `limit=10`. Is there a server cap?

- Status: Answered
- Answer: Yes, 100 rows. `limit=200` returns 100, on both `callout-logs` and `support/logs`
  (checked live on 3 Nov 2026). `support/logs` only goes back about 3 days.

### 10. Window of `callout-logs.aggregate`

Does it cover the client's lifetime or a recent window?

- Status: Answered
- Answer: Not sure - you created this
