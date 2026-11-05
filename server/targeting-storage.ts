import type { OperatorPrincipal } from '../shared/contracts.ts';
import type { Pool, PoolClient } from 'pg';

import { randomUUID } from 'node:crypto';

import { HttpError } from '@onebrief/atlas-bff-kit';

import {
  catalogSchema,
  configurationSchema,
  overrideSchema,
  type Catalog,
  type Condition,
  type Configuration,
  type ConfigurationInput,
  type EvaluationContext,
  type SubjectOverride,
} from '../shared/targeting.ts';

type Database = Pool | PoolClient;
export async function readCatalog(
  database: Database,
  projectId: string,
  lock = false
): Promise<Catalog> {
  const result = await database.query<{
    project_id: string;
    revision: number;
    attributes: unknown;
    segments: unknown;
  }>(
    `SELECT project_id, revision, attributes, segments FROM flightdeck.project_targeting WHERE project_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [projectId]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Project catalog not found');
  const row = result.rows[0];
  return catalogSchema.parse({
    projectId: row.project_id,
    revision: row.revision,
    attributes: row.attributes,
    segments: row.segments,
  });
}

export function validateConditions(
  conditions: Condition[],
  attributes: Catalog['attributes']
): void {
  const types = new Map(attributes.map((attribute) => [attribute.key, attribute.type]));
  types.set('tenantId', 'string');
  types.set('subjectId', 'string');
  for (const condition of conditions) {
    const type = types.get(condition.attribute);
    if (!type) throw new HttpError(400, `Undeclared context attribute: ${condition.attribute}`);
    if (condition.values.some((value) => typeof value !== type))
      throw new HttpError(400, `Operand type does not match attribute: ${condition.attribute}`);
    if (['gt', 'gte', 'lt', 'lte'].includes(condition.operator) && type !== 'number')
      throw new HttpError(400, 'Ordered comparisons require a numeric attribute');
  }
}

export async function saveCatalog(
  client: PoolClient,
  actor: OperatorPrincipal,
  previous: Catalog,
  input: {
    attributes: Catalog['attributes'];
    segments: Omit<Catalog['segments'][number], 'revision'>[];
  }
): Promise<Catalog> {
  for (const segment of input.segments) validateConditions(segment.conditions, input.attributes);
  // Historical pairings remain reserved even after a segment is removed from the current catalog.
  const historical = await client.query<{ segment: Catalog['segments'][number] }>(
    `SELECT DISTINCT segment FROM flightdeck.project_targeting_audit a,
      LATERAL jsonb_array_elements(a.next->'segments') segment
      WHERE a.project_id = $1 AND (segment->>'id' = ANY($2::text[]) OR segment->>'key' = ANY($3::text[]))`,
    [
      previous.projectId,
      input.segments.map((segment) => segment.id),
      input.segments.map((segment) => segment.key),
    ]
  );
  const reserved = [...previous.segments, ...historical.rows.map((row) => row.segment)];
  const segments = input.segments.map((segment) => {
    for (const old of reserved) {
      if (
        (old.id === segment.id || old.key === segment.key) &&
        (old.id !== segment.id || old.key !== segment.key)
      )
        throw new HttpError(400, 'Segment ID/key pairs are immutable');
    }
    const old = reserved
      .filter((candidate) => candidate.id === segment.id)
      .sort((a, b) => b.revision - a.revision)[0];
    const unchanged =
      old &&
      old.name === segment.name &&
      old.conditions.length === segment.conditions.length &&
      old.conditions.every((condition, index) => {
        const next = segment.conditions[index]!;
        return (
          condition.attribute === next.attribute &&
          condition.operator === next.operator &&
          condition.values.length === next.values.length &&
          condition.values.every((value, valueIndex) => value === next.values[valueIndex])
        );
      });
    return { ...segment, revision: old ? old.revision + (unchanged ? 0 : 1) : 1 };
  });
  const next = catalogSchema.parse({
    projectId: previous.projectId,
    revision: previous.revision + 1,
    attributes: input.attributes,
    segments,
  });
  await client.query(
    'UPDATE flightdeck.project_targeting SET revision = $1, attributes = $2, segments = $3 WHERE project_id = $4',
    [next.revision, JSON.stringify(next.attributes), JSON.stringify(next.segments), next.projectId]
  );
  await client.query(
    `INSERT INTO flightdeck.project_targeting_audit (id, project_id, revision, actor_id, actor_name, previous, next) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      next.projectId,
      next.revision,
      actor.id,
      actor.name,
      JSON.stringify(previous),
      JSON.stringify(next),
    ]
  );
  return next;
}

export function pinConfiguration(
  input: ConfigurationInput,
  current: Configuration,
  catalog: Catalog,
  expectedCatalogRevision: number | undefined
): Configuration {
  if (expectedCatalogRevision === undefined)
    throw new HttpError(400, 'Draft configuration requires expectedCatalogRevision');
  if (catalog.revision !== expectedCatalogRevision)
    throw new HttpError(409, 'Catalog revision conflict; reload before saving');
  if (input.allocationNamespace !== current.allocationNamespace)
    throw new HttpError(400, 'Allocation namespace is immutable');
  const referenced = new Set(input.rules.flatMap((rule) => rule.segmentIds));
  const segments = catalog.segments.filter((segment) => referenced.has(segment.id));
  if (segments.length !== referenced.size)
    throw new HttpError(400, 'Configuration references a missing or cross-project segment');
  for (const rule of input.rules) validateConditions(rule.conditions, catalog.attributes);
  for (const segment of segments) validateConditions(segment.conditions, catalog.attributes);
  return configurationSchema.parse({
    ...input,
    catalogRevision: catalog.revision,
    contextDefinitions: catalog.attributes,
    segments,
  });
}

export function validateOverrideOutcome(
  outcome: SubjectOverride['outcome'],
  configuration: Configuration
): void {
  if (outcome.kind === 'value' && outcome.value.type !== configuration.offValue.type)
    throw new HttpError(400, 'Override value type does not match configuration');
  if (
    outcome.kind === 'variant' &&
    !configuration.variants.some((variant) => variant.id === outcome.variantId)
  )
    throw new HttpError(400, 'Override references an unknown variant');
}

export interface OverrideRow {
  id: string;
  flag_id: string;
  project_id: string;
  environment_id: string;
  tenant_id: string;
  subject_id: string;
  owner: string;
  reason: string;
  outcome: SubjectOverride['outcome'];
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
}
export function subjectOverride(row: OverrideRow): SubjectOverride {
  return overrideSchema.parse({
    id: row.id,
    flagId: row.flag_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    tenantId: row.tenant_id,
    subjectId: row.subject_id,
    owner: row.owner,
    reason: row.reason,
    outcome: row.outcome,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  });
}

export async function matchingOverrides(
  database: Database,
  flagId: string,
  projectId: string,
  environmentId: string,
  context: EvaluationContext
): Promise<SubjectOverride[]> {
  if (!context.tenantId || !context.subjectId) return [];
  const result = await database.query<OverrideRow>(
    `SELECT * FROM flightdeck.subject_overrides WHERE flag_id = $1 AND project_id = $2 AND environment_id = $3 AND tenant_id = $4 AND subject_id = $5 AND revoked_at IS NULL`,
    [flagId, projectId, environmentId, context.tenantId, context.subjectId]
  );
  return result.rows.map(subjectOverride);
}

export async function validateActiveOverrides(
  database: Database,
  flagId: string,
  environmentId: string,
  configuration: Configuration,
  now: string
): Promise<void> {
  const result = await database.query<OverrideRow>(
    `SELECT * FROM flightdeck.subject_overrides WHERE flag_id = $1 AND environment_id = $2 AND revoked_at IS NULL AND expires_at > $3`,
    [flagId, environmentId, now]
  );
  for (const row of result.rows) validateOverrideOutcome(row.outcome, configuration);
}
