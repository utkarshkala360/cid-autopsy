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
