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
  snapshotSchema,
  updateFlagSchema,
  type Flag,
  type OperatorPrincipal,
  type RouteContext,
  type Routes,
} from '../shared/contracts.ts';

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
  revision: number;
  enabled: boolean;
  updated_at: Date;
}
interface CredentialRow {
  id: string;
  name: string;
  project_id: string;
  environment_id: string;
  created_at: Date;
  revoked_at: Date | null;
}
const scopeSchema = z.object({ projectId: z.uuid(), environmentId: z.uuid() });
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
const inventoryQuery = z.strictObject({
  search: z.string().max(100).default(''),
  after: flagKeySchema.optional(),
  limit: limitSchema,
  archived: z.enum(['active', 'archived', 'all']).default('active'),
});
const activityQuery = z.strictObject({
  before: z.coerce.number().int().positive().max(2147483647).optional(),
  limit: limitSchema,
});
const noQuery = z.strictObject({});
const flagColumns = `f.id, f.project_id, c.environment_id, f.key, f.name, f.description,
  f.owner, f.archived, f.revision, c.enabled, f.updated_at`;

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
    revision: row.revision,
    enabled: row.enabled,
    updatedAt: row.updated_at.toISOString(),
  });
}
function credential(row: CredentialRow) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    environmentId: row.environment_id,
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
    enabled: value.enabled,
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
  return flag(result.rows[0]);
}
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
  action: string
) {
  await client.query(
    `INSERT INTO flightdeck.audit
    (id, flag_id, environment_id, project_id, actor_id, actor_name, action, revision, previous, next)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      randomUUID(),
      next.id,
      next.environmentId,
      next.projectId,
      actor.id,
      actor.name,
      action,
      next.revision,
      previous ? JSON.stringify(snapshot(previous)) : null,
      JSON.stringify(snapshot(next)),
    ]
  );
}

export function createRoutes(pool: Pool): Routes {
  const base = '/api/v1/projects/:projectId/environments/:environmentId';
  const routes: Routes = {
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
    [`GET ${base}/flags`]: async (context) => {
      operator(context);
      const { projectId, environmentId } = await scope(pool, context);
      const input = query(context, inventoryQuery);
      const result = await pool.query<FlagRow>(
        `SELECT ${flagColumns}
        FROM flightdeck.flags f JOIN flightdeck.configurations c ON c.flag_id = f.id
        WHERE f.project_id = $1 AND c.environment_id = $2
        AND ($3::text IS NULL OR f.key > $3)
        AND ($4 = 'all' OR f.archived = ($4 = 'archived'))
        AND ($5 = '' OR strpos(lower(f.key || ' ' || f.name || ' ' || f.description || ' ' || f.owner), lower($5)) > 0)
        ORDER BY f.key LIMIT $6`,
        [
          projectId,
          environmentId,
          input.after ?? null,
          input.archived,
          input.search,
          input.limit + 1,
        ]
      );
      const items = result.rows.slice(0, input.limit).map(flag);
      return flagsSchema.parse({
        items,
        nextCursor: result.rows.length > input.limit ? items.at(-1)!.key : null,
      });
    },
    [`POST ${base}/flags`]: async (context) => {
      const actor = operator(context, 'write');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const input = createFlagSchema.parse(context.body);
      return transaction(pool, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO flightdeck.flags (id, project_id, key, name, description, owner)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, projectId, input.key, input.name, input.description, input.owner]
        );
        await client.query(
          `INSERT INTO flightdeck.configurations (flag_id, environment_id, project_id, enabled)
          SELECT $1, id, project_id, false FROM flightdeck.environments WHERE project_id = $2`,
          [id, projectId]
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
        const previous = await findFlag(client, projectId, environmentId, key, true);
        if (previous.revision !== input.expectedRevision)
          throw new HttpError(409, 'Flag revision conflict; reload before saving');
        const archived = input.archived ?? previous.archived;
        if (archived && input.enabled === true)
          throw new HttpError(400, 'Archived flags cannot be enabled; restore the flag first');
        await client.query(
          `UPDATE flightdeck.flags SET name = $1, description = $2, owner = $3,
          archived = $4, revision = revision + 1, updated_at = clock_timestamp() WHERE id = $5`,
          [
            input.name ?? previous.name,
            input.description ?? previous.description,
            input.owner ?? previous.owner,
            archived,
            previous.id,
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
        FROM flightdeck.audit WHERE flag_id = $1 AND project_id = $2
        AND ($3::integer IS NULL OR revision < $3) ORDER BY revision DESC LIMIT $4`,
        [value.id, projectId, input.before ?? null, input.limit + 1]
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
    [`GET ${base}/evaluate/:flagKey`]: async (context) => {
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context, true);
      const value = await findFlag(
        pool,
        projectId,
        environmentId,
        flagKeySchema.parse(context.params.flagKey)
      );
      return evaluationSchema.parse({
        key: value.key,
        projectId,
        environmentId,
        value: !value.archived && value.enabled,
        reason: value.archived ? 'archived' : value.enabled ? 'enabled' : 'disabled',
        revision: value.revision,
      });
    },
    [`GET ${base}/credentials`]: async (context) => {
      operator(context, 'admin');
      query(context, noQuery);
      const { projectId, environmentId } = await scope(pool, context);
      const result = await pool.query<CredentialRow>(
        `SELECT id, name, project_id, environment_id, created_at, revoked_at
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
        (id, organization_id, project_id, environment_id, name, token_hash) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id, name, project_id, environment_id, created_at, revoked_at`,
        [
          randomUUID(),
          actor.organizationId,
          projectId,
          environmentId,
          input.name,
          createHash('sha256').update(token).digest('hex'),
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
