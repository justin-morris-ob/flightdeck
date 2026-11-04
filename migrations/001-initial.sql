CREATE SCHEMA IF NOT EXISTS flightdeck;
REVOKE ALL ON SCHEMA flightdeck FROM PUBLIC;

CREATE TABLE flightdeck.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE flightdeck.projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES flightdeck.organizations(id),
  key text NOT NULL,
  name text NOT NULL,
  UNIQUE (organization_id, key),
  UNIQUE (id, organization_id)
);
CREATE TABLE flightdeck.environments (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES flightdeck.projects(id),
  key text NOT NULL,
  name text NOT NULL,
  UNIQUE (project_id, key),
  UNIQUE (id, project_id)
);
CREATE TABLE flightdeck.flags (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES flightdeck.projects(id),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,99}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(description) <= 1000),
  owner text NOT NULL CHECK (length(owner) BETWEEN 1 AND 120),
  archived boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key),
  UNIQUE (id, project_id)
);
CREATE TABLE flightdeck.configurations (
  flag_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  project_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (flag_id, environment_id),
  FOREIGN KEY (flag_id, project_id) REFERENCES flightdeck.flags(id, project_id),
  FOREIGN KEY (environment_id, project_id) REFERENCES flightdeck.environments(id, project_id)
);
CREATE TABLE flightdeck.audit (
  id uuid PRIMARY KEY,
  flag_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'enabled', 'disabled', 'archived', 'restored')),
  revision integer NOT NULL CHECK (revision > 0),
  previous jsonb,
  next jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (flag_id, project_id) REFERENCES flightdeck.flags(id, project_id),
  FOREIGN KEY (environment_id, project_id) REFERENCES flightdeck.environments(id, project_id),
  UNIQUE (flag_id, revision)
);
CREATE TABLE flightdeck.credentials (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (project_id, organization_id) REFERENCES flightdeck.projects(id, organization_id),
  FOREIGN KEY (environment_id, project_id) REFERENCES flightdeck.environments(id, project_id)
);
CREATE INDEX audit_flag_revision ON flightdeck.audit (flag_id, revision DESC);
CREATE INDEX credentials_scope_created ON flightdeck.credentials (project_id, environment_id, created_at DESC, id);
CREATE INDEX configurations_environment ON flightdeck.configurations (environment_id, flag_id);

REVOKE ALL ON ALL TABLES IN SCHEMA flightdeck FROM PUBLIC;
GRANT USAGE ON SCHEMA flightdeck TO flightdeck_runtime;
GRANT SELECT ON flightdeck.organizations, flightdeck.projects, flightdeck.environments TO flightdeck_runtime;
GRANT SELECT, INSERT, UPDATE ON flightdeck.flags, flightdeck.configurations TO flightdeck_runtime;
GRANT SELECT, INSERT ON flightdeck.audit TO flightdeck_runtime;
GRANT SELECT, INSERT ON flightdeck.credentials TO flightdeck_runtime;
GRANT UPDATE (revoked_at) ON flightdeck.credentials TO flightdeck_runtime;
