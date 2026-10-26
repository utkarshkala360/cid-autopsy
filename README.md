# CID Autopsy

Internal console built with Next.js 16 (App Router), deployed on Vercel from this repo.

| URL | What it is | Who signs in |
| --- | --- | --- |
| `/admin` | Admin Console: create, disable, reset passwords for and delete agents/members | Admins (stored in the database) |
| `/dashboard` | Dashboard: home for sub apps | Agents/members created in the Admin Console |
| `/dashboard/call_anchor_config` | CallAnchor Config sub app (placeholder) | Agents/members |
| `/customers` | Customers | Agents/members |
| `/customers/<id>` | A customer and its integrations | Agents/members |
| `/customers/<id>/integrations/salesforce` | That customer's Salesforce orgs; **+ Connect Salesforce** adds one | Agents/members |

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

## Adding a sub app

1. Register it in [lib/sub-apps.ts](lib/sub-apps.ts). This adds its dashboard card and nav link.
2. Create `app/dashboard/(app)/<slug>/page.tsx` and call `await requireMember()` at the top. Server actions must call it too.
3. To work with a customer's Salesforce, use `withStoredOrg` (see above).
