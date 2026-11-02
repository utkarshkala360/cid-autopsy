# How CallAnchor fits together

Working notes for building the client health system. Everything here comes from one set of
samples captured on 2 Nov 2026, mostly from one trial client with 5 licenses. Treat the numbers as
examples. The response shapes of all read operations were confirmed live the same day.

## The data flow

1. An **agent** on a **license** (a phone number on an Android device) makes or takes a **call**.
2. The app records it and uploads the recording. System log: `mobile.recording.upload-init`.
3. The agent fills in the client's **disposition** form.
4. CallAnchor sends the call to the CRM as a **callout**, which is a webhook POST. A call with a
   recording sends `recording.ready`; one without sends `call.completed`.
5. The CRM replies. Salesforce returns the Task, Activity and Opportunity ids, or an error.

Failure can happen at any step, so client health is really five questions:

| Question | Where the answer is |
| --- | --- |
| Are licenses in use? | `tenant.licenses`: `isLoggedIn`, `lifetimeCallRecordCount`, login labels |
| Are calls coming in? | `fleet.clientMetrics`: `callsToday`, `totalCalls`; `call-contacts.stats` |
| Are recordings arriving? | `tenant`: `*PendingRecordings`, `callRecords[].recordingStatus`; system logs |
| Are calls reaching the CRM? | `callout-logs.aggregate`, `failedCallouts24h`, `syncedRate`, `integrations` |
| Is the account in good standing? | `tenant` quota and trial fields, `oneapi/status`, `accessSuspended` |

## Session check

`GET /api/portal/profile` is the cheapest validity check. Confirmed live on 2 Nov 2026: a valid
cookie returns 200 with `profile`, and an invalid or missing one returns 401 with `error`.

## Choosing endpoints

- **`/api/fleet` is the starting point.** One call gives a metrics row per client, enough for a
  fleet overview.
- **`/tenant` is the deep read**, at 46 KB per client. Its `callRecords` and `callAnchorLogs` are
  short previews (1 and 20 rows in the sample), not history.
- **History comes from** `callout-logs`, `call-contacts` and `support/logs`.
- **`callout-logs.aggregate` looks lifetime**, not windowed (unconfirmed). If so, a recent fix won't
  show in `successRate`, and a health score needs its own 24-hour or 7-day window from event pages.
- **`requestId` is the key for `anchor-logs`**, not the event `id`. Failure reasons sit in
  `errorMessage`, which is JSON text that needs parsing.

## Signals already visible

- **Sync success is 43%** on the sample client: 109 delivered, 144 failed out of 253. All 3 failures
  in the 20-row preview are `OPPORTUNITY_NOT_FOUND`: the CRM has no Opportunity owned by that agent
  for that number in that project. That may be a data-matching problem, not an outage.
- **No automatic retry is visible.** Every preview row is `attempt: 1`, `retrying` and `queued` are 0,
  and a support user's manual "sync all" failed 19 of 19.
- **Dispositions may be going in late and on autopilot.** In the preview the median gap from call
  start to disposition is about 158 minutes (max 181). All 20 rows have the same task subject,
  priority and next action. Two contradict the call: "connected" with 0 seconds, and
  "not-connected" with a recorded duration.
- **One license has no calls.** It's been logged in since 30 Oct with 0 lifetime calls.
- **Agent stats aren't clean.** One agent appears under two spellings, and an internal staff name
  appears in the client's agent list, so internal test calls may be counted.

## Contract gaps

| Gap | Effect |
| --- | --- |
| `callout-logs` asked for limit 50, returned limit 10 | Possible server cap, which affects paging |
| Enum values seen in only one state (`status: trial`, `severity: info`) | Paid, churned and error values unknown |
| Recording-link sample's response `callId` differs from the requested one | Probably two different captures |
| Timestamps come in three forms: ISO, date-only, display labels in IST | Parse the ISO fields; don't use labels |
| Error response bodies and rate limits were not captured | Only the 200 path is documented |

## Open questions

These are tracked in [open-questions.md](open-questions.md), with space for answers.
