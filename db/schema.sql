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
