import type { OperatorPrincipal } from '../shared/contracts.ts';
import type { Pool, PoolClient } from 'pg';

import { randomUUID } from 'node:crypto';

import { HttpError } from '@onebrief/atlas-bff-kit';

import { directoryAttributes } from '../shared/directory.ts';
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
  environmentId: string,
  lock = false
): Promise<Catalog> {
  const result = await database.query<{
    project_id: string;
    revision: number;
    attributes: unknown;
    segments: unknown;
  }>(
    `SELECT project_id, revision, attributes FROM flightdeck.environment_targeting WHERE project_id = $1 AND environment_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [projectId, environmentId]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Project catalog not found');
  const row = result.rows[0];
  const segments = await database.query<{
    id: string;
    key: string;
    published_context: Catalog['attributes'];
    published: { version: number; name: string; blocks: Catalog['segments'][number]['blocks'] };
  }>(
    'SELECT id,key,published,published_context FROM flightdeck.segments WHERE project_id=$1 AND environment_id=$2 AND published IS NOT NULL ORDER BY key',
    [projectId, environmentId]
  );
  return catalogSchema.parse({
    projectId: row.project_id,
    revision: row.revision,
    attributes: row.attributes,
    segments: segments.rows.map((segment) => ({
      id: segment.id,
      key: segment.key,
      name: segment.published.name,
      revision: segment.published.version,
      blocks: segment.published.blocks,
      contextDefinitions: segment.published_context,
    })),
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
    const membership = ['contains_any', 'contains_all'].includes(condition.operator);
    const presence = ['present', 'absent'].includes(condition.operator);
    if (membership && type !== 'string_list')
      throw new HttpError(400, 'List membership requires a string-list attribute');
    if (type === 'string_list' && !membership && !presence)
      throw new HttpError(400, 'String-list attributes support only membership and presence');
    if (
      condition.values.some((value) => typeof value !== (type === 'string_list' ? 'string' : type))
    )
      throw new HttpError(400, `Operand type does not match attribute: ${condition.attribute}`);
    if (['gt', 'gte', 'lt', 'lte'].includes(condition.operator) && type !== 'number')
      throw new HttpError(400, 'Ordered comparisons require a numeric attribute');
    if (condition.operator === 'ends_with' && type !== 'string')
      throw new HttpError(400, 'Text suffix requires a string attribute');
  }
}

export function withDirectoryAttributes(attributes: Catalog['attributes']): Catalog['attributes'] {
  const result = [...attributes];
  for (const attribute of directoryAttributes) {
    const existing = result.find((candidate) => candidate.key === attribute.key);
    if (!existing) result.push(attribute);
  }
  return result;
}

export async function saveCatalog(
  client: PoolClient,
  actor: OperatorPrincipal,
  previous: Catalog,
  input: { attributes: Catalog['attributes'] },
  environmentId: string
): Promise<Catalog> {
  const next = catalogSchema.parse({
    ...previous,
    revision: previous.revision + 1,
    attributes: input.attributes,
  });
  await client.query(
    'UPDATE flightdeck.environment_targeting SET revision=$1,attributes=$2 WHERE project_id=$3 AND environment_id=$4',
    [next.revision, JSON.stringify(next.attributes), next.projectId, environmentId]
  );
  await client.query(
    `INSERT INTO flightdeck.environment_targeting_audit
      (id,project_id,environment_id,revision,actor_id,actor_name,previous,next) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      next.projectId,
      environmentId,
      next.revision,
      actor.id,
      actor.name,
      JSON.stringify(previous),
      JSON.stringify(next),
    ]
  );
  return next;
}

export function publishConfiguration(
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
    throw new HttpError(
      400,
      'Configuration references an unpublished, missing or cross-scope segment'
    );
  const used = new Set(
    input.rules.flatMap((rule) => rule.conditions.map((condition) => condition.attribute))
  );
  for (const known of directoryAttributes) {
    const existing = catalog.attributes.find((attribute) => attribute.key === known.key);
    if (used.has(known.key) && existing && existing.type !== known.type)
      throw new HttpError(
        400,
        `Directory context attribute has an incompatible type: ${known.key}`
      );
  }
  const attributes = withDirectoryAttributes(catalog.attributes).filter((attribute) =>
    used.has(attribute.key)
  );
  for (const rule of input.rules) validateConditions(rule.conditions, attributes);
  return configurationSchema.parse({
    ...input,
    catalogRevision: catalog.revision,
    contextDefinitions: attributes,
    segments,
  });
}

/** Resolve the current local published definitions at read time, never from an old flag snapshot. */
export async function resolveConfiguration(
  database: Database,
  projectId: string,
  environmentId: string,
  configuration: Configuration
): Promise<Configuration> {
  const ids = [...new Set(configuration.rules.flatMap((rule) => rule.segmentIds))];
  if (!ids.length) return configurationSchema.parse({ ...configuration, segments: [] });
  const result = await database.query<{
    id: string;
    key: string;
    published: { version: number; name: string; blocks: Catalog['segments'][number]['blocks'] };
    published_context: Catalog['attributes'];
  }>(
    'SELECT id,key,published,published_context FROM flightdeck.segments WHERE project_id=$1 AND environment_id=$2 AND id=ANY($3::uuid[]) AND published IS NOT NULL ORDER BY key',
    [projectId, environmentId, ids]
  );
  if (result.rows.length !== ids.length) throw new Error('Published segment reference is missing');
  return configurationSchema.parse({
    ...configuration,
    segments: result.rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.published.name,
      revision: row.published.version,
      blocks: row.published.blocks,
      contextDefinitions: row.published_context,
    })),
  });
}

export function validateConfigurationTypes(configuration: Configuration) {
  for (const rule of configuration.rules)
    validateConditions(rule.conditions, configuration.contextDefinitions);
  for (const segment of configuration.segments)
    for (const block of segment.blocks)
      validateConditions(block.conditions, segment.contextDefinitions);
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
