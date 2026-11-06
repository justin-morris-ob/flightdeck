import type { Pool, PoolClient } from 'pg';

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { HttpError } from '@onebrief/atlas-bff-kit';

import {
  activitySchema,
  createCredentialSchema,
  createFlagSchema,
  credentialsSchema,
  evaluationSchema,
  flagKeySchema,
  flagSchema,
  flagsSchema,
  issuedCredentialSchema,
  projectsSchema,
  previewSchema,
  snapshotSchema,
  updateFlagSchema,
  type Flag,
  type FlagSummary,
  type OperatorPrincipal,
  type RouteContext,
  type Routes,
} from '../shared/contracts.ts';
import {
  catalogActivitySchema,
  catalogUpdateSchema,
  createOverrideSchema,
  defaultConfiguration,
  evaluationRequestSchema,
  overridesSchema,
  previewRequestSchema,
  publishConfigurationSchema,
  revokeOverrideSchema,
  type TypedValue,
  type Outcome,
  type Configuration,
  type SubjectOverride,
} from '../shared/targeting.ts';
import {
  deploymentSchema,
  createSegmentSchema,
  updateSegmentDraftSchema,
  publishSegmentSchema,
  restoreSegmentSchema,
  segmentLibrarySchema,
  type Deployment,
} from '../shared/unified.ts';
import { defaultDeployment } from './deployment.ts';
import {
  DirectoryClient,
  directoryResolveRequestSchema,
  directorySearchQuerySchema,
} from './directory.ts';
import { configurationWarnings, evaluate } from './evaluator.ts';
import {
  matchingOverrides,
  publishConfiguration,
  resolveConfiguration,
  readCatalog,
  saveCatalog,
  subjectOverride,
  validateActiveOverrides,
  validateConfigurationTypes,
  validateOverrideOutcome,
  type OverrideRow,
} from './targeting-storage.ts';
import {
  auditQuerySchema,
  createSegment,
  listSegments,
  saveSegmentDraft,
  publishSegment,
  restoreSegment,
  readSegmentHistory,
  segmentHistoryQuerySchema,
  readAudit,
  lockEnvironment,
  invalidateSegmentReview,
  writeUnifiedAudit,
} from './unified-storage.ts';

type Database = Pool | PoolClient;
interface FlagRow {
  id: string;
  project_id: string;
  environment_id: string;
  key: string;
  name: string;
  description: string;
  owner: string;
  archived: boolean;
  lifecycle: Flag['lifecycle'];
  revision: number;
  enabled: boolean;
  configuration: Configuration;
  updated_at: Date;
}
interface CredentialRow {
  id: string;
  name: string;
  project_id: string;
  environment_id: string;
  allowed_tenant_ids: string[];
  created_at: Date;
  revoked_at: Date | null;
}
const scopeSchema = z.object({ projectId: z.uuid(), environmentId: z.uuid() });
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
const inventoryQuery = z.strictObject({
  search: z.string().max(100).default(''),
  after: flagKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  archived: z.enum(['active', 'archived', 'all']).default('active'),
  environmentId: z.uuid().optional(),
  lifecycle: z.enum(['development', 'release', 'system', 'permissions']).optional(),
  longevity: z.enum(['temporary', 'long-lived']).optional(),
});
const activityQuery = z.strictObject({
  before: z.coerce.number().int().positive().max(2147483647).optional(),
  limit: limitSchema,
});
const noQuery = z.strictObject({});
const overridesQuery = z.strictObject({ after: z.uuid().optional(), limit: limitSchema });
const flagColumns = `f.id, f.project_id, c.environment_id, f.key, c.name, c.description,
  c.owner, c.archived, c.lifecycle, c.revision, c.enabled, c.configuration, c.updated_at`;

function query<T>(context: RouteContext, schema: z.ZodType<T>): T {
  const input: Record<string, string> = {};
  for (const [key, value] of context.query) {
    if (key in input) throw new HttpError(400, `Repeated query parameter: ${key}`);
    input[key] = value;
  }
  return schema.parse(input);
}
function operator(
  context: RouteContext,
  permission: 'read' | 'write' | 'admin' = 'read'
): OperatorPrincipal {
  if (context.principal.kind !== 'operator') throw new HttpError(403, 'Operator access required');
  if (permission === 'write' && context.principal.role === 'viewer')
    throw new HttpError(403, 'Editor access required');
  if (permission === 'admin' && context.principal.role !== 'administrator')
    throw new HttpError(403, 'Administrator access required');
  return context.principal;
}
async function scope(database: Database, context: RouteContext, evaluation = false) {
  const parsed = scopeSchema.parse(context.params);
  const principal = context.principal;
  if (principal.kind === 'service') {
    if (!evaluation) throw new HttpError(403, 'Operator access required');
    if (
      principal.projectId !== parsed.projectId ||
      principal.environmentId !== parsed.environmentId
    )
      throw new HttpError(403, 'Credential does not permit this scope');
  }
  const result = await database.query(
    `SELECT e.id FROM flightdeck.environments e
    JOIN flightdeck.projects p ON p.id = e.project_id
    WHERE p.id = $1 AND e.id = $2 AND p.organization_id = $3`,
    [parsed.projectId, parsed.environmentId, principal.organizationId]
  );
  if (!result.rowCount) throw new HttpError(404, 'Scope not found');
  return parsed;
}
function flag(row: FlagRow): Flag {
  return flagSchema.parse({
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    key: row.key,
    name: row.name,
    description: row.description,
    owner: row.owner,
    archived: row.archived,
    lifecycle: row.lifecycle,
    revision: row.revision,
    enabled: row.enabled,
    configuration: row.configuration,
    updatedAt: row.updated_at.toISOString(),
  });
}
function credential(row: CredentialRow) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    environmentId: row.environment_id,
    allowedTenantIds: row.allowed_tenant_ids,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}
function snapshot(value: Flag) {
  return snapshotSchema.parse({
    name: value.name,
    description: value.description,
    owner: value.owner,
    archived: value.archived,
    lifecycle: value.lifecycle,
    revision: value.revision,
    enabled: value.enabled,
    configuration: value.configuration,
  });
}
async function findFlag(
  database: Database,
  projectId: string,
  environmentId: string,
  key: string,
  lock = false
): Promise<Flag> {
  if (lock) {
    await database.query(
      'SELECT id FROM flightdeck.flags WHERE project_id = $1 AND key = $2 FOR UPDATE',
      [projectId, key]
    );
    // Read the configuration in a fresh snapshot after any preceding writer commits.
  }
  const result = await database.query<FlagRow>(
    `SELECT ${flagColumns}
    FROM flightdeck.flags f JOIN flightdeck.configurations c ON c.flag_id = f.id
    WHERE f.project_id = $1 AND c.environment_id = $2 AND f.key = $3`,
    [projectId, environmentId, key]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Flag not found');
  const row = result.rows[0];
  row.configuration = await resolveConfiguration(
    database,
    projectId,
    environmentId,
    row.configuration
  );
  return flag(row);
}
async function transaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  readOnly = false
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function audit(
  client: PoolClient,
  actor: OperatorPrincipal,
  previous: Flag | null,
  next: Flag,
  action: string,
  overrideChange?: { previous: SubjectOverride | null; next: SubjectOverride | null }
) {
  await invalidateSegmentReview(client, previous, next);
  const id = randomUUID();
  await client.query(
    `INSERT INTO flightdeck.audit
    (id, flag_id, environment_id, project_id, actor_id, actor_name, action, revision, previous, next)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      next.id,
      next.environmentId,
      next.projectId,
      actor.id,
      actor.name,
      action,
      next.revision,
      previous
        ? JSON.stringify({
            ...snapshot(previous),
            ...(overrideChange ? { override: overrideChange.previous } : {}),
          })
        : null,
      JSON.stringify({
        ...snapshot(next),
        ...(overrideChange ? { override: overrideChange.next } : {}),
      }),
    ]
  );
  await writeUnifiedAudit(
    client,
    actor,
    { projectId: next.projectId, environmentId: next.environmentId },
    { type: 'flag', id: next.id, key: next.key, name: next.name },
    action,
    previous
      ? { ...snapshot(previous), ...(overrideChange ? { override: overrideChange.previous } : {}) }
      : null,
    { ...snapshot(next), ...(overrideChange ? { override: overrideChange.next } : {}) },
    undefined,
    id
  );
}

async function inventory(database: Database, context: RouteContext, localEnvironmentId?: string) {
  const actor = operator(context);
  const projectId = z.uuid().parse(context.params.projectId);
  const input = query(context, inventoryQuery);
  if (localEnvironmentId && input.environmentId && input.environmentId !== localEnvironmentId)
    throw new HttpError(400, 'The scoped inventory cannot select another environment');
  const selectedEnvironment = localEnvironmentId ?? input.environmentId ?? null;
  type SummaryEnvironment = Omit<FlagSummary['environments'][number], 'configurationSummary'> & {
    updatedAt: string;
    offValue: TypedValue;
    defaultOutcome: Outcome;
    rules: number;
    variants: number;
  };
  const result = await database.query<{
    id: string | null;
    project_id: string;
    key: string;
    environments: SummaryEnvironment[];
  }>(
    `SELECT f.id,f.project_id,f.key,COALESCE(gates.environments,'[]'::jsonb) AS environments
      FROM flightdeck.projects p LEFT JOIN LATERAL (
        SELECT f.id,f.project_id,f.key FROM flightdeck.flags f WHERE f.project_id=p.id
          AND ($3::text IS NULL OR f.key>$3)
          AND EXISTS (SELECT 1 FROM flightdeck.configurations c WHERE c.flag_id=f.id
            AND ($7::uuid IS NULL OR c.environment_id=$7)
            AND ($4='all' OR c.archived=($4='archived'))
            AND ($5='' OR strpos(lower(f.key || ' ' || c.name || ' ' || c.description || ' ' || c.owner),lower($5))>0)
            AND ($8::text IS NULL OR c.lifecycle=$8)
            AND ($9::text IS NULL OR ($9='temporary' AND c.lifecycle IN ('development','release'))
              OR ($9='long-lived' AND c.lifecycle IN ('system','permissions'))))
        ORDER BY f.key LIMIT $6
      ) f ON true LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'environmentId',e.id,'enabled',c.enabled,'archived',c.archived,'lifecycle',c.lifecycle,
          'name',c.name,'description',c.description,'owner',c.owner,'revision',c.revision,'updatedAt',c.updated_at,
          'valueType',c.configuration->'offValue'->>'type','offValue',c.configuration->'offValue',
          'defaultOutcome',c.configuration->'defaultOutcome','rules',jsonb_array_length(c.configuration->'rules'),
          'variants',jsonb_array_length(c.configuration->'variants'),
          'audienceSummary',CASE WHEN jsonb_array_length(c.configuration->'rules')=0 THEN
            CASE WHEN c.configuration->'defaultOutcome'='{"kind":"value","value":{"type":"boolean","value":true}}'::jsonb
              THEN 'Everyone' ELSE 'No audience rules' END
            ELSE COALESCE((SELECT string_agg(s.published->>'name',', ' ORDER BY s.key) FROM flightdeck.segments s
              WHERE s.project_id=c.project_id AND s.environment_id=c.environment_id AND s.published IS NOT NULL
              AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.configuration->'rules') r WHERE (r->'segmentIds') ? s.id::text)), '')
              || CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(c.configuration->'rules') r WHERE jsonb_array_length(r->'conditions')>0)
                THEN ' · Direct targeting rules' ELSE '' END END
        ) ORDER BY e.key,e.id) AS environments FROM flightdeck.configurations c
        JOIN flightdeck.environments e ON e.id=c.environment_id AND e.project_id=p.id
        WHERE c.flag_id=f.id AND c.project_id=p.id AND ($10::uuid IS NULL OR c.environment_id=$10)
      ) gates ON true WHERE p.id=$1 AND p.organization_id=$2 ORDER BY f.key`,
    [
      projectId,
      actor.organizationId,
      input.after ?? null,
      input.archived,
      input.search,
      input.limit + 1,
      selectedEnvironment,
      input.lifecycle ?? null,
      input.longevity ?? null,
      localEnvironmentId ?? null,
    ]
  );
  if (!result.rowCount) throw new HttpError(404, 'Project not found');
  const rows = result.rows.filter((row) => row.id !== null);
  const valueLabel = (value: TypedValue) => {
    const text = JSON.stringify(value.value);
    return text.length > 80 ? `${value.type} value` : text;
  };
  const items = rows.slice(0, input.limit).map((row) => {
    const first = row.environments[0]!;
    return {
      id: row.id,
      projectId: row.project_id,
      key: row.key,
      name: first.name,
      description: first.description,
      owner: first.owner,
      archived: first.archived,
      lifecycle: first.lifecycle,
      revision: first.revision,
      updatedAt: new Date(first.updatedAt).toISOString(),
      environments: row.environments.map(
        ({ updatedAt: _updatedAt, offValue, defaultOutcome, rules, variants, ...entry }) => ({
          ...entry,
          audienceSummary: entry.audienceSummary || `${rules} ordered targeting rules`,
          configurationSummary: `Gate Off → ${valueLabel(offValue)}; default → ${
            defaultOutcome.kind === 'value'
              ? valueLabel(defaultOutcome.value)
              : defaultOutcome.kind === 'variant'
                ? `variant ${defaultOutcome.variantId}`
                : 'weighted variants'
          } · ${rules} ordered rules · ${variants} variants`,
        })
      ),
    };
  });
  return flagsSchema.parse({
    items,
    nextCursor: rows.length > input.limit ? items.at(-1)!.key : null,
  });
}

export function createRoutes(
  pool: Pool,
  directory = new DirectoryClient([]),
  deployment: Deployment = defaultDeployment
): Routes {
  deployment = deploymentSchema.parse(deployment);
  const base = '/api/v1/projects/:projectId/environments/:environmentId';
  const routes: Routes = {
    'GET /api/v1/deployment': async (context) => {
      operator(context);
      query(context, noQuery);
      return deployment;
    },
    [`GET ${base}/segments`]: async (context) => {
      operator(context);
      query(context, noQuery);
      return transaction(
        pool,
        async (client) => {
          const { projectId, environmentId } = await scope(client, context);
          return segmentLibrarySchema.parse({
            items: await listSegments(client, projectId, environmentId),
          });
        },
        true
      );
    },
    [`GET ${base}/segments/:segmentId/history`]: async (context) => {
      operator(context);
      const input = query(context, segmentHistoryQuerySchema);
      const { projectId, environmentId } = await scope(pool, context);
      const id = z.uuid().parse(context.params.segmentId);
      return readSegmentHistory(pool, projectId, environmentId, id, input);
    },
    [`POST ${base}/segments`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const input = createSegmentSchema.parse(context.body);
      return transaction(pool, (client) =>
        createSegment(client, actor, projectId, environmentId, input)
      );
    },
    [`PUT ${base}/segments/:segmentId/draft`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const id = z.uuid().parse(context.params.segmentId);
      const input = updateSegmentDraftSchema.parse(context.body);
      return transaction(pool, (client) =>
        saveSegmentDraft(client, actor, projectId, environmentId, id, input)
      );
    },
    [`POST ${base}/segments/:segmentId/publish`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const id = z.uuid().parse(context.params.segmentId);
      const input = publishSegmentSchema.parse(context.body);
      return transaction(pool, (client) =>
        publishSegment(client, actor, projectId, environmentId, id, input.expectedRevision)
      );
    },
    [`POST ${base}/segments/:segmentId/restore`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const id = z.uuid().parse(context.params.segmentId);
      const input = restoreSegmentSchema.parse(context.body);
      return transaction(pool, (client) =>
        restoreSegment(
          client,
          actor,
          projectId,
          environmentId,
          id,
          input.expectedRevision,
          input.version
        )
      );
    },
    [`GET ${base}/audit`]: async (context) => {
      operator(context);
      const input = query(context, auditQuerySchema);
      const { projectId, environmentId } = await scope(pool, context);
      return readAudit(pool, projectId, environmentId, input);
    },
    [`GET ${base}/directory`]: async (context) => {
      operator(context);
      query(context, noQuery);
      const binding = await scope(pool, context);
      return directory.publicStatus(binding.projectId, binding.environmentId);
    },
    [`GET ${base}/directory/search`]: async (context) => {
      operator(context, 'write');
      const input = query(context, directorySearchQuerySchema);
      const binding = await scope(pool, context);
      return directory.search(binding, input);
    },
    [`POST ${base}/directory/resolve`]: async (context) => {
      operator(context, 'write');
      query(context, noQuery);
      const binding = await scope(pool, context);
      return directory.resolve(binding, directoryResolveRequestSchema.parse(context.body));
    },
    'GET /api/v1/projects': async (context) => {
      const actor = operator(context);
      query(context, noQuery);
      const result = await pool.query<{
        id: string;
        key: string;
        name: string;
        organization_id: string;
        environment_id: string | null;
        environment_key: string | null;
        environment_name: string | null;
      }>(
        `SELECT p.id, p.key, p.name, p.organization_id,
        e.id AS environment_id, e.key AS environment_key, e.name AS environment_name
        FROM flightdeck.projects p LEFT JOIN flightdeck.environments e ON e.project_id = p.id
        WHERE p.organization_id = $1 ORDER BY p.key, e.key`,
        [actor.organizationId]
      );
      const projects = new Map<
        string,
        {
          id: string;
          key: string;
          name: string;
          organizationId: string;
          environments: { id: string; key: string; name: string }[];
        }
      >();
      for (const row of result.rows) {
        let project = projects.get(row.id);
        if (!project) {
          project = {
            id: row.id,
            key: row.key,
            name: row.name,
            organizationId: row.organization_id,
            environments: [],
          };
          projects.set(row.id, project);
        }
        if (row.environment_id && row.environment_key && row.environment_name) {
          project.environments.push({
            id: row.environment_id,
            key: row.environment_key,
            name: row.environment_name,
          });
        }
      }
      return projectsSchema.parse({ items: [...projects.values()] });
    },
    'GET /api/v1/projects/:projectId/flags': async (context) => inventory(pool, context),
    [`GET ${base}/flags`]: async (context) => {
      operator(context);
      const { environmentId } = await scope(pool, context);
      return inventory(pool, context, environmentId);
    },
    [`POST ${base}/flags`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const input = createFlagSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const identity = await client.query<{ id: string }>(
          `INSERT INTO flightdeck.flags(id,project_id,key) VALUES($1,$2,$3)
            ON CONFLICT(project_id,key) DO UPDATE SET key=EXCLUDED.key RETURNING id`,
          [randomUUID(), projectId, input.key]
        );
        const id = identity.rows[0]!.id;
        await client.query(
          `INSERT INTO flightdeck.configurations
            (flag_id,environment_id,project_id,enabled,configuration,name,description,owner,archived,lifecycle,revision,updated_at)
            VALUES($1,$2,$3,false,$4,$5,$6,$7,false,$8,1,clock_timestamp())`,
          [
            id,
            environmentId,
            projectId,
            JSON.stringify(defaultConfiguration(randomUUID())),
            input.name,
            input.description,
            input.owner,
            input.lifecycle,
          ]
        );
        const next = await findFlag(client, projectId, environmentId, input.key);
        await audit(client, actor, null, next, 'created');
        return next;
      });
    },
    [`GET ${base}/flags/:flagKey`]: async (context) => {
      operator(context);
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      return findFlag(pool, projectId, environmentId, flagKeySchema.parse(context.params.flagKey));
    },
    [`PATCH ${base}/flags/:flagKey`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const key = flagKeySchema.parse(context.params.flagKey);
      const input = updateFlagSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const previous = await findFlag(client, projectId, environmentId, key, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Flag revision conflict; reload before saving');
        const archived = input.archived ?? previous.archived;
        if (archived && input.enabled === true)
          throw new HttpError(400, 'Archived flags cannot be enabled; restore the flag first');
        await client.query(
          `UPDATE flightdeck.configurations SET name=$1,description=$2,owner=$3,
          archived=$4,lifecycle=$5,revision=revision+1,updated_at=clock_timestamp() WHERE flag_id=$6 AND environment_id=$7`,
          [
            input.name ?? previous.name,
            input.description ?? previous.description,
            input.owner ?? previous.owner,
            archived,
            input.lifecycle ?? previous.lifecycle,
            previous.id,
            environmentId,
          ]
        );
        if (input.enabled !== undefined) {
          await client.query(
            'UPDATE flightdeck.configurations SET enabled = $1 WHERE flag_id = $2 AND environment_id = $3',
            [input.enabled, previous.id, environmentId]
          );
        }
        const next = await findFlag(client, projectId, environmentId, key);
        const action =
          previous.archived !== next.archived
            ? next.archived
              ? 'archived'
              : 'restored'
            : previous.enabled !== next.enabled
              ? next.enabled
                ? 'enabled'
                : 'disabled'
              : 'updated';
        await audit(client, actor, previous, next, action);
        return next;
      });
    },
    [`GET ${base}/flags/:flagKey/activity`]: async (context) => {
      operator(context);
      const { projectId, environmentId } = await scope(pool, context);
      const input = query(context, activityQuery);
      const value = await findFlag(
        pool,
        projectId,
        environmentId,
        flagKeySchema.parse(context.params.flagKey)
      );
      const result = await pool.query<{
        id: string;
        flag_id: string;
        environment_id: string;
        actor_id: string;
        actor_name: string;
        action: string;
        revision: number;
        previous: unknown;
        next: unknown;
        created_at: Date;
      }>(
        `SELECT id, flag_id, environment_id, actor_id, actor_name, action, revision, previous, next, created_at
        FROM flightdeck.audit WHERE flag_id=$1 AND project_id=$2 AND environment_id=$3
        AND ($4::integer IS NULL OR revision<$4) ORDER BY revision DESC LIMIT $5`,
        [value.id, projectId, environmentId, input.before ?? null, input.limit + 1]
      );
      const items = result.rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        flagId: row.flag_id,
        environmentId: row.environment_id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        revision: row.revision,
        previous: row.previous,
        next: row.next,
        createdAt: row.created_at.toISOString(),
      }));
      return activitySchema.parse({
        items,
        nextCursor: result.rows.length > input.limit ? String(items.at(-1)!.revision) : null,
      });
    },
    [`GET ${base}/catalog`]: async (context) => {
      operator(context);
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      return readCatalog(pool, projectId, environmentId);
    },
    [`PUT ${base}/catalog`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const input = catalogUpdateSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const previous = await readCatalog(client, projectId, environmentId, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Catalog revision conflict; reload before saving');
        return saveCatalog(client, actor, previous, input.catalog, environmentId);
      });
    },
    [`GET ${base}/catalog/activity`]: async (context) => {
      operator(context);
      const { projectId, environmentId } = await scope(pool, context);
      const input = query(context, activityQuery);
      const result = await pool.query<{
        id: string;
        project_id: string;
        revision: number;
        actor_id: string;
        actor_name: string;
        previous: unknown;
        next: unknown;
        created_at: Date;
      }>(
        `SELECT * FROM flightdeck.environment_targeting_audit WHERE project_id=$1 AND environment_id=$2
        AND ($3::integer IS NULL OR revision<$3) ORDER BY revision DESC LIMIT $4`,
        [projectId, environmentId, input.before ?? null, input.limit + 1]
      );
      const items = result.rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        revision: row.revision,
        actorId: row.actor_id,
        actorName: row.actor_name,
        previous: row.previous,
        next: row.next,
        createdAt: row.created_at.toISOString(),
      }));
      return catalogActivitySchema.parse({
        items,
        nextCursor: result.rows.length > input.limit ? String(items.at(-1)!.revision) : null,
      });
    },
    [`PUT ${base}/flags/:flagKey/configuration`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const key = flagKeySchema.parse(context.params.flagKey);
      const input = publishConfigurationSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const previous = await findFlag(client, projectId, environmentId, key, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Flag revision conflict; reload before saving');
        const catalog = await readCatalog(client, projectId, environmentId, true);
        const proposed = publishConfiguration(
          input.configuration,
          previous.configuration,
          catalog,
          input.expectedCatalogRevision
        );
        const configuration = await resolveConfiguration(
          client,
          projectId,
          environmentId,
          proposed
        );
        validateConfigurationTypes(configuration);
        await validateActiveOverrides(
          client,
          previous.id,
          environmentId,
          configuration,
          new Date().toISOString()
        );
        await client.query(
          'UPDATE flightdeck.configurations SET configuration = $1 WHERE flag_id = $2 AND environment_id = $3',
          [JSON.stringify({ ...configuration, segments: [] }), previous.id, environmentId]
        );
        await client.query(
          'UPDATE flightdeck.configurations SET revision=revision+1,updated_at=clock_timestamp() WHERE flag_id=$1 AND environment_id=$2',
          [previous.id, environmentId]
        );
        const next = await findFlag(client, projectId, environmentId, key);
        await audit(client, actor, previous, next, 'configuration');
        return next;
      });
    },
    [`POST ${base}/flags/:flagKey/preview`]: async (context) => {
      operator(context);
      query(context, noQuery);
      return transaction(
        pool,
        async (client) => {
          const { projectId, environmentId } = await scope(client, context);
          const input = previewRequestSchema.parse(context.body);
          const currentFlag = await findFlag(
            client,
            projectId,
            environmentId,
            flagKeySchema.parse(context.params.flagKey)
          );
          if (currentFlag.revision !== input.expectedRevision)
            throw new HttpError(409, 'Flag revision conflict; reload before previewing');
          const overrides = await matchingOverrides(
            client,
            currentFlag.id,
            projectId,
            environmentId,
            input.context
          );
          const now = new Date().toISOString();
          const current = evaluate({ flag: currentFlag, context: input.context, overrides, now });
          if (!input.proposedConfiguration)
            return previewSchema.parse({
              current,
              proposed: null,
              warnings: [],
              allocationChanged: false,
            });
          const catalog = await readCatalog(client, projectId, environmentId);
          const proposedConfiguration = publishConfiguration(
            input.proposedConfiguration,
            currentFlag.configuration,
            catalog,
            input.expectedCatalogRevision
          );
          const configuration = await resolveConfiguration(
            client,
            projectId,
            environmentId,
            proposedConfiguration
          );
          validateConfigurationTypes(configuration);
          await validateActiveOverrides(client, currentFlag.id, environmentId, configuration, now);
          const changes = configurationWarnings(currentFlag.configuration, configuration);
          const proposed = evaluate({
            flag: { ...currentFlag, configuration, revision: currentFlag.revision + 1 },
            context: input.context,
            overrides,
            now,
          });
          return previewSchema.parse({ current, proposed, ...changes });
        },
        true
      );
    },
    [`GET ${base}/flags/:flagKey/overrides`]: async (context) => {
      operator(context);
      const { projectId, environmentId } = await scope(pool, context);
      const input = query(context, overridesQuery);
      const value = await findFlag(
        pool,
        projectId,
        environmentId,
        flagKeySchema.parse(context.params.flagKey)
      );
      const result = await pool.query<OverrideRow>(
        `SELECT * FROM flightdeck.subject_overrides
        WHERE flag_id = $1 AND project_id = $2 AND environment_id = $3
        AND ($4::uuid IS NULL OR id > $4) ORDER BY id LIMIT $5`,
        [value.id, projectId, environmentId, input.after ?? null, input.limit + 1]
      );
      const items = result.rows.slice(0, input.limit).map(subjectOverride);
      return overridesSchema.parse({
        items,
        nextCursor: result.rows.length > input.limit ? items.at(-1)!.id : null,
      });
    },
    [`POST ${base}/flags/:flagKey/overrides`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const key = flagKeySchema.parse(context.params.flagKey);
      const input = createOverrideSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const previous = await findFlag(client, projectId, environmentId, key, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Flag revision conflict; reload before saving');
        if (Date.parse(input.override.expiresAt) <= Date.now())
          throw new HttpError(400, 'Override expiry must be in the future');
        validateOverrideOutcome(input.override.outcome, previous.configuration);
        const count = await client.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM flightdeck.subject_overrides WHERE flag_id = $1 AND environment_id = $2 AND revoked_at IS NULL',
          [previous.id, environmentId]
        );
        if (count.rows[0]!.count >= 100)
          throw new HttpError(
            409,
            'Revoke an existing override before adding more; limit is 100 nonrevoked overrides'
          );
        const result = await client.query<OverrideRow>(
          `INSERT INTO flightdeck.subject_overrides
          (id, flag_id, project_id, environment_id, tenant_id, subject_id, owner, reason, expires_at, outcome)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            randomUUID(),
            previous.id,
            projectId,
            environmentId,
            input.override.tenantId,
            input.override.subjectId,
            input.override.owner,
            input.override.reason,
            input.override.expiresAt,
            JSON.stringify(input.override.outcome),
          ]
        );
        await client.query(
          'UPDATE flightdeck.configurations SET revision=revision+1,updated_at=clock_timestamp() WHERE flag_id=$1 AND environment_id=$2',
          [previous.id, environmentId]
        );
        const next = await findFlag(client, projectId, environmentId, key);
        await audit(client, actor, previous, next, 'override_created', {
          previous: null,
          next: subjectOverride(result.rows[0]!),
        });
        return next;
      });
    },
    [`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const key = flagKeySchema.parse(context.params.flagKey);
      const overrideId = z.uuid().parse(context.params.overrideId);
      const input = revokeOverrideSchema.parse(context.body);
      return transaction(pool, async (client) => {
        await lockEnvironment(client, projectId, environmentId);
        const previous = await findFlag(client, projectId, environmentId, key, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Flag revision conflict; reload before saving');
        const existing = await client.query<OverrideRow>(
          'SELECT * FROM flightdeck.subject_overrides WHERE id = $1 AND flag_id = $2 AND project_id = $3 AND environment_id = $4',
          [overrideId, previous.id, projectId, environmentId]
        );
        if (!existing.rows[0]) throw new HttpError(404, 'Override not found');
        if (existing.rows[0].revoked_at)
          throw new HttpError(409, 'Override has already been revoked');
        const result = await client.query<OverrideRow>(
          'UPDATE flightdeck.subject_overrides SET revoked_at = clock_timestamp() WHERE id = $1 RETURNING *',
          [overrideId]
        );
        await client.query(
          'UPDATE flightdeck.configurations SET revision=revision+1,updated_at=clock_timestamp() WHERE flag_id=$1 AND environment_id=$2',
          [previous.id, environmentId]
        );
        const next = await findFlag(client, projectId, environmentId, key);
        await audit(client, actor, previous, next, 'override_revoked', {
          previous: subjectOverride(existing.rows[0]),
          next: subjectOverride(result.rows[0]!),
        });
        return next;
      });
    },
    [`POST ${base}/evaluate/:flagKey`]: async (context) => {
      query(context, noQuery);
      return transaction(
        pool,
        async (client) => {
          const { projectId, environmentId } = await scope(client, context, true);
          const input = evaluationRequestSchema.parse(context.body);
          if (
            context.principal.kind === 'service' &&
            (!input.context.tenantId ||
              !context.principal.allowedTenantIds.includes(input.context.tenantId))
          ) {
            throw new HttpError(403, 'Credential does not permit this tenant');
          }
          const value = await findFlag(
            client,
            projectId,
            environmentId,
            flagKeySchema.parse(context.params.flagKey)
          );
          const overrides = await matchingOverrides(
            client,
            value.id,
            projectId,
            environmentId,
            input.context
          );
          return evaluationSchema.parse(
            evaluate({
              flag: value,
              context: input.context,
              overrides,
              now: new Date().toISOString(),
            })
          );
        },
        true
      );
    },
    [`GET ${base}/credentials`]: async (context) => {
      operator(context, 'admin');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const result = await pool.query<CredentialRow>(
        `SELECT id, name, project_id, environment_id, allowed_tenant_ids, created_at, revoked_at
        FROM flightdeck.credentials WHERE project_id = $1 AND environment_id = $2
        ORDER BY created_at DESC, id LIMIT 100`,
        [projectId, environmentId]
      );
      return credentialsSchema.parse({ items: result.rows.map(credential) });
    },
    [`POST ${base}/credentials`]: async (context) => {
      const actor = operator(context, 'admin');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const input = createCredentialSchema.parse(context.body);
      const token = `fd_${randomBytes(32).toString('hex')}`;
      const result = await pool.query<CredentialRow>(
        `INSERT INTO flightdeck.credentials
        (id, organization_id, project_id, environment_id, name, token_hash, allowed_tenant_ids) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, name, project_id, environment_id, allowed_tenant_ids, created_at, revoked_at`,
        [
          randomUUID(),
          actor.organizationId,
          projectId,
          environmentId,
          input.name,
          createHash('sha256').update(token).digest('hex'),
          input.allowedTenantIds,
        ]
      );
      return issuedCredentialSchema.parse({ credential: credential(result.rows[0]!), token });
    },
    [`DELETE ${base}/credentials/:credentialId`]: async (context) => {
      operator(context, 'admin');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const credentialId = z.uuid().parse(context.params.credentialId);
      const result = await pool.query(
        `UPDATE flightdeck.credentials SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1 AND project_id = $2 AND environment_id = $3 RETURNING id`,
        [credentialId, projectId, environmentId]
      );
      if (!result.rowCount) throw new HttpError(404, 'Credential not found');
      return undefined;
    },
  };
  return Object.fromEntries(
    Object.entries(routes).map(([key, handler]) => [
      key,
      async (context: RouteContext) => {
        try {
          const mutating =
            !key.startsWith('GET ') &&
            !key.endsWith('/evaluate/:flagKey') &&
            !key.endsWith('/preview') &&
            !key.endsWith('/directory/resolve');
          if (mutating) {
            operator(context, key.includes('/credentials') ? 'admin' : 'write');
            if (deployment.mode !== 'local')
              throw new HttpError(403, 'The master dashboard is read-only');
            if (!context.params.environmentId)
              throw new HttpError(403, 'A local environment scope is required');
            const binding = await scope(pool, context);
            const environment = await pool.query<{ key: string }>(
              'SELECT key FROM flightdeck.environments WHERE id=$1 AND project_id=$2',
              [binding.environmentId, binding.projectId]
            );
            if (environment.rows[0]?.key !== deployment.environmentKey)
              throw new HttpError(403, 'This dashboard can write only its deployment environment');
          }
          return await handler(context);
        } catch (error) {
          if (error instanceof z.ZodError)
            throw new HttpError(400, error.issues.map((issue) => issue.message).join('; '));
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505'
          ) {
            throw new HttpError(409, 'A resource with this key already exists');
          }
          throw error;
        }
      },
    ])
  );
}
