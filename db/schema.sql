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
  role            TEXT        NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'member')),
  password_hash   TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Bumped on password reset / deactivation to invalidate existing sessions.
  session_version INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

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

-- One row per license, from the tenant, updated with each snapshot. No agent names or full numbers.
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

CREATE INDEX IF NOT EXISTS ca_calls_client_idx ON ca_calls (client_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS ca_calls_license_idx ON ca_calls (license_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS ca_calls_callout_idx ON ca_calls (client_id, first_callout_at DESC);

-- 2xx replies beyond the first for the same event and platform: the CRM probably holds a duplicate
-- record (QA finding I4). NULL until ca_refresh_calls has rebuilt the row once.
ALTER TABLE ca_calls ADD COLUMN IF NOT EXISTS duplicate_deliveries INTEGER;

-- Rebuilds the given calls from the stored logs and callouts. store.ts calls it after each save. A
-- call exists once it has a mobile.call.create log or a callout.
CREATE OR REPLACE FUNCTION ca_refresh_calls(ids TEXT[]) RETURNS void LANGUAGE sql AS $$
INSERT INTO ca_calls AS t (call_id, client_id, license_id, ingested_at, recording_detail, upload_started_at, uploaded_at,
  verified_at, upload_failed_at, attempts, first_callout_at, last_callout_at, first_delivered_at, delivered_events,
  last_status, last_http, last_label, last_platform, duplicate_deliveries, updated_at)
SELECT ids.id, coalesce(l.client_id, c.client_id), l.license_id, l.ingested_at, l.detail, l.started, l.uploaded,
  l.verified, l.failed, coalesce(c.attempts, 0), c.first_at, c.last_at, c.first_delivered_at,
  coalesce(c.delivered_events, '{}'), c.last_status, c.last_http, c.last_label, c.last_platform, coalesce(c.duplicates, 0), now()
FROM unnest(ids) AS ids(id)
CROSS JOIN LATERAL (
  SELECT max(client_id) AS client_id,
    max(license_id) FILTER (WHERE source = 'mobile.call.create') AS license_id,
    min(occurred_at) FILTER (WHERE source = 'mobile.call.create') AS ingested_at,
    (array_agg(detail ORDER BY occurred_at) FILTER (WHERE source = 'mobile.call.create'))[1] AS detail,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-init') AS started,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-complete') AS uploaded,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.job-processed') AS verified,
    min(occurred_at) FILTER (WHERE source = 'mobile.recording.upload-failed') AS failed
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
      - count(DISTINCT event_type || '|' || platform_id) FILTER (WHERE http_status BETWEEN 200 AND 299) AS duplicates
  FROM ca_callout_events WHERE call_id = ids.id
) c
WHERE l.ingested_at IS NOT NULL OR c.attempts > 0
ON CONFLICT (call_id) DO UPDATE SET
  client_id = EXCLUDED.client_id, license_id = coalesce(EXCLUDED.license_id, t.license_id),
  ingested_at = EXCLUDED.ingested_at, recording_detail = EXCLUDED.recording_detail,
  upload_started_at = EXCLUDED.upload_started_at, uploaded_at = EXCLUDED.uploaded_at,
  verified_at = EXCLUDED.verified_at, upload_failed_at = EXCLUDED.upload_failed_at,
  attempts = EXCLUDED.attempts, first_callout_at = EXCLUDED.first_callout_at, last_callout_at = EXCLUDED.last_callout_at,
  first_delivered_at = EXCLUDED.first_delivered_at, delivered_events = EXCLUDED.delivered_events,
  last_status = EXCLUDED.last_status, last_http = EXCLUDED.last_http, last_label = EXCLUDED.last_label,
  last_platform = EXCLUDED.last_platform, duplicate_deliveries = EXCLUDED.duplicate_deliveries, updated_at = now()
$$;

-- Rows stored before duplicate_deliveries existed get it once; afterwards this matches nothing.
SELECT ca_refresh_calls(array_agg(call_id)) FROM ca_calls WHERE duplicate_deliveries IS NULL;

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
