# CallAnchor endpoint inventory

Every API path the app.360callanchor.com front end calls, read from its public JavaScript bundles
on 5 Nov 2026. No API was called and no login was used to build this list. Only the page shell of
one client (`cmus74leshej2ewwgii5qaycf`) was loaded, to get the client page's bundle.

How it was built: crawl the 27 route shells and their 81 chunks, then rebuild each path from the
minified code. The shared fetch helper maps to methods like this: `Vg` GET, `$P`/`Rv` POST, `mu`
PUT, `$Y`/`py` PATCH, `Al` DELETE. Response shapes are **not** confirmed for anything marked new;
only the contract in `openapi/callanchor.openapi.yaml` is.

All requests send the session cookie (`credentials: "include"`).

## Read (GET) endpoints

"In contract" means it is already in `openapi/callanchor.openapi.yaml`.

### Session and app

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/auth/me` | | every page (auth provider) | Yes (2026-11-05) |
| `/api/portal/profile` | | profile | Yes |
| `/api/app-build/latest` | | mobile-app pages | Yes (2026-11-05) |
| `/api/trial/pending-session` | `mobile` | trial sign-up | New |

### Fleet and clients

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/fleet` | | support dashboard | Yes |
| `/api/clients` | | support clients list | Yes |
| `/api/clients/{clientId}` | | client page | Yes |
| `/api/clients/{clientId}/tenant` | | client page, customer portal | Yes |
| `/api/clients/{clientId}/onboarding-progress` | | client page, customer portal | Yes (2026-11-05) |
| `/api/clients/{clientId}/portal-admins` | | client page, Portal Admins tab | Yes (2026-11-05) |
| `/api/clients/{clientId}/oneapi/status` | | client page | Yes |
| `/api/clients/{clientId}/notifications` | `limit`, `page` | customer notifications | Yes (2026-11-05) |

### Calls and recordings

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/clients/{clientId}/call-contacts` | `page`, `limit`, `search`, `quickFilter`, `agent`, `direction`, `phone`, `dateFrom`, `dateTo`, `durationMode`, `durationMinutes`, `durationMinMinutes`, `durationMaxMinutes` | Call Records tab, customer call recordings | Yes |
| `/api/clients/{clientId}/callees/{calleeId}` | | Call Records tab, customer call recording detail | Yes (2026-11-05) |
| `/api/clients/{clientId}/calls/{callId}/recording-link` | | Call Records tab (player) | Yes, but see below |
| `/api/clients/{clientId}/calls/{callId}/ai-insights` | | Call Records tab | Yes (2026-11-05) |
| `/api/clients/{clientId}/ai-credits` | `from`, `to`, `cursor`, `limit` | client page, customer dashboard and settings | Yes (2026-11-05) |

### Licenses

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/clients/{clientId}/licenses/{licenseId}/history` | | Licenses tab | New |
| `/api/clients/{clientId}/license-seat-compliance` | | Licenses tab | Yes (2026-11-05) |
| `/api/clients/{clientId}/license-seat-settings` | | client page | Yes (2026-11-05) |

### CRM and integrations

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/clients/{clientId}/integrations` | | Integrations tab | Yes |
| `/api/clients/{clientId}/callout-logs` | `page`, `limit`, `period`, `status`, `platformSlug`, `search` | Integrations tab | Yes |
| `/api/clients/{clientId}/anchor-logs/{requestId}` | | Integrations tab | Yes |
| `/api/clients/{clientId}/disposition-sets` | | settings, licenses | Yes (2026-11-05) |
| `/api/clients/{clientId}/disposition-form-fields` | `setId` | settings, integrations | Yes (`setId` not yet) |
| `/api/clients/{clientId}/integrations/salesforce/{platform}/connection` | | Salesforce setup | New |
| `/api/clients/{clientId}/integrations/salesforce/{platform}/objects` | | Salesforce setup | New |
| `/api/clients/{clientId}/integrations/salesforce/{platform}/objects/{object}/fields` | `referenceTo` | Salesforce setup | New |
| `/api/clients/{clientId}/integrations/{platform}/reveal-auth` | `field` | Integrations tab | New, returns a secret |

### Support logs and settings

| Path | Query | Used on | In contract |
| --- | --- | --- | --- |
| `/api/support/logs` | `clientId`, `category`, `severity`, `correlationId`, `search`, `from`, `to`, `page`, `limit` | system logs, client Logs tab | Yes |
| `/api/support/audit-logs` | `clientId`, `search`, `page`, `limit` | audit logs, client Audit tab | Yes |
| `/api/support/audit-logs/{id}` | | audit log detail | Yes (2026-11-05) |
| `/api/support/click-to-call-logs` | `clientId`, `status`, `platform`, `failureCode`, `search`, `from`, `to`, `cursor` | click-to-call logs | New |
| `/api/support/click-to-call-logs/{id}` | | click-to-call and bulk-dial logs | New |
| `/api/support/bulk-dial-logs` | `clientId`, `status`, `search`, `from`, `to`, `cursor` | bulk-dial logs | New |
| `/api/support/bulk-dial-logs/{id}` | | bulk-dial logs | New |
| `/api/support/log-access-grants` | | system logs | New |
| `/api/support/settings/app-builds` | `page`, `limit` | app builds | New |
| `/api/support/settings/log-retention` | | log settings | New |
| `/api/support-users` | | support users | New |

Not a data read: `/api/integrations/salesforce/callback` is the Salesforce OAuth redirect.

### What our login can't read (checked 5 Nov 2026)

Our session is a `support_agent` with `clients:read`, `clients:write`, `audit:read` and `logs:read`.
These returned 403 `Forbidden`, so they have no sample yet and aren't in the contract:
`click-to-call-logs`, `bulk-dial-logs`, `log-access-grants`, `settings/app-builds`,
`settings/log-retention` and `support-users`. The three Salesforce setup reads returned 403
"Salesforce integrations are not enabled" for the sampled client. `licenses/{id}/history` wasn't
tried, because that client has no licenses.

### Endpoints to treat with care

- `recording-link` returns a signed recording URL. The SOP's rule still applies: don't call it
  against production unless the owner asks.
- `reveal-auth` returns a stored CRM credential in plain text. Never call it from the portal.
- `ai-insights` GET is safe, but its POST generates insights and likely spends AI credits.

## The client page's Call Records tab

`/support/clients/{clientId}?tab=calls` makes these calls, all scoped to that one client:

- `GET /api/clients/{clientId}` and `/tenant` (page header, loaded once for every tab)
- `GET /api/clients/{clientId}/call-contacts` with the filters above, 10 rows per page
- `GET /api/clients/{clientId}/callees/{calleeId}` when a contact is opened
- `GET /api/clients/{clientId}/calls/{callId}/recording-link` when a recording is played
- `GET` and `POST /api/clients/{clientId}/calls/{callId}/ai-insights` for a call's AI summary

## Write endpoints (not for data pulls)

Listed so they're never mistaken for reads. The SOP requires the owner's approval before any of
them.

- Clients: `POST /api/clients`, `PATCH`/`DELETE /api/clients/{clientId}`, `PATCH .../tenant`,
  `POST .../provision-admin`, `POST .../onboarding-progress`
- Settings: `PATCH .../call-capture-settings`, `.../data-retention-settings`,
  `.../disposition-settings`, `.../mobile-app-settings`, `.../license-seat-settings`,
  `.../ai-credits`, `.../contract-limits`, `.../trial-limits` (the last two reset usage)
- Licenses: `POST .../licenses`, `PATCH`/`DELETE .../licenses/{id}`, `POST .../licenses/{id}/replace`,
  `POST .../license-seat-compliance/resolve`
- Portal admins: `PATCH`/`DELETE .../portal-admins/{portalUserId}`
- Recordings: `POST .../trial-recording-retention/hold` and `/release`
- Dispositions: `POST`/`PATCH`/`DELETE .../disposition-form-fields`, `POST .../disposition-sets`,
  `DELETE .../disposition-sets/{id}`, `POST .../disposition-sets/{id}/assign`
- Integrations: `POST .../integrations`, `PATCH`/`DELETE .../integrations/{platform}`,
  `POST .../integrations/sync-now`, `.../integrations/{platform}/sync-now`,
  `.../integrations/test-webhook`, `.../tenant/resync-callout`, `.../oneapi/backfill`, and the
  Salesforce `start`, `mapping`, `test`, `probe-authorize` and `resume-authorize` calls
- Notifications: `POST .../notifications/{id}/read`, `.../notifications/read-all`
- Support: `POST`/`PATCH`/`DELETE /api/support-users`, `/api/support/log-access-grants`,
  `POST /api/support/settings/app-builds`, `PATCH .../app-builds/{id}/activate`,
  `PUT /api/support/settings/log-retention`
- Auth: `send-otp`, `verify-otp`, `resolve-customer`, `resolve-support`, `logout`, and the trial
  `send-otp`, `verify-otp`, `complete-profile`
- Profile: `PATCH /api/portal/profile`
