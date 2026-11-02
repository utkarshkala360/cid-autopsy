# callanchor-apis

A module of cid-autopsy, with its own dependencies. Run the commands below from this folder. From
the repo root, `npm run ca -- <command>` also works.

The single place that defines how we talk to CallAnchor's portal API. Use it to keep the API
definition current, test the live API, and pull data. The client health system will build on it.

CallAnchor has no published API contract. This one is reverse-documented from captured
responses, and `ca check` tells you when production no longer matches it.

| Path | What it is |
| --- | --- |
| [openapi/callanchor.openapi.yaml](openapi/callanchor.openapi.yaml) | The contract: 17 operations. Edit this. |
| [postman/](postman/) | Collection generated from the contract, plus an environment |
| [src/](src/) | Typed client, the `ca` CLI and a mock server |
| [fixtures/](fixtures/) | Redacted sample responses |
| [docs/understanding.md](docs/understanding.md) | How CallAnchor fits together |
| [docs/open-questions.md](docs/open-questions.md) | Questions to answer before the health system, with space for answers |

## Setup

Needs Node 24+. The root `npm install` does not install this module's dependencies.

```bash
npm install
cp .env.example .env     # set CALLANCHOR_MOBILE
npm run login            # places an OTP call, then saves the session to .session
```

## Daily use

```bash
npm run ca -- list                                    # all operations and their safety level
npm run ca -- call getFleet                           # one request
npm run ca -- call listCalloutLogs --client=<id> --page=1 --limit=50
npm run ca -- check                                   # compare production with the contract
npm run ca -- pull --client=<id> --pages=2            # snapshot to data/<timestamp>/
npm run ca -- call backfillOneApi --client=<id> --confirm   # writes need --confirm
```

`check` prints `OK`, `DRIFT` (the API returned fields we haven't documented) or `FAIL` (a required
field is gone or a type changed), and exits non-zero on `FAIL`. It runs read operations only.

`pull` covers fleet data for all clients unless `--client` is set. It stops at `--pages` pages per
log (default 5). Snapshots contain customer PII, so keep them out of git and chat.

## Without touching production

```bash
npm run mock                                             # http://localhost:4010
CALLANCHOR_BASE_URL=http://localhost:4010 npm run login  # any OTP works
CALLANCHOR_BASE_URL=http://localhost:4010 npm run ca -- check
```

## Postman

Import the collection and environment from `postman/`. Run `sendOtp` and `verifyOtp` to sign in;
the session is saved to the environment.

Requests that call a phone, change data or issue a recording link are skipped unless the
environment has `allowLiveActions` set to `true`. Leave it `false` when running the whole
collection. Set it to `true` only for the one request you mean to send, including login.

## When the API changes

1. Update `openapi/callanchor.openapi.yaml`. When `ca check` passes for an operation, change its
   `x-verified` from `sample` to that date.
2. Run `npm run generate:postman`.
3. Add or refresh a redacted fixture in `fixtures/`, named `<operationId>.json`.
4. Run `npm test`.

For a new sheet export, `npm run import:sheet -- "<csv>"` rebuilds the fixtures with redaction.
It rewrites every fixture, so review the diff.
