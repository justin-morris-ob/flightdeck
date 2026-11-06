import type { OperatorPrincipal, Flag } from '../shared/contracts.ts';
import type { AttributeDefinition, Configuration } from '../shared/targeting.ts';
import type { SegmentDefinition, SegmentRecord, SegmentUsage } from '../shared/unified.ts';
import type { Pool, PoolClient } from 'pg';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { HttpError } from '@onebrief/atlas-bff-kit';

import { directoryAttributes } from '../shared/directory.ts';
import { auditTrailSchema, segmentHistorySchema, segmentRecordSchema } from '../shared/unified.ts';
import {
  readCatalog,
  resolveConfiguration,
  validateConditions,
  withDirectoryAttributes,
} from './targeting-storage.ts';

type Database = Pool | PoolClient;
interface SegmentRow {
  id: string;
  key: string;
  revision: number;
  published: SegmentDefinition | null;
  draft: SegmentDefinition | null;
  published_context: AttributeDefinition[];
  draft_context: AttributeDefinition[];
}

/** All writes affecting publication impact take this same lock, before any flag/segment locks. */
export async function lockEnvironment(
  client: PoolClient,
  projectId: string,
  environmentId: string
) {
  const result = await client.query(
    'SELECT environment_id FROM flightdeck.environment_targeting WHERE project_id=$1 AND environment_id=$2 FOR UPDATE',
    [projectId, environmentId]
  );
  if (!result.rowCount) throw new HttpError(404, 'Environment catalog not found');
}

export async function segmentUsage(
  database: Database,
  projectId: string,
  environmentId: string,
  segmentId: string
): Promise<SegmentUsage[]> {
  const result = await database.query<{
    id: string;
    key: string;
    name: string;
    enabled: boolean;
    archived: boolean;
    revision: number;
  }>(
    `SELECT f.id,f.key,c.name,c.enabled,c.archived,c.revision FROM flightdeck.configurations c
      JOIN flightdeck.flags f ON f.id=c.flag_id
      WHERE c.project_id=$1 AND c.environment_id=$2 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.configuration->'rules') r WHERE (r->'segmentIds') ? $3
      ) ORDER BY f.key`,
    [projectId, environmentId, segmentId]
  );
  return result.rows.map((row) => ({
    flagId: row.id,
    flagKey: row.key,
    flagName: row.name,
    enabled: row.enabled,
    archived: row.archived,
    revision: row.revision,
  }));
}

async function segmentRow(
  database: Database,
  projectId: string,
  environmentId: string,
  id: string
): Promise<SegmentRow> {
  const result = await database.query<SegmentRow>(
    'SELECT * FROM flightdeck.segments WHERE project_id=$1 AND environment_id=$2 AND id=$3',
    [projectId, environmentId, id]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Segment not found');
  return result.rows[0];
}

export const segmentHistoryQuerySchema = z.strictObject({
  before: z.coerce.number().int().positive().max(2147483647).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function segmentHistoryPage(
  database: Database,
  projectId: string,
  environmentId: string,
  id: string,
  input: z.infer<typeof segmentHistoryQuerySchema>
) {
  const result = await database.query<{ definition: SegmentDefinition; version: number }>(
    `SELECT definition,version FROM flightdeck.segment_history WHERE project_id=$1 AND environment_id=$2 AND segment_id=$3
      AND ($4::integer IS NULL OR version<$4) ORDER BY version DESC LIMIT $5`,
    [projectId, environmentId, id, input.before ?? null, input.limit + 1]
  );
  const items = result.rows.slice(0, input.limit).map((row) => row.definition);
  return segmentHistorySchema.parse({
    items,
    nextCursor: result.rows.length > input.limit ? items.at(-1)!.version : null,
  });
}

export async function readSegmentHistory(
  database: Database,
  projectId: string,
  environmentId: string,
  id: string,
  input: z.infer<typeof segmentHistoryQuerySchema>
) {
  await segmentRow(database, projectId, environmentId, id);
  return segmentHistoryPage(database, projectId, environmentId, id, input);
}

function segmentSnapshot(record: SegmentRecord) {
  const { history: _history, historyNextCursor: _cursor, ...snapshot } = record;
  return snapshot;
}

export async function readSegment(
  database: Database,
  projectId: string,
  environmentId: string,
  id: string
): Promise<SegmentRecord> {
  const row = await segmentRow(database, projectId, environmentId, id);
  const history = await segmentHistoryPage(database, projectId, environmentId, id, { limit: 20 });
  const definition = row.draft ?? row.published!;
  return segmentRecordSchema.parse({
    id: row.id,
    key: row.key,
    name: definition.name,
    description: definition.description,
    revision: row.revision,
    published: row.published,
    draft: row.draft,
    history: history.items,
    historyNextCursor: history.nextCursor,
    usage: await segmentUsage(database, projectId, environmentId, id),
  });
}

export async function listSegments(
  database: Database,
  projectId: string,
  environmentId: string
): Promise<SegmentRecord[]> {
  const result = await database.query<{ id: string }>(
    'SELECT id FROM flightdeck.segments WHERE project_id=$1 AND environment_id=$2 ORDER BY key',
    [projectId, environmentId]
  );
  const items: SegmentRecord[] = [];
  for (const row of result.rows)
    items.push(await readSegment(database, projectId, environmentId, row.id));
  return items;
}

export async function writeUnifiedAudit(
  client: PoolClient,
  actor: OperatorPrincipal,
  scope: { projectId: string; environmentId: string },
  object: { type: 'flag' | 'segment'; id: string; key: string; name: string },
  action: string,
  previous: unknown | null,
  next: unknown,
  affectedReferences?: SegmentUsage[],
  id = randomUUID()
) {
  await client.query(
    `INSERT INTO flightdeck.unified_audit(id,project_id,environment_id,object_type,object_id,object_key,object_name,
      actor_id,actor_name,action,previous,next,affected_references) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      scope.projectId,
      scope.environmentId,
      object.type,
      object.id,
      object.key,
      object.name,
      actor.id,
      actor.name,
      action,
      previous === null ? null : JSON.stringify(previous),
      JSON.stringify(next),
      affectedReferences === undefined ? null : JSON.stringify(affectedReferences),
    ]
  );
}

function reviewed(row: SegmentRow, expectedRevision: number) {
  if (row.revision !== expectedRevision)
    throw new HttpError(
      409,
      'Segment or publication impact changed; reload and review before saving'
    );
}

async function draftContext(
  client: PoolClient,
  projectId: string,
  environmentId: string,
  definition: SegmentDefinition
) {
  const catalog = await readCatalog(client, projectId, environmentId);
  const conditions = definition.blocks.flatMap((block) => block.conditions);
  const keys = new Set(conditions.map((condition) => condition.attribute));
  for (const known of directoryAttributes) {
    const existing = catalog.attributes.find((attribute) => attribute.key === known.key);
    if (keys.has(known.key) && existing && existing.type !== known.type)
      throw new HttpError(
        400,
        `Directory context attribute has an incompatible type: ${known.key}`
      );
  }
  const definitions = withDirectoryAttributes(catalog.attributes).filter((attribute) =>
    keys.has(attribute.key)
  );
  validateConditions(conditions, definitions);
  if (definitions.length > 32)
    throw new HttpError(400, 'Segment predicates support at most 32 context attributes');
  return definitions;
}

export async function createSegment(
  client: PoolClient,
  actor: OperatorPrincipal,
  projectId: string,
  environmentId: string,
  input: { key: string; name: string; description: string; blocks: SegmentDefinition['blocks'] }
) {
  await lockEnvironment(client, projectId, environmentId);
  const count = await client.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM flightdeck.segments WHERE project_id=$1 AND environment_id=$2',
    [projectId, environmentId]
  );
  if (count.rows[0]!.count >= 50)
    throw new HttpError(409, 'The local segment library is limited to 50 definitions');
  const id = randomUUID();
  const definition: SegmentDefinition = {
    version: 1,
    name: input.name,
    description: input.description,
    blocks: input.blocks,
  };
  const definitions = await draftContext(client, projectId, environmentId, definition);
  await client.query(
    'INSERT INTO flightdeck.segments(id,project_id,environment_id,key,draft,draft_context) VALUES($1,$2,$3,$4,$5,$6)',
    [
      id,
      projectId,
      environmentId,
      input.key,
      JSON.stringify(definition),
      JSON.stringify(definitions),
    ]
  );
  const next = await readSegment(client, projectId, environmentId, id);
  await writeUnifiedAudit(
    client,
    actor,
    { projectId, environmentId },
    { type: 'segment', id, key: next.key, name: next.name },
    'draft_created',
    null,
    segmentSnapshot(next)
  );
  return next;
}

export async function saveSegmentDraft(
  client: PoolClient,
  actor: OperatorPrincipal,
  projectId: string,
  environmentId: string,
  id: string,
  input: {
    expectedRevision: number;
    name: string;
    description: string;
    blocks: SegmentDefinition['blocks'];
  }
) {
  await lockEnvironment(client, projectId, environmentId);
  const row = await segmentRow(client, projectId, environmentId, id);
  reviewed(row, input.expectedRevision);
  const previous = await readSegment(client, projectId, environmentId, id);
  const definition = {
    version: (row.published?.version ?? 0) + 1,
    name: input.name,
    description: input.description,
    blocks: input.blocks,
  };
  const definitions = await draftContext(client, projectId, environmentId, definition);
  await client.query(
    'UPDATE flightdeck.segments SET draft=$1,draft_context=$2,revision=revision+1 WHERE project_id=$3 AND environment_id=$4 AND id=$5',
    [JSON.stringify(definition), JSON.stringify(definitions), projectId, environmentId, id]
  );
  const next = await readSegment(client, projectId, environmentId, id);
  await writeUnifiedAudit(
    client,
    actor,
    { projectId, environmentId },
    { type: 'segment', id, key: next.key, name: next.name },
    'draft_saved',
    segmentSnapshot(previous),
    segmentSnapshot(next)
  );
  return next;
}

export async function publishSegment(
  client: PoolClient,
  actor: OperatorPrincipal,
  projectId: string,
  environmentId: string,
  id: string,
  expectedRevision: number
) {
  await lockEnvironment(client, projectId, environmentId);
  const row = await segmentRow(client, projectId, environmentId, id);
  reviewed(row, expectedRevision);
  if (!row.draft) throw new HttpError(409, 'Save a segment draft before publishing');
  const previous = await readSegment(client, projectId, environmentId, id);
  const previousCatalog = await readCatalog(client, projectId, environmentId);
  await client.query(
    'INSERT INTO flightdeck.segment_history(project_id,environment_id,segment_id,version,definition,context_definitions) VALUES($1,$2,$3,$4,$5,$6)',
    [
      projectId,
      environmentId,
      id,
      row.draft.version,
      JSON.stringify(row.draft),
      JSON.stringify(row.draft_context),
    ]
  );
  await client.query(
    "UPDATE flightdeck.segments SET published=draft,published_context=draft_context,draft=NULL,draft_context='[]'::jsonb,revision=revision+1 WHERE project_id=$1 AND environment_id=$2 AND id=$3",
    [projectId, environmentId, id]
  );
  for (const reference of previous.usage) {
    const current = await client.query<{ configuration: Configuration }>(
      'SELECT configuration FROM flightdeck.configurations WHERE flag_id=$1 AND environment_id=$2',
      [reference.flagId, environmentId]
    );
    await resolveConfiguration(client, projectId, environmentId, current.rows[0]!.configuration);
  }
  await client.query(
    'UPDATE flightdeck.environment_targeting SET revision=revision+1 WHERE project_id=$1 AND environment_id=$2',
    [projectId, environmentId]
  );
  const nextCatalog = await readCatalog(client, projectId, environmentId);
  await client.query(
    'INSERT INTO flightdeck.environment_targeting_audit(id,project_id,environment_id,revision,actor_id,actor_name,previous,next) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      randomUUID(),
      projectId,
      environmentId,
      nextCatalog.revision,
      actor.id,
      actor.name,
      JSON.stringify(previousCatalog),
      JSON.stringify(nextCatalog),
    ]
  );
  const next = await readSegment(client, projectId, environmentId, id);
  await writeUnifiedAudit(
    client,
    actor,
    { projectId, environmentId },
    { type: 'segment', id, key: next.key, name: next.published!.name },
    'published',
    segmentSnapshot(previous),
    segmentSnapshot(next),
    previous.usage
  );
  return next;
}

export async function restoreSegment(
  client: PoolClient,
  actor: OperatorPrincipal,
  projectId: string,
  environmentId: string,
  id: string,
  expectedRevision: number,
  version: number
) {
  await lockEnvironment(client, projectId, environmentId);
  const row = await segmentRow(client, projectId, environmentId, id);
  reviewed(row, expectedRevision);
  const result = await client.query<{
    definition: SegmentDefinition;
    context_definitions: AttributeDefinition[];
  }>(
    'SELECT definition,context_definitions FROM flightdeck.segment_history WHERE project_id=$1 AND environment_id=$2 AND segment_id=$3 AND version=$4',
    [projectId, environmentId, id, version]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Published historical snapshot not found');
  const previous = await readSegment(client, projectId, environmentId, id);
  const definition = { ...result.rows[0].definition, version: (row.published?.version ?? 0) + 1 };
  await client.query(
    'UPDATE flightdeck.segments SET draft=$1,draft_context=$2,revision=revision+1 WHERE project_id=$3 AND environment_id=$4 AND id=$5',
    [
      JSON.stringify(definition),
      JSON.stringify(result.rows[0].context_definitions),
      projectId,
      environmentId,
      id,
    ]
  );
  const next = await readSegment(client, projectId, environmentId, id);
  await writeUnifiedAudit(
    client,
    actor,
    { projectId, environmentId },
    { type: 'segment', id, key: next.key, name: next.name },
    'restored_as_draft',
    segmentSnapshot(previous),
    segmentSnapshot(next)
  );
  return next;
}

export async function invalidateSegmentReview(
  client: PoolClient,
  previous: Flag | null,
  next: Flag
) {
  const ids = [
    ...new Set(
      [...(previous?.configuration.rules ?? []), ...next.configuration.rules].flatMap(
        (rule) => rule.segmentIds
      )
    ),
  ];
  if (ids.length)
    await client.query(
      'UPDATE flightdeck.segments SET revision=revision+1 WHERE project_id=$1 AND environment_id=$2 AND id=ANY($3::uuid[])',
      [next.projectId, next.environmentId, ids]
    );
}

const cursorSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n, 'Invalid audit cursor');
export const auditQuerySchema = z
  .strictObject({
    search: z.string().max(100).default(''),
    objectType: z.enum(['flag', 'segment']).optional(),
    objectId: z.uuid().optional(),
    actor: z.string().max(100).default(''),
    action: z.string().max(100).default(''),
    before: cursorSchema.optional(),
    since: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (input) => !input.since || !input.until || Date.parse(input.since) <= Date.parse(input.until),
    'Date range must be ordered'
  );

export async function readAudit(
  database: Database,
  projectId: string,
  environmentId: string,
  input: z.infer<typeof auditQuerySchema>
) {
  const result = await database.query<{
    sequence: string;
    id: string;
    environment_id: string;
    object_type: 'flag' | 'segment';
    object_id: string;
    object_key: string;
    object_name: string;
    actor_id: string;
    actor_name: string;
    action: string;
    previous: unknown;
    next: unknown;
    affected_references: SegmentUsage[] | null;
    created_at: Date;
  }>(
    `SELECT * FROM flightdeck.unified_audit WHERE project_id=$1 AND environment_id=$2
      AND ($3::bigint IS NULL OR sequence<$3) AND ($4::text IS NULL OR object_type=$4) AND ($5::uuid IS NULL OR object_id=$5)
      AND ($6='' OR strpos(lower(id::text || ' ' || object_key || ' ' || object_name || ' ' || actor_id || ' ' || actor_name || ' ' || action),lower($6))>0)
      AND ($7='' OR strpos(lower(actor_id || ' ' || actor_name),lower($7))>0)
      AND ($8='' OR strpos(lower(action),lower($8))>0)
      AND ($9::timestamptz IS NULL OR created_at >= $9) AND ($10::timestamptz IS NULL OR created_at <= $10)
      ORDER BY sequence DESC LIMIT $11`,
    [
      projectId,
      environmentId,
      input.before ?? null,
      input.objectType ?? null,
      input.objectId ?? null,
      input.search,
      input.actor,
      input.action,
      input.since ?? null,
      input.until ?? null,
      input.limit + 1,
    ]
  );
  const rows = result.rows.slice(0, input.limit);
  return auditTrailSchema.parse({
    items: rows.map((row) => ({
      id: row.id,
      objectType: row.object_type,
      objectId: row.object_id,
      objectKey: row.object_key,
      objectName: row.object_name,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      createdAt: row.created_at.toISOString(),
      environmentId: row.environment_id,
      previous: row.previous,
      next: row.next,
      ...(row.affected_references === null ? {} : { affectedReferences: row.affected_references }),
    })),
    nextCursor: result.rows.length > input.limit ? rows.at(-1)!.sequence : null,
  });
}
