# CID Autopsy

Internal console built with Next.js 16 (App Router), deployed on Vercel from this repo.

| URL | What it is | Who signs in |
| --- | --- | --- |
| `/admin` | Admin Console: create, disable, reset passwords for and delete agents/members | The admin (credentials from env vars) |
| `/dashboard` | Dashboard: home for sub apps | Agents/members created in the Admin Console |
| `/dashboard/call_anchor_config` | CallAnchor Config sub app (placeholder) | Agents/members |

## Security model

- **Two separate sessions.** Admin and dashboard each use their own signed (HS256) httpOnly, `Secure`, `SameSite=Strict` cookie, scoped to `/admin` or `/dashboard`. A token from one console is rejected by the other (JWT audience check).
- **Defence in depth.** `proxy.ts` turns away requests without a valid token, and every page and server action re-checks the session. For members, that check also hits the DB, so a disabled member or one whose password was reset is signed out on their next request.
- **Passwords** are bcrypt-hashed (cost 12). The admin password is stored only as a hash, in an env var.
- **Brute-force protection.** After 5 failed logins per ID, or 25 per IP, within 15 minutes, further attempts are refused.
- Sessions last 8 hours. Pages are `noindex` and sent with strict security headers.

## Deploy on Vercel

1. Import this GitHub repo in Vercel.
2. **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. Add the env vars below (Settings → Environment Variables).
4. Deploy. `npm run build` applies `db/schema.sql` before building, so the tables are created automatically.

### Environment variables

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Set by the Neon integration |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `ADMIN_USERNAME` | The admin's sign-in ID |
| `ADMIN_PASSWORD_HASH` | Output of `npm run hash-password -- '<password>'` (use the "Vercel" line) |

Changing `SESSION_SECRET` signs everyone out. Changing `ADMIN_USERNAME` signs the admin out.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values; use the escaped hash line from hash-password
npm run db:migrate
npm run dev
```

## Adding a sub app

1. Register it in [lib/sub-apps.ts](lib/sub-apps.ts). This adds its dashboard card and nav link.
2. Create `app/dashboard/(app)/<slug>/page.tsx` and call `await requireMember()` at the top. Server actions must call it too.
