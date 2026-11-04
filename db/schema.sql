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
CREATE INDEX IF NOT EXISTS ca_system_logs_resource_idx ON ca_system_logs (resource_id);

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
