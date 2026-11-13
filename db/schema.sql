-- CID Autopsy schema. Idempotent: safe to run on every deploy.

CREATE TABLE IF NOT EXISTS admins (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  -- Bumped on password change to invalidate existing sessions.
  session_version INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS members (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT        NOT NULL UNIQUE,
  full_name       TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'member', 'admin')),
  password_hash   TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Bumped on password reset / deactivation to invalidate existing sessions.
  session_version INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

-- Admins also see the CallAnchor API console. Re-created so older databases accept 'admin'.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN ('agent', 'member', 'admin'));

-- Auditors get the "Audit note" button on every dashboard page. A permission on top of the role.
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_auditor BOOLEAN NOT NULL DEFAULT FALSE;

-- Notes auditors leave on dashboard pages, with the page they were on. Reviewed weekly to improve
-- the dashboard; `npm run audit:notes` prints the open ones. `author` keeps the ID if the member goes.
CREATE TABLE IF NOT EXISTS audit_notes (
  id          BIGSERIAL PRIMARY KEY,
  member_id   BIGINT      REFERENCES members (id) ON DELETE SET NULL,
  author      TEXT        NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('bug', 'confusing', 'wrong_data', 'missing', 'idea', 'other')),
  comment     TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  path        TEXT        NOT NULL,
  page_title  TEXT,
  -- Page context captured in the browser: heading, query params, selected text, viewport, browser.
  metadata    JSONB       NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'wontfix')),
  resolution  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_notes_status_idx ON audit_notes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_notes_path_idx ON audit_notes (path, created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  scope      TEXT        NOT NULL,
  username   TEXT        NOT NULL,
  ip         TEXT        NOT NULL,
  success    BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_username_idx ON login_attempts (scope, username, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at);

CREATE TABLE IF NOT EXISTS customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_name_idx ON customers (lower(name));

-- One row per Salesforce org (production, sandbox, ...) connected for a customer.
CREATE TABLE IF NOT EXISTS salesforce_orgs (
  id                 BIGSERIAL PRIMARY KEY,
  customer_id        BIGINT      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  label              TEXT        NOT NULL,
  org_id             TEXT        NOT NULL,
  org_name           TEXT,
  username           TEXT        NOT NULL,
  instance_url       TEXT        NOT NULL,
  is_sandbox         BOOLEAN     NOT NULL DEFAULT FALSE,
  org_type           TEXT,
  -- 'oauth': logged in through this app (token minted for it); 'sfdx_url': imported from the CLI.
  auth_method        TEXT        NOT NULL CHECK (auth_method IN ('oauth', 'sfdx_url')),
  -- SFDX auth URL (force://clientId:secret:refreshToken@host), AES-256-GCM encrypted. See lib/crypto.ts.
  auth_url_encrypted TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  last_error         TEXT,
  last_verified_at   TIMESTAMPTZ,
  connected_by       BIGINT      REFERENCES members (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, org_id)
);

CREATE INDEX IF NOT EXISTS salesforce_orgs_customer_idx ON salesforce_orgs (customer_id);

-- One CallAnchor portal session per member. The session cookie is AES-256-GCM encrypted. See lib/crypto.ts.
CREATE TABLE IF NOT EXISTS callanchor_sessions (
  member_id        BIGINT      PRIMARY KEY REFERENCES members (id) ON DELETE CASCADE,
  mobile           TEXT        NOT NULL,
  cookie_encrypted TEXT        NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CallAnchor client health store, filled incrementally by lib/callanchor/store.ts. Payloads and CRM
-- replies aren't stored: each event keeps only a masked label of what came back.

-- CRM delivery attempts (callout-logs), one row per attempt.
CREATE TABLE IF NOT EXISTS ca_callout_events (
  id          TEXT        PRIMARY KEY,
  client_id   TEXT        NOT NULL,
  platform_id TEXT        NOT NULL,
  event_type  TEXT        NOT NULL,
  call_id     TEXT        NOT NULL,
  attempt     INTEGER     NOT NULL,
  status      TEXT        NOT NULL,
  http_status INTEGER,
  duration_ms INTEGER,
  at          TIMESTAMPTZ NOT NULL,
  label       TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS ca_callout_events_client_at_idx ON ca_callout_events (client_id, at DESC);
CREATE INDEX IF NOT EXISTS ca_callout_events_at_idx ON ca_callout_events (at DESC);
CREATE INDEX IF NOT EXISTS ca_callout_events_call_idx ON ca_callout_events (call_id);

-- Keys GET anchor-logs/{requestId}, which the call page reads live for the payload and CRM replies.
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS request_id TEXT;

-- System logs (support/logs). CallAnchor keeps about 3 days; this keeps them longer.
CREATE TABLE IF NOT EXISTS ca_system_logs (
  id          TEXT        PRIMARY KEY,
  client_id   TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  category    TEXT        NOT NULL,
  severity    TEXT        NOT NULL,
  source      TEXT        NOT NULL,
  resource_id TEXT,
  -- Masked. `detail` is the one metadata field the pipeline needs: recordingStatus or status.
  message     TEXT        NOT NULL,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS ca_system_logs_client_at_idx ON ca_system_logs (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ca_system_logs_at_idx ON ca_system_logs (occurred_at DESC);
DROP INDEX IF EXISTS ca_system_logs_resource_idx;

-- The whole log line as CallAnchor sent it, metadata included, since it can't be fetched again after
-- about 3 days (owner, 2026-11-04). `call_id` is metadata.callRecordId, else resource_id.
ALTER TABLE ca_system_logs ADD COLUMN IF NOT EXISTS raw JSONB;
ALTER TABLE ca_system_logs ADD COLUMN IF NOT EXISTS call_id TEXT;
CREATE INDEX IF NOT EXISTS ca_system_logs_call_idx ON ca_system_logs (call_id);
UPDATE ca_system_logs SET call_id = resource_id WHERE call_id IS NULL AND raw IS NULL AND resource_id IS NOT NULL;

-- Latest per-client state: fleet metrics, tenant counts, OneAPI status and the lifetime sync aggregate.
CREATE TABLE IF NOT EXISTS ca_client_snapshots (
  client_id    TEXT        PRIMARY KEY,
  company_name TEXT,
  status       TEXT,
  data         JSONB,
  fetched_at   TIMESTAMPTZ,
  aggregate    JSONB
);

-- One row per stream ('snapshots', 'logs', 'callouts:<clientId>'): the milestone a pull resumes from.
CREATE TABLE IF NOT EXISTS ca_sync_state (
  stream       TEXT        PRIMARY KEY,
  -- Newest row stored. The next pull reads back only to here.
  milestone_at TIMESTAMPTZ,
  pulled_at    TIMESTAMPTZ,
  -- Last time the trailing 5 days were read again.
  refreshed_at TIMESTAMPTZ,
  -- Held while a pull runs, so two viewers don't pull the same stream at once.
  lease_until  TIMESTAMPTZ,
  last_error   TEXT
);

-- Rows stored before request_id and raw existed get them from the 5-day refresh, made due now so it
-- runs in the background after the next view. Once they're filled in, these match nothing.
UPDATE ca_sync_state SET refreshed_at = now() - interval '2 days'
WHERE stream LIKE 'callouts:%' AND refreshed_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM ca_callout_events e
  WHERE e.client_id = substr(ca_sync_state.stream, 10) AND e.request_id IS NULL AND e.at > now() - interval '5 days'
);
UPDATE ca_sync_state SET refreshed_at = now() - interval '2 days'
WHERE stream = 'logs' AND refreshed_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM ca_system_logs WHERE raw IS NULL AND occurred_at > now() - interval '2 days'
);

-- ---- Client health plan, phase 1: correctness and the license link (docs/client-health-plan.md) ----

-- Who a log line came from, never the actor's email. `license_id` is mobile.call.create's
-- metadata.licenseId, the license that made the call. actorId is the license on call.create and
-- upload-init but the member on upload-complete, so it isn't used as the license (checked 2026-11-05).
ALTER TABLE ca_system_logs ADD COLUMN IF NOT EXISTS actor_type TEXT;
ALTER TABLE ca_system_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE ca_system_logs ADD COLUMN IF NOT EXISTS license_id TEXT;
UPDATE ca_system_logs SET actor_type = raw->>'actorType', actor_id = raw->>'actorId', license_id = raw->'metadata'->>'licenseId'
WHERE raw IS NOT NULL AND actor_type IS NULL;

-- One row per license, from the tenant, updated with each snapshot, with its agent's name and number.
CREATE TABLE IF NOT EXISTS ca_licenses (
  license_id        TEXT        PRIMARY KEY,
  client_id         TEXT        NOT NULL,
  member_id         TEXT,
  number_last4      TEXT,
  status            TEXT,
  is_active         BOOLEAN,
  is_logged_in      BOOLEAN,
  last_login_label  TEXT,
  device_brand      TEXT,
  device_model      TEXT,
  firmware          TEXT,
  google_dialer     BOOLEAN,
  app_version       TEXT,
  app_version_code  INTEGER,
  recording_enabled BOOLEAN,
  call_policy       TEXT,
  lifetime_calls    INTEGER,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the license is no longer in the tenant.
  removed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ca_licenses_client_idx ON ca_licenses (client_id);

-- The assigned agent's name, shown with each license (owner, 2026-11-13). Filled by the next client
-- list pull. Kept off the change history, which records agent changes by member id only.
ALTER TABLE ca_licenses ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- The license's full phone number, shown in place of …1234 (owner, 2026-11-13). Filled by the next
-- client list pull; number_last4 stays for rows saved before.
ALTER TABLE ca_licenses ADD COLUMN IF NOT EXISTS number TEXT;

-- A dated row each time a license's state changes: login, logout, app update, device switch.
CREATE TABLE IF NOT EXISTS ca_license_changes (
  id         BIGSERIAL   PRIMARY KEY,
  license_id TEXT        NOT NULL,
  client_id  TEXT        NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  field      TEXT        NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);

CREATE INDEX IF NOT EXISTS ca_license_changes_license_idx ON ca_license_changes (license_id, at DESC);

-- ---- Phase 2: one row per call, kept up to date from the logs and callouts on each save ----

CREATE TABLE IF NOT EXISTS ca_calls (
  call_id            TEXT        PRIMARY KEY,
  client_id          TEXT,
  license_id         TEXT,
  -- mobile.call.create: when CallAnchor took the call in, and its recordingStatus.
  ingested_at        TIMESTAMPTZ,
  recording_detail   TEXT,
  upload_started_at  TIMESTAMPTZ,
  uploaded_at        TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  upload_failed_at   TIMESTAMPTZ,
  -- CRM callouts. A callout reached the CRM when it replied 2xx (CRM_STATUS_SQL in labels.ts).
  attempts           INTEGER     NOT NULL DEFAULT 0,
  first_callout_at   TIMESTAMPTZ,
  last_callout_at    TIMESTAMPTZ,
  first_delivered_at TIMESTAMPTZ,
  delivered_events   TEXT[]      NOT NULL DEFAULT '{}',
  last_status        TEXT,
  last_http          INTEGER,
  last_label         TEXT,
  last_platform      TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each IST day's call counts per client and license (license_key '' when unknown), saved before the
-- day's calls are pruned at 15 days and kept 30 days, so 30-day strips survive (owner, 2026-11-13).
CREATE TABLE IF NOT EXISTS ca_daily (
  client_id        TEXT        NOT NULL,
  license_key      TEXT        NOT NULL DEFAULT '',
  day              TEXT        NOT NULL,
  calls            INTEGER     NOT NULL DEFAULT 0,
  delivered        INTEGER     NOT NULL DEFAULT 0,
  failed           INTEGER     NOT NULL DEFAULT 0,
  no_callout       INTEGER     NOT NULL DEFAULT 0,
  verified_unsent  INTEGER     NOT NULL DEFAULT 0,
  recorded         INTEGER     NOT NULL DEFAULT 0,
  uploaded         INTEGER     NOT NULL DEFAULT 0,
  verified         INTEGER     NOT NULL DEFAULT 0,
  synced           INTEGER     NOT NULL DEFAULT 0,
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, license_key, day)
);

CREATE INDEX IF NOT EXISTS ca_calls_client_idx ON ca_calls (client_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS ca_calls_license_idx ON ca_calls (license_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS ca_calls_callout_idx ON ca_calls (client_id, first_callout_at DESC);

-- 2xx replies beyond the first for the same event and platform: the CRM probably holds a duplicate
-- record (QA finding I4). NULL until ca_refresh_calls has rebuilt the row once.
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS duplicate_deliveries INTEGER;

-- mobile.call.create's callType: outgoing, incoming, missed or rejected. A missed or rejected call
-- never connected, so it has nothing to record (owner, 2026-11-05).
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS call_type TEXT;

-- What each callout's payload says about its call (callFacts in lib/callanchor/links.ts): whether it
-- has a recording, its type, length and start, and the agent number's last 4 digits. facts_read is
-- set once the payload was read, even if it held none of them.
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS has_recording BOOLEAN;
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS call_type TEXT;
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS call_seconds INTEGER;
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMPTZ;
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS agent_last4 TEXT;
ALTER TABLE ca_callout_events ADD COLUMN IF NOT EXISTS facts_read BOOLEAN;
CREATE INDEX IF NOT EXISTS ca_callout_events_request_idx ON ca_callout_events (request_id);

-- The same facts per call. 0 seconds means the call never connected (owner, 2026-11-05).
-- license_via says how the license is known: 'ingest' (mobile.call.create) or 'agent_number' (the
-- payload's agent number, when exactly one of the client's licenses ends in those 4 digits), so calls
-- whose ingest log wasn't stored still belong to a phone.
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS call_seconds INTEGER;
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS has_recording BOOLEAN;
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS agent_last4 TEXT;
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS license_via TEXT;

-- mobile.recording.mark-unavailable: the phone found no recording file after the call, so there's
-- nothing to upload. reasonMessage says why ("No recording file found after call").
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS unavailable_at TIMESTAMPTZ;
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS unavailable_reason TEXT;

-- Rebuilds the given calls from the stored logs and callouts. store.ts calls it after each save. A
-- call exists once it has a mobile.call.create log or a callout.
CREATE OR REPLACE FUNCTION ca_refresh_calls(ids TEXT[]) RETURNS void LANGUAGE sql AS $$
INSERT INTO ca_calls AS t (call_id, client_id, license_id, ingested_at, recording_detail, upload_started_at, uploaded_at,
  verified_at, upload_failed_at, attempts, first_callout_at, last_callout_at, first_delivered_at, delivered_events,
  last_status, last_http, last_label, last_platform, duplicate_deliveries, call_type, call_seconds, has_recording,
  started_at, agent_last4, license_via, unavailable_at, unavailable_reason, updated_at)
SELECT ids.id, coalesce(l.client_id, c.client_id), coalesce(l.license_id, m.license_id), l.ingested_at, l.detail, l.started, l.uploaded,
  l.verified, l.failed, coalesce(c.attempts, 0), c.first_at, c.last_at, c.first_delivered_at,
  coalesce(c.delivered_events, '{}'), c.last_status, c.last_http, c.last_label, c.last_platform, coalesce(c.duplicates, 0),
  coalesce(l.call_type, c.call_type), c.seconds, c.has_recording, c.started_at, c.agent_last4,
  CASE WHEN l.license_id IS NOT NULL THEN 'ingest' WHEN m.license_id IS NOT NULL THEN 'agent_number' END,
  l.unavailable, l.unavailable_reason, now()
FROM unnest(ids) AS ids(id)
CROSS JOIN LATERAL (
  SELECT max(client_id) AS client_id,
    max(license_id) FILTER (WHERE source = 'mobile.call.create') AS license_id,
    min(occurred_at) FILTER (WHERE source = 'mobile.call.create') AS ingested_at,
    (array_agg(detail ORDER BY occurred_at) FILTER (WHERE source = 'mobile.call.create'))[1] AS detail,
    (array_agg(raw->'metadata'->>'callType' ORDER BY occurred_at) FILTER (WHERE source = 'mobile.call.create'))[1] AS call_type,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-init') AS started,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-complete') AS uploaded,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.job-processed') AS verified,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-failed') AS failed,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.mark-unavailable') AS unavailable,
    (array_agg(left(raw->'metadata'->>'reasonMessage', 200) ORDER BY occurred_at)
      FILTER (WHERE source = 'mobile.recording.mark-unavailable'))[1] AS unavailable_reason
  FROM ca_system_logs WHERE call_id = ids.id
) l
CROSS JOIN LATERAL (
  SELECT max(client_id) AS client_id, count(*) AS attempts, min(at) AS first_at, max(at) AS last_at,
    min(at) FILTER (WHERE http_status BETWEEN 200 AND 299 OR status = 'delivered') AS first_delivered_at,
    array_agg(DISTINCT event_type) FILTER (WHERE http_status BETWEEN 200 AND 299 OR status = 'delivered') AS delivered_events,
    (array_agg(CASE WHEN http_status BETWEEN 200 AND 299 THEN 'delivered' ELSE status END ORDER BY at DESC, attempt DESC))[1] AS last_status,
    (array_agg(http_status ORDER BY at DESC, attempt DESC))[1] AS last_http,
    (array_agg(label ORDER BY at DESC, attempt DESC))[1] AS last_label,
    (array_agg(platform_id ORDER BY at DESC, attempt DESC))[1] AS last_platform,
    count(*) FILTER (WHERE http_status BETWEEN 200 AND 299)
      - count(DISTINCT event_type || '|' || platform_id) FILTER (WHERE http_status BETWEEN 200 AND 299) AS duplicates,
    (array_agg(call_type ORDER BY at) FILTER (WHERE call_type IS NOT NULL))[1] AS call_type,
    max(call_seconds) AS seconds,
    bool_or(has_recording) AS has_recording,
    min(call_started_at) AS started_at,
    (array_agg(agent_last4 ORDER BY at) FILTER (WHERE agent_last4 IS NOT NULL))[1] AS agent_last4
  FROM ca_callout_events WHERE call_id = ids.id
) c
CROSS JOIN LATERAL (
  SELECT CASE WHEN count(*) = 1 THEN max(license_id) END AS license_id
  FROM ca_licenses
  WHERE l.license_id IS NULL AND c.agent_last4 IS NOT NULL
    AND client_id = coalesce(l.client_id, c.client_id) AND number_last4 = c.agent_last4
) m
WHERE l.ingested_at IS NOT NULL OR c.attempts > 0
ON CONFLICT (call_id) DO UPDATE SET
  client_id = EXCLUDED.client_id, license_id = coalesce(EXCLUDED.license_id, t.license_id),
  license_via = CASE WHEN EXCLUDED.license_id IS NOT NULL THEN EXCLUDED.license_via ELSE t.license_via END,
  ingested_at = EXCLUDED.ingested_at, recording_detail = EXCLUDED.recording_detail,
  upload_started_at = EXCLUDED.upload_started_at, uploaded_at = EXCLUDED.uploaded_at,
  verified_at = EXCLUDED.verified_at, upload_failed_at = EXCLUDED.upload_failed_at,
  attempts = EXCLUDED.attempts, first_callout_at = EXCLUDED.first_callout_at, last_callout_at = EXCLUDED.last_callout_at,
  first_delivered_at = EXCLUDED.first_delivered_at, delivered_events = EXCLUDED.delivered_events,
  last_status = EXCLUDED.last_status, last_http = EXCLUDED.last_http, last_label = EXCLUDED.last_label,
  last_platform = EXCLUDED.last_platform, duplicate_deliveries = EXCLUDED.duplicate_deliveries,
  call_type = coalesce(EXCLUDED.call_type, t.call_type), call_seconds = coalesce(EXCLUDED.call_seconds, t.call_seconds),
  has_recording = coalesce(EXCLUDED.has_recording, t.has_recording), started_at = coalesce(EXCLUDED.started_at, t.started_at),
  agent_last4 = coalesce(EXCLUDED.agent_last4, t.agent_last4),
  unavailable_at = EXCLUDED.unavailable_at, unavailable_reason = EXCLUDED.unavailable_reason, updated_at = now()
$$;

-- Rows stored before duplicate_deliveries existed get it once; afterwards this matches nothing.
SELECT ca_refresh_calls(array_agg(call_id)) FROM ca_calls WHERE duplicate_deliveries IS NULL;

-- Stored calls the phone marked unavailable get it once; afterwards this matches nothing.
SELECT ca_refresh_calls(array_agg(DISTINCT l.call_id)) FROM ca_system_logs l
WHERE l.source = 'mobile.recording.mark-unavailable' AND EXISTS (
  SELECT 1 FROM ca_calls c WHERE c.call_id = l.call_id AND c.unavailable_at IS NULL
);

-- Stored calls get their callType once; afterwards this matches nothing.
SELECT ca_refresh_calls(array_agg(c.call_id)) FROM ca_calls c WHERE c.call_type IS NULL AND EXISTS (
  SELECT 1 FROM ca_system_logs l
  WHERE l.call_id = c.call_id AND l.source = 'mobile.call.create' AND l.raw->'metadata'->>'callType' IS NOT NULL
);

-- ---- Linked events: mobile, CRM and portal (lib/callanchor/links.ts) ----

-- Portal events (support/audit-logs): license, integration, client and session changes, by
-- customers, support and the system. Stored whole, like system logs, since CallAnchor archives them.
-- license_id, platform_id and callout_log_id are what auditLinks() finds in each.
CREATE TABLE IF NOT EXISTS ca_audit_logs (
  id             TEXT        PRIMARY KEY,
  client_id      TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL,
  action         TEXT        NOT NULL,
  resource_type  TEXT        NOT NULL,
  resource_id    TEXT,
  actor_type     TEXT,
  license_id     TEXT,
  platform_id    TEXT,
  callout_log_id TEXT,
  correlation_id TEXT,
  raw            JSONB
);

CREATE INDEX IF NOT EXISTS ca_audit_logs_client_at_idx ON ca_audit_logs (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ca_audit_logs_license_idx ON ca_audit_logs (license_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ca_audit_logs_at_idx ON ca_audit_logs (occurred_at DESC);

-- A stream's next pull also reads back to here, once: for a new stream's history, or to fill new
-- columns on stored rows. Cleared when the pull succeeds.
ALTER TABLE ca_sync_state ADD COLUMN IF NOT EXISTS backfill_from TIMESTAMPTZ;
INSERT INTO ca_sync_state (stream, backfill_from) VALUES ('audit', now() - interval '90 days') ON CONFLICT (stream) DO NOTHING;
-- Callouts stored before their payload facts were read get them from one deep read, back to the
-- oldest stored row. Once they're read, this matches nothing.
UPDATE ca_sync_state s SET backfill_from = (SELECT min(at) FROM ca_callout_events e WHERE e.client_id = substr(s.stream, 10))
WHERE s.stream LIKE 'callouts:%' AND s.backfill_from IS NULL AND EXISTS (
  SELECT 1 FROM ca_callout_events e
  WHERE e.client_id = substr(s.stream, 10) AND e.facts_read IS NULL AND e.at > now() - interval '5 days'
);

-- Every stored event in one shape, each with the keys it shares with the others: client, license,
-- call, CRM platform and callout request. stream is mobile, crm, portal or system. A log or callout
-- takes its call's license when it doesn't name one. The base for search across all three.
CREATE OR REPLACE VIEW ca_events AS
SELECT l.id, l.occurred_at AS at,
  CASE l.category WHEN 'mobile' THEN 'mobile' WHEN 'webhook' THEN 'crm' WHEN 'auth' THEN 'portal' ELSE 'system' END AS stream,
  l.source AS kind, l.client_id,
  coalesce(l.license_id, k.license_id, CASE WHEN l.raw->>'resourceType' = 'license' THEN l.resource_id END) AS license_id,
  l.call_id, l.raw->'metadata'->>'platformSlug' AS platform_id,
  CASE WHEN l.source = 'custom-webhook-sync' THEN l.resource_id END AS request_id,
  coalesce(l.detail, l.severity) AS status, l.message AS summary
FROM ca_system_logs l LEFT JOIN ca_calls k ON k.call_id = l.call_id
UNION ALL
SELECT e.id, e.at, 'crm', e.event_type, e.client_id, k.license_id, e.call_id, e.platform_id, e.request_id,
  CASE WHEN e.http_status BETWEEN 200 AND 299 THEN 'delivered' ELSE e.status END, e.label
FROM ca_callout_events e LEFT JOIN ca_calls k ON k.call_id = e.call_id
UNION ALL
SELECT a.id, a.occurred_at, 'portal', a.action || ' ' || a.resource_type, a.client_id, a.license_id, NULL, a.platform_id, NULL,
  a.actor_type, a.action || ' ' || replace(a.resource_type, '_', ' ') || coalesce(' · ' || a.platform_id, '')
FROM ca_audit_logs a;

-- Fills ca_calls from what's already stored, once: afterwards each save keeps it current.
SELECT ca_refresh_calls(array_agg(id)) FROM (
  SELECT call_id AS id FROM ca_system_logs WHERE call_id IS NOT NULL
  UNION SELECT call_id FROM ca_callout_events
) ids WHERE NOT EXISTS (SELECT 1 FROM ca_calls);

-- ---- Issue state and reply suggestions ----

-- Issues are computed on each load. This remembers when each was first and last seen between loads.
CREATE TABLE IF NOT EXISTS ca_issue_state (
  issue_id      TEXT        PRIMARY KEY,
  kind          TEXT        NOT NULL,
  scope         TEXT        NOT NULL CHECK (scope IN ('fleet', 'client', 'license')),
  client_id     TEXT,
  license_id    TEXT,
  level         TEXT        NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL
);

-- Owner-curated hints for CRM replies: a masked-reply pattern for a platform or client, mapped to a
-- category and a suggested fix. Shown next to the evidence; never changes severity. Empty at first.
CREATE TABLE IF NOT EXISTS ca_reply_suggestions (
  id          BIGSERIAL   PRIMARY KEY,
  pattern     TEXT        NOT NULL,
  scope       TEXT        NOT NULL CHECK (scope IN ('platform', 'client')),
  scope_id    TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  suggestion  TEXT        NOT NULL,
  author      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- QA follow-up (docs/client-health-qa.md) ----

-- When the issue last opened, by the clock, for "new since your last visit". first_seen_at is when
-- the data shows it began, which can be earlier.
ALTER TABLE ca_issue_state ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- When CallAnchor's lifetime call count for a license last went up: a sign the phone is calling that
-- doesn't depend on its ingest logs being stored (QA findings D4, L8).
ALTER TABLE ca_licenses ADD COLUMN IF NOT EXISTS calls_grew_at TIMESTAMPTZ;

-- One row per CRM integration from the tenant, updated with each snapshot, and a dated row each time
-- one is switched on or off or its events change (QA finding I1). No credentials.
CREATE TABLE IF NOT EXISTS ca_integrations (
  client_id     TEXT        NOT NULL,
  platform_id   TEXT        NOT NULL,
  platform_name TEXT,
  active        BOOLEAN,
  -- Sorted and comma-joined; empty means every event.
  event_types   TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ,
  PRIMARY KEY (client_id, platform_id)
);

CREATE TABLE IF NOT EXISTS ca_integration_changes (
  id            BIGSERIAL   PRIMARY KEY,
  client_id     TEXT        NOT NULL,
  platform_id   TEXT        NOT NULL,
  platform_name TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  field         TEXT        NOT NULL,
  old_value     TEXT,
  new_value     TEXT
);

CREATE INDEX IF NOT EXISTS ca_integration_changes_client_idx ON ca_integration_changes (client_id, at DESC);

-- When each member last opened a health page, for "new since your last visit" (QA finding O3).
CREATE TABLE IF NOT EXISTS ca_member_visits (
  member_id BIGINT      NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  page      TEXT        NOT NULL,
  seen_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (member_id, page)
);

-- Health thresholds the owner changed on the Settings tab; the rest use RULES in
-- lib/callanchor/issues.ts. Values are in the unit the tab shows (owner, 2026-11-05).
CREATE TABLE IF NOT EXISTS ca_health_settings (
  key        TEXT             PRIMARY KEY,
  value      DOUBLE PRECISION NOT NULL,
  updated_by TEXT             NOT NULL,
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Clients marked internal (our own test and demo accounts). Health pages hide them, with their
-- calls, licenses and seats, unless "Show internal" is ticked (owner, 2026-11-12).
CREATE TABLE IF NOT EXISTS ca_client_flags (
  client_id  TEXT        PRIMARY KEY,
  internal   BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A customer can be a CallAnchor client. Each client CallAnchor lists becomes a customer with
-- product CallAnchor, or is linked to the customer of the same name (owner, 2026-11-12).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS callanchor_client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_callanchor_idx ON customers (callanchor_client_id);

-- Two statements share a line because scripts/migrate.mjs splits on a semicolon at a line's end.
-- Run after each snapshot pull (store.ts) and on every migration. Links by name first, then adds the
-- clients still unmatched. A name another client already took gets the end of its client id.
CREATE OR REPLACE FUNCTION ca_map_customers() RETURNS void LANGUAGE sql AS $$
UPDATE customers c SET callanchor_client_id = s.client_id, product = coalesce(c.product, 'CallAnchor')
FROM ca_client_snapshots s
WHERE c.callanchor_client_id IS NULL AND s.company_name IS NOT NULL AND lower(c.name) = lower(s.company_name)
  AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.callanchor_client_id = s.client_id); INSERT INTO customers (name, product, callanchor_client_id)
SELECT s.company_name, 'CallAnchor', s.client_id FROM ca_client_snapshots s
WHERE s.company_name IS NOT NULL AND trim(s.company_name) <> ''
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.callanchor_client_id = s.client_id)
ON CONFLICT DO NOTHING; INSERT INTO customers (name, product, callanchor_client_id)
SELECT s.company_name || ' · ' || right(s.client_id, 6), 'CallAnchor', s.client_id FROM ca_client_snapshots s
WHERE s.company_name IS NOT NULL AND trim(s.company_name) <> ''
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.callanchor_client_id = s.client_id)
ON CONFLICT DO NOTHING
$$;

SELECT ca_map_customers();

-- A background pull of CallAnchor into the store, one per scope ('fleet' or a client id) (owner,
-- 2026-11-13: changing pages must not wait on pulls). The server runs it after its response; pages
-- poll this row for progress. `lease_until` is renewed per batch, so a job cut off by the function's
-- time limit frees its scope within minutes.
CREATE TABLE IF NOT EXISTS ca_pull_jobs (
  scope       TEXT        PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  total       INTEGER     NOT NULL DEFAULT 0,
  done        INTEGER     NOT NULL DEFAULT 0,
  current     TEXT,
  failures    JSONB       NOT NULL DEFAULT '[]'::jsonb
);


-- Supabase publishes the public schema through its REST API to anyone holding its public anon key.
-- Row level security with no policies shuts that out; the app connects as the tables' owner, which
-- RLS doesn't apply to. Harmless on any other Postgres. Kept last so it covers every table.
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename); END LOOP; END $$;

