-- Preserve every environment's existing state before separating local metadata from flag identity.
ALTER TABLE flightdeck.configurations
  ADD COLUMN name text,
  ADD COLUMN description text,
  ADD COLUMN owner text,
  ADD COLUMN archived boolean,
  ADD COLUMN lifecycle text NOT NULL DEFAULT 'development' CHECK (lifecycle IN ('development','release','system','permissions')),
  ADD COLUMN revision integer,
  ADD COLUMN updated_at timestamptz;
UPDATE flightdeck.configurations c SET name=f.name, description=f.description, owner=f.owner,
  archived=f.archived, revision=f.revision, updated_at=f.updated_at FROM flightdeck.flags f WHERE f.id=c.flag_id;
ALTER TABLE flightdeck.configurations
  ALTER COLUMN name SET NOT NULL, ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN owner SET NOT NULL, ALTER COLUMN archived SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL,
  ADD CHECK (length(name) BETWEEN 1 AND 120), ADD CHECK (length(description)<=1000),
  ADD CHECK (length(owner) BETWEEN 1 AND 120), ADD CHECK (revision>0);
ALTER TABLE flightdeck.audit DROP CONSTRAINT audit_flag_id_revision_key;
ALTER TABLE flightdeck.audit ADD UNIQUE (flag_id,environment_id,revision);

CREATE TABLE flightdeck.environment_targeting (
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  attributes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attributes)='array' AND jsonb_array_length(attributes)<=32),
  PRIMARY KEY(project_id,environment_id),
  FOREIGN KEY(environment_id,project_id) REFERENCES flightdeck.environments(id,project_id),
  CHECK(octet_length(attributes::text)<=24576)
);
INSERT INTO flightdeck.environment_targeting(project_id,environment_id,revision,attributes)
  SELECT e.project_id,e.id,t.revision,t.attributes FROM flightdeck.environments e
  JOIN flightdeck.project_targeting t ON t.project_id=e.project_id;
CREATE TABLE flightdeck.environment_targeting_audit (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  actor_id text NOT NULL, actor_name text NOT NULL,
  previous jsonb, next jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,project_id) REFERENCES flightdeck.environments(id,project_id),
  UNIQUE(project_id,environment_id,revision)
);
-- Project history remains in its original table verbatim. Copies retain its original snapshots.
INSERT INTO flightdeck.environment_targeting_audit(id,project_id,environment_id,revision,actor_id,actor_name,previous,next,created_at)
  SELECT gen_random_uuid(),a.project_id,e.id,a.revision,a.actor_id,a.actor_name,a.previous,a.next,a.created_at
  FROM flightdeck.project_targeting_audit a JOIN flightdeck.environments e ON e.project_id=a.project_id;

CREATE TABLE flightdeck.segments (
  id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  key text NOT NULL CHECK(key ~ '^[a-z][a-z0-9_-]{0,99}$'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  published jsonb,
  draft jsonb,
  published_context jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY(project_id,environment_id,id),
  draft_context jsonb NOT NULL DEFAULT '[]',
  UNIQUE(project_id,environment_id,key),
  FOREIGN KEY(environment_id,project_id) REFERENCES flightdeck.environments(id,project_id),
  CHECK(published IS NOT NULL OR draft IS NOT NULL),
  CHECK(published IS NULL OR octet_length(published::text)<=24576),
  CHECK(draft IS NULL OR octet_length(draft::text)<=24576)
);
CREATE TABLE flightdeck.segment_history (
  project_id uuid NOT NULL, environment_id uuid NOT NULL, segment_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0), definition jsonb NOT NULL,
  context_definitions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,environment_id,segment_id,version),
  FOREIGN KEY(project_id,environment_id,segment_id) REFERENCES flightdeck.segments(project_id,environment_id,id)
);
-- Only a current catalog entry or an actually referenced segment becomes live. Removed,
-- unreferenced definitions remain verbatim in project_targeting_audit, never resurrected here.
-- Removed-but-referenced segments follow their newest retained definition after the explicit cutover.
-- Old catalogs could change an attribute type without bumping a segment version. For a repeated
-- version, retain its newest source catalog binding deterministically; original audits keep every binding.
CREATE TEMP TABLE unified_legacy_segments ON COMMIT DROP AS
  SELECT e.project_id,e.id AS environment_id,s AS segment,t.attributes AS context_definitions,
    3 AS precedence,t.revision AS source_revision,e.id::text AS source_id
    FROM flightdeck.environments e JOIN flightdeck.project_targeting t ON t.project_id=e.project_id,
    LATERAL jsonb_array_elements(t.segments) s
  UNION ALL
  SELECT c.project_id,c.environment_id,s,c.configuration->'contextDefinitions',2,
    (c.configuration->>'catalogRevision')::integer,c.flag_id::text
    FROM flightdeck.configurations c,LATERAL jsonb_array_elements(c.configuration->'segments') s
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.configuration->'rules') r WHERE (r->'segmentIds') ? (s->>'id'))
  UNION ALL
  SELECT a.project_id,e.id,s,a.next->'attributes',1,a.revision,a.id::text
    FROM flightdeck.project_targeting_audit a JOIN flightdeck.environments e ON e.project_id=a.project_id,
    LATERAL jsonb_array_elements(a.next->'segments') s;
INSERT INTO flightdeck.segments(id,project_id,environment_id,key,revision,published,published_context)
  SELECT DISTINCT ON(project_id,environment_id,segment->>'id')
    (segment->>'id')::uuid,project_id,environment_id,segment->>'key',
    (segment->>'revision')::integer,
    jsonb_build_object('version',(segment->>'revision')::integer,'name',segment->>'name','description','',
      'blocks',jsonb_build_array(jsonb_build_object('conditions',segment->'conditions'))),
    (SELECT COALESCE(jsonb_agg(definition),'[]'::jsonb) FROM jsonb_array_elements(context_definitions) definition
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(segment->'conditions') condition WHERE condition->>'attribute'=definition->>'key'))
  FROM unified_legacy_segments candidate WHERE EXISTS (
    SELECT 1 FROM unified_legacy_segments active WHERE active.project_id=candidate.project_id
      AND active.environment_id=candidate.environment_id AND active.segment->>'id'=candidate.segment->>'id'
      AND active.precedence>=2
  ) ORDER BY project_id,environment_id,segment->>'id',
    (precedence=3) DESC,(segment->>'revision')::integer DESC,source_revision DESC,precedence DESC,source_id DESC;
INSERT INTO flightdeck.segment_history(project_id,environment_id,segment_id,version,definition,context_definitions)
  SELECT DISTINCT ON(project_id,environment_id,segment->>'id',segment->>'revision')
    project_id,environment_id,(segment->>'id')::uuid,(segment->>'revision')::integer,
    jsonb_build_object('version',(segment->>'revision')::integer,'name',segment->>'name','description','',
      'blocks',jsonb_build_array(jsonb_build_object('conditions',segment->'conditions'))),
    (SELECT COALESCE(jsonb_agg(definition),'[]'::jsonb) FROM jsonb_array_elements(context_definitions) definition
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(segment->'conditions') condition WHERE condition->>'attribute'=definition->>'key'))
  FROM unified_legacy_segments candidate WHERE EXISTS (
    SELECT 1 FROM flightdeck.segments live WHERE live.project_id=candidate.project_id
      AND live.environment_id=candidate.environment_id AND live.id=(candidate.segment->>'id')::uuid
  ) ORDER BY project_id,environment_id,segment->>'id',segment->>'revision',
    (precedence=3) DESC,source_revision DESC,precedence DESC,source_id DESC;

CREATE TABLE flightdeck.unified_audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  object_type text NOT NULL CHECK(object_type IN ('flag','segment')),
  object_id uuid NOT NULL,
  object_key text NOT NULL,
  object_name text NOT NULL,
  actor_id text NOT NULL, actor_name text NOT NULL, action text NOT NULL,
  previous jsonb, next jsonb NOT NULL,
  affected_references jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,project_id) REFERENCES flightdeck.environments(id,project_id)
);
INSERT INTO flightdeck.unified_audit(id,project_id,environment_id,object_type,object_id,object_key,object_name,
  actor_id,actor_name,action,previous,next,created_at)
  SELECT a.id,a.project_id,a.environment_id,'flag',a.flag_id,f.key,COALESCE(a.next->>'name',f.name),
    a.actor_id,a.actor_name,a.action,a.previous,a.next,a.created_at
  FROM flightdeck.audit a JOIN flightdeck.flags f ON f.id=a.flag_id ORDER BY a.created_at,a.id;
-- Explicitly record the semantic cutover instead of rewriting old events to claim following.
INSERT INTO flightdeck.unified_audit(id,project_id,environment_id,object_type,object_id,object_key,object_name,
  actor_id,actor_name,action,previous,next,affected_references)
  SELECT gen_random_uuid(),s.project_id,s.environment_id,'segment',s.id,s.key,s.published->>'name',
    'system:migration','Schema migration','following_migrated',
    jsonb_build_object('mode','pinned','references',COALESCE(refs.snapshots,'[]'::jsonb)),
    jsonb_build_object('mode','following','published',s.published),COALESCE(refs.usage,'[]'::jsonb)
  FROM flightdeck.segments s LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('flagId',f.id,'snapshot',old)) AS snapshots,
      jsonb_agg(jsonb_build_object('flagId',f.id,'flagKey',f.key,'flagName',c.name,
        'enabled',c.enabled,'archived',c.archived,'revision',c.revision) ORDER BY f.key) AS usage
    FROM flightdeck.configurations c JOIN flightdeck.flags f ON f.id=c.flag_id,
      LATERAL jsonb_array_elements(c.configuration->'segments') old
    WHERE c.project_id=s.project_id AND c.environment_id=s.environment_id AND old->>'id'=s.id::text
  ) refs ON true;
-- Live snapshots no longer pin reusable predicates; rules retain the immutable segment IDs.
UPDATE flightdeck.configurations SET configuration=jsonb_set(configuration,'{segments}','[]'::jsonb);
ALTER TABLE flightdeck.flags DROP COLUMN name,DROP COLUMN description,DROP COLUMN owner,
  DROP COLUMN archived,DROP COLUMN revision,DROP COLUMN updated_at;
CREATE INDEX unified_audit_scope_sequence ON flightdeck.unified_audit(project_id,environment_id,sequence DESC);
CREATE INDEX unified_audit_object_sequence ON flightdeck.unified_audit(project_id,environment_id,object_type,object_id,sequence DESC);
CREATE INDEX segment_scope_key ON flightdeck.segments(project_id,environment_id,key);
REVOKE ALL ON flightdeck.environment_targeting,flightdeck.environment_targeting_audit,
  flightdeck.segments,flightdeck.segment_history,flightdeck.unified_audit FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON flightdeck.environment_targeting,flightdeck.segments TO flightdeck_runtime;
GRANT SELECT,INSERT ON flightdeck.environment_targeting_audit,flightdeck.segment_history,flightdeck.unified_audit TO flightdeck_runtime;
GRANT USAGE,SELECT ON SEQUENCE flightdeck.unified_audit_sequence_seq TO flightdeck_runtime;
REVOKE INSERT,UPDATE ON flightdeck.project_targeting FROM flightdeck_runtime;
REVOKE INSERT ON flightdeck.project_targeting_audit FROM flightdeck_runtime;
