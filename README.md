# CID Autopsy

Internal console built with Next.js 16 (App Router), deployed on Vercel from this repo.

| URL | What it is | Who signs in |
| --- | --- | --- |
| `/admin` | Admin Console: create, disable, reset passwords for and delete agents/members | Admins (stored in the database) |
| `/dashboard` | Dashboard: home for sub apps | Agents/members created in the Admin Console |
| `/dashboard/call_anchor_config` | CallAnchor Config sub app (placeholder) | Agents/members |

## Security model

- **Two separate sessions.** Admin and dashboard each use their own signed (HS256) httpOnly, `Secure`, `SameSite=Strict` cookie, scoped to `/admin` or `/dashboard`. A token from one console is rejected by the other (JWT audience check).
- **Defence in depth.** `proxy.ts` turns away requests without a valid token, and every page and server action re-checks the session. For members, that check also hits the DB, so a disabled member or one whose password was reset is signed out on their next request.
- **No credentials in env vars or code.** Admin and member accounts live in Postgres with bcrypt-hashed passwords (cost 12). The session signing key is derived from `DATABASE_URL`, so rotating the DB password signs everyone out.
- **Brute-force protection.** After 5 failed logins per ID, or 25 per IP, within 15 minutes, further attempts are refused.
- Sessions last 8 hours. Pages are `noindex` and sent with strict security headers.

## Deploy on Vercel

1. Import this GitHub repo in Vercel.
2. **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`, the only env var the app needs.
3. Deploy. `npm run build` applies `db/schema.sql` before building, so the tables are created automatically.
4. Create the first admin (see below).

## Managing admins

Admins aren't created through the UI. From a machine with `DATABASE_URL` in `.env.local`:

```bash
npm run admin:create -- '<id>' '<password>'
```

Running it for an existing ID sets a new password and signs that admin out everywhere.

## Local development

```bash
npm install
cp .env.example .env.local   # paste DATABASE_URL from Vercel
npm run db:migrate
npm run admin:create -- '<id>' '<password>'
npm run dev
```

## Adding a sub app

1. Register it in [lib/sub-apps.ts](lib/sub-apps.ts). This adds its dashboard card and nav link.
2. Create `app/dashboard/(app)/<slug>/page.tsx` and call `await requireMember()` at the top. Server actions must call it too.
