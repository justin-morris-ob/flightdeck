ALTER TABLE flightdeck.configurations ADD COLUMN configuration jsonb;
UPDATE flightdeck.configurations SET configuration = jsonb_build_object(
  'allocationNamespace', gen_random_uuid()::text,
  'hashVersion', 'sha256-v1',
  'offValue', jsonb_build_object('type', 'boolean', 'value', false),
  'defaultOutcome', jsonb_build_object('kind', 'value', 'value', jsonb_build_object('type', 'boolean', 'value', true)),
  'variants', '[]'::jsonb, 'rules', '[]'::jsonb,
  'catalogRevision', 1, 'contextDefinitions', '[]'::jsonb, 'segments', '[]'::jsonb
);
ALTER TABLE flightdeck.configurations ALTER COLUMN configuration SET NOT NULL;
ALTER TABLE flightdeck.configurations ADD CONSTRAINT configuration_size CHECK (octet_length(configuration::text) <= 65536);

CREATE TABLE flightdeck.project_targeting (
  project_id uuid PRIMARY KEY REFERENCES flightdeck.projects(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  attributes jsonb NOT NULL DEFAULT '[]',
  segments jsonb NOT NULL DEFAULT '[]',
  CHECK (jsonb_typeof(attributes) = 'array' AND jsonb_array_length(attributes) <= 32),
  CHECK (jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) <= 50),
  CHECK (octet_length(attributes::text) + octet_length(segments::text) <= 32768)
);
INSERT INTO flightdeck.project_targeting (project_id) SELECT id FROM flightdeck.projects;
CREATE TABLE flightdeck.project_targeting_audit (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES flightdeck.projects(id),
  revision integer NOT NULL CHECK (revision > 0),
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  previous jsonb,
  next jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision),
  CHECK (octet_length(next::text) <= 65536),
  CHECK (previous IS NULL OR octet_length(previous::text) <= 65536)
);
CREATE TABLE flightdeck.subject_overrides (
  id uuid PRIMARY KEY,
  flag_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 200),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 200),
  owner text NOT NULL CHECK (length(owner) BETWEEN 1 AND 120),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  outcome jsonb NOT NULL CHECK (octet_length(outcome::text) <= 8192),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (flag_id, project_id) REFERENCES flightdeck.flags(id, project_id),
  FOREIGN KEY (environment_id, project_id) REFERENCES flightdeck.environments(id, project_id),
  FOREIGN KEY (flag_id, environment_id) REFERENCES flightdeck.configurations(flag_id, environment_id)
);
CREATE UNIQUE INDEX subject_overrides_unrevoked_target ON flightdeck.subject_overrides
  (flag_id, environment_id, tenant_id, subject_id) WHERE revoked_at IS NULL;
CREATE INDEX subject_overrides_scope_id ON flightdeck.subject_overrides (flag_id, environment_id, id);
CREATE INDEX subject_overrides_active_expiry ON flightdeck.subject_overrides (flag_id, environment_id, expires_at) WHERE revoked_at IS NULL;
ALTER TABLE flightdeck.audit DROP CONSTRAINT audit_action_check;
ALTER TABLE flightdeck.audit ADD CONSTRAINT audit_action_check CHECK (action IN
  ('created', 'updated', 'enabled', 'disabled', 'archived', 'restored', 'configuration', 'override_created', 'override_revoked'));
ALTER TABLE flightdeck.credentials ADD COLUMN allowed_tenant_ids text[] NOT NULL DEFAULT ARRAY['local-tenant'];
ALTER TABLE flightdeck.credentials ADD CONSTRAINT credential_tenant_grants CHECK (cardinality(allowed_tenant_ids) BETWEEN 1 AND 20 AND array_position(allowed_tenant_ids, NULL) IS NULL);
REVOKE ALL ON flightdeck.project_targeting, flightdeck.project_targeting_audit, flightdeck.subject_overrides FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON flightdeck.project_targeting TO flightdeck_runtime;
GRANT SELECT, INSERT ON flightdeck.project_targeting_audit TO flightdeck_runtime;
GRANT SELECT, INSERT ON flightdeck.subject_overrides TO flightdeck_runtime;
GRANT UPDATE (revoked_at) ON flightdeck.subject_overrides TO flightdeck_runtime;
