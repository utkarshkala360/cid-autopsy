# CID Autopsy

Internal console built with Next.js 16 (App Router), deployed on Vercel from this repo.

| URL | What it is | Who signs in |
| --- | --- | --- |
| `/admin` | Admin Console: create, disable, reset passwords for, set roles and the auditor permission of, and delete agents/members | Admins (stored in the database) |
| `/admin/audit-notes` | Notes auditors left on dashboard pages, with the page each was on; mark them done or won't fix | Admins |
| `/dashboard` | Dashboard: home for sub apps | Agents/members created in the Admin Console |
| `/dashboard/call_anchor` | CallAnchor sub app | Agents/members |
| `/dashboard/call_anchor/health` | Client health: recordings, CRM syncs and errors for every client | Agents/members with a CallAnchor login |
| `/dashboard/call_anchor/health/clients/<clientId>` | One client: health, licenses (and each phone), seats, calls & logs, calls and issues, each under it | Agents/members with a CallAnchor login |
| `/dashboard/call_anchor/apis` | API console: run CallAnchor's APIs live | Members with the Admin role and a CallAnchor login |
| `/customers` | Customers | Agents/members |
| `/customers/<id>` | A customer and its integrations | Agents/members |
| `/customers/<id>/integrations/salesforce` | That customer's Salesforce orgs; **+ Connect Salesforce** adds one | Agents/members |

**Audit notes.** Members with the auditor permission (set in the Admin Console, on top of their role) see an **Audit note** button on every dashboard and customer page. A note saves the comment and its type with the page's URL, title, heading, query params, any highlighted text, viewport and browser into `audit_notes`. Admins review them at `/admin/audit-notes`; `npm run audit:notes` prints the open ones as Markdown (`-- --days 7` for the last week, any status) for the weekly dashboard review.

## Security model

- **Two separate sessions.** Admin and members each use their own signed (HS256) httpOnly, `Secure`, `SameSite=Strict` cookie. The admin cookie is scoped to `/admin`; the member cookie covers the rest of the app. A token from one console is rejected by the other (JWT audience check).
- **Defence in depth.** `proxy.ts` turns away requests without a valid token, and every page and server action re-checks the session. For members, that check also hits the DB, so a disabled member or one whose password was reset is signed out on their next request.
- **Salesforce credentials are encrypted at rest** with AES-256-GCM under `CREDENTIALS_ENCRYPTION_KEY`, which is kept out of the database, so a DB dump alone exposes nothing. Each ciphertext is bound to its customer and org. Credentials are never sent back to the browser.
- **No account credentials in env vars or code.** Admin and member accounts live in Postgres with bcrypt-hashed passwords (cost 12). The session signing key is derived from `DATABASE_URL`, so rotating the DB password signs everyone out.
- **Brute-force protection.** After 5 failed logins per ID, or 25 per IP, within 15 minutes, further attempts are refused.
- Sessions last 8 hours. Pages are `noindex` and sent with strict security headers.

## Deploy on Vercel

1. Import this GitHub repo in Vercel.
2. **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. Add `CREDENTIALS_ENCRYPTION_KEY` (generate with `openssl rand -base64 32`): `vercel env add CREDENTIALS_ENCRYPTION_KEY production`. Losing or changing it makes stored Salesforce connections unreadable; they'd need reconnecting.
4. Deploy. `npm run build` applies `db/schema.sql` before building, so the tables are created automatically.
5. Create the first admin (see below).

## Managing admins

Admins aren't created through the UI. From a machine with `DATABASE_URL` in `.env.local`:

```bash
npm run admin:create -- '<id>' '<password>'
```

Running it for an existing ID sets a new password and signs that admin out everywhere.

## Local development

```bash
npm install
vercel env pull .env.local   # DATABASE_URL, CREDENTIALS_ENCRYPTION_KEY
npm run db:migrate
npm run admin:create -- '<id>' '<password>'
npm run dev
```

## Salesforce

All Salesforce access goes through the **Salesforce CLI** (`sf`). It's pinned in [sf-cli/package.json](sf-cli/package.json), installed by `postinstall`, and shipped with the server functions. [lib/salesforce/cli.ts](lib/salesforce/cli.ts) runs it with a throwaway `HOME` per call: it logs in with the org's stored SFDX auth URL (`sf org login sfdx-url`), runs the commands and deletes the directory. To act on a customer's org from a feature, use `withStoredOrg(customerId, orgId, run => run(["data", "query", ...]))` from [lib/salesforce/orgs.ts](lib/salesforce/orgs.ts). `npm run sf -- <args>` runs the same CLI locally.

Integrations are configured per customer. Integrations are configured per customer. Connect orgs at **Customers → <customer> → Salesforce → + Connect Salesforce**:

1. Pick **Production**, **Sandbox** or **Custom** (My Domain) and click **Log in to Salesforce**. This starts a temporary, 10-minute login session.
2. Open the login link, sign in and allow access. It's the same OAuth flow as VS Code's "SFDX: Authorize an Org" and uses the CLI's built-in connected app (`PlatformCLI`, with PKCE), so no External Client App or Connected App is needed.
3. That app only redirects to the CLI's local listener (`http://localhost:1717/OauthRedirect`), which a hosted server can't receive. The tab shows "can't be reached"; copy its address back into the app. The code in it only works with the session's PKCE verifier and is single-use.

Orgs already authorized in VS Code can also be imported with `sf org auth show-sfdx-auth-url --target-org <alias>`.

Either way the CLI logs in to verify the org before anything is saved. **Test** re-verifies an org. **Disconnect** deletes its credential and also revokes tokens minted by this app's login (imported ones are left alone, since your local CLI shares them).

## CallAnchor APIs

[callanchor-apis/](callanchor-apis/) is the source of truth for CallAnchor's portal API: the contract, a Postman collection, a CLI and a mock server. It's a standalone Node module with its own `package.json`, kept out of the Next build, so nothing in it ships to Vercel yet. See its [README](callanchor-apis/README.md).

```bash
npm install --prefix callanchor-apis
npm run ca -- list
```

### CallAnchor session

Every CallAnchor page needs a valid portal session, stored per member and encrypted like Salesforce credentials.

- Each page render, and each route change through [SessionGuard](app/dashboard/(app)/call_anchor/SessionGuard.tsx), asks `GET /api/portal/profile` whether the cookie still works. The guard is needed because the router cache can serve a page without reaching the server.
- A `401` or `403`, or no stored session, sends the member to **Validate OTP** at `/dashboard/call_anchor/verify`. After the OTP they return to the page they were on.
- If CallAnchor is down the page stays open, because an OTP couldn't work anyway.

The **API console** at `/dashboard/call_anchor/apis` runs any operation from the contract live with the member's own session and marks whether the response matches. Writes need a confirmation. Responses contain customer data, so only members with the Admin role (set in the Admin Console) see it; anyone else gets a 404.

**Client health** at `/dashboard/call_anchor/health` scores every client from data stored in Postgres, which each visit brings up to date with the member's session, using GET requests only.

[lib/callanchor/store.ts](lib/callanchor/store.ts) keeps the `ca_*` tables:

| Stream | Source | Table |
| --- | --- | --- |
| `callouts:<clientId>` | Each client's `callout-logs` | `ca_callout_events` |
| `logs` | `support/logs`, every client at once | `ca_system_logs` |
| `snapshots` | `/api/fleet`, plus each client's tenant and OneAPI status | `ca_client_snapshots` |

- **Milestones.** `ca_sync_state` holds each stream's milestone, its newest stored row. A visit reads newest-first back to the milestone, minus a 10-minute overlap, and then moves the milestone forward. That's usually one page per stream. A pull less than 30 seconds old is reused.
- **5-day refresh.** Once a day each stream reads the last 5 days again and updates stored rows in place, to pick up late changes. It runs with `after()`, once the page has been sent. A stream's first pull is this same 5-day read, which backfills it (about 20 seconds for the whole fleet).
- **Snapshots** are refreshed every 10 minutes, also after the response.
- **Leases.** A lease on each stream stops two viewers pulling the same data at once.
- **What's stored:** no payloads or CRM replies, only a masked label of what came back. Rows older than 90 days are deleted. The `SYNC` settings hold these numbers.

[lib/callanchor/health.ts](lib/callanchor/health.ts) does the scoring:

- **Consolidated view:** the last 24 hours from the store.
- **One client, over 24 hours or 3, 7 or 30 days:** stored events, plus the tenant, call stats and audit logs read live. A recording is followed from call ingest through upload, verification, the `recording.ready` sync and the S3 purge. A stage with no next step after 30 minutes counts as stuck. History only goes back as far as the store does: CallAnchor keeps about 3 days of system logs, and the first pull stores 5 days of callouts.
- **Masking:** CRM replies are grouped by shape and errors by message, with ids, numbers, emails and links masked.
- **Scoring:** the thresholds are in `THRESHOLDS`.

New CallAnchor pages and server actions must call `requireCallAnchorSession()` from [lib/callanchor/session.ts](lib/callanchor/session.ts). `CALLANCHOR_BASE_URL` overrides the portal URL, for example to use the mock.

## Adding a sub app

1. Register it in [lib/sub-apps.ts](lib/sub-apps.ts). This adds its dashboard card and nav link.
2. Create `app/dashboard/(app)/<slug>/page.tsx` and call `await requireMember()` at the top. Server actions must call it too.
3. To work with a customer's Salesforce, use `withStoredOrg` (see above).
