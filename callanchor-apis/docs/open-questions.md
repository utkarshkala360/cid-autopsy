# Open questions

Questions for the client health system. Write your answer under each one, and change `Open` to
`Answered`. Background is in [understanding.md](understanding.md).

## Do first

Not a question, but outstanding: rotate the session cookie that appears unmasked in the "CallAnchor
x APIs" sheet (Send OTP and Verify OTP rows), and restrict who can open the sheet. It also holds
live recording links, customer phone numbers and an AWS access key ID.

- Status: Open
- Notes:

## Blocking the health system

### 1. Unattended access

Login needs an OTP call to a person. How long does a session last, and can we get a service account
or API key? Scheduled monitoring can't run without this. The app now checks sessions with
`GET /api/portal/profile`, and members refresh them with an OTP, but that needs a person present.

- Status: Open
- Answer:

### 2. Client count and polling limits

How many clients are there, and how often may we poll `/api/fleet` and the per-client endpoints in
production? Are there rate limits? There were 47 clients on 2 Nov 2026, so the count is known.

- Status: Open
- Answer:

### 3. What "push" means

The only write captured is the OneAPI refresh (`backfill`). What should we push? The audit log shows
a manual sync-all, but that endpoint isn't in the sheet. Please capture it and any other actions you
want, using browser dev tools.

- Status: Open
- Answer:

## Needed for correct numbers

### 4. Quota counters

The sample shows `trialPlatformSyncs` at 17, while `callout-logs` shows 109 delivered.
`trialRecordedCalls` shows 8, with 9 `recording.ready` events in the 20-row preview alone. Which is
correct, and what do the counters actually count?

- Status: Open
- Answer:

### 5. `OPPORTUNITY_NOT_FOUND`

Is this a real failure, or expected for leads who shouldn't sync? This decides whether the 43% sync
success rate means anything.

- Status: Open
- Answer:

### 6. Gap between call and disposition

The median gap from call start to disposition is about 158 minutes in the sample. Are agents really
filling these in hours later, or is `startedAt` affected by delayed upload or device time?

- Status: Open
- Answer:

### 7. Field definitions

What does `cachedLicenseSeats: -1` mean, given a contract limit of 5? What does a `null` quota limit
in `/api/fleet` mean: unlimited? What are all the `status`
values (`trial`, `active` and `inactive` seen by 3 Nov 2026)? Do the `trial*` and `contract*` counters
ever differ?

- Status: Open
- Answer:

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

- Status: Open
- Answer:
