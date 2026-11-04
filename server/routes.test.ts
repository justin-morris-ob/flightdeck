import type { Pool } from 'pg';

import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  activitySchema,
  credentialsSchema,
  evaluationSchema,
  flagSchema,
  flagsSchema,
  issuedCredentialSchema,
  projectsSchema,
  type Principal,
  type Routes,
} from '../shared/contracts.ts';
import {
  localEnvironments,
  localOperators,
  localOrganizations,
  localProjects,
} from '../shared/fixtures.ts';
import { connectDatabase, migrate, seedDatabase } from './database.ts';
import { createRoutes } from './routes.ts';

const runtimeUrl = process.env.FLIGHTDECK_TEST_DATABASE_URL;
const migrationUrl = process.env.FLIGHTDECK_TEST_MIGRATION_DATABASE_URL;
const token = `fd_${'1'.repeat(64)}`;
const base = '/api/v1/projects/:projectId/environments/:environmentId';
const administrator = localOperators[0]!;
const editor = localOperators[1]!;
const viewer = localOperators[2]!;
const outsider = localOperators[3]!;
const projectId = localProjects[0]!.id;
const environmentId = localEnvironments[0]!.id;
const productionId = localEnvironments[1]!.id;
const service: Principal = {
  kind: 'service',
  id: 'test-service',
  organizationId: localOrganizations[0]!.id,
  projectId,
  environmentId,
};

if (!runtimeUrl || !migrationUrl)
  throw new Error('Run pnpm db:setup, then pnpm test to exercise the real test database');

describe('PostgreSQL routes and storage', () => {
  let owner: Pool;
  let runtime: Pool;
  let routes: Routes;
  beforeAll(async () => {
    owner = connectDatabase(migrationUrl!);
    runtime = connectDatabase(runtimeUrl!);
    const ownerIdentity = await owner.query<{ database: string; role: string }>(
      'SELECT current_database() AS database, current_user AS role'
    );
    const runtimeIdentity = await runtime.query<{ database: string; role: string }>(
      'SELECT current_database() AS database, current_user AS role'
    );
    const database = ownerIdentity.rows[0]!.database;
    if (!database.endsWith('_test') || database !== runtimeIdentity.rows[0]!.database) {
      throw new Error(
        'Refusing destructive fixture reset: both URLs must target the same *_test database'
      );
    }
    if (
      runtimeIdentity.rows[0]!.role !== 'flightdeck_runtime' ||
      ownerIdentity.rows[0]!.role === 'flightdeck_runtime'
    ) {
      throw new Error('Tests require separate owner and flightdeck_runtime identities');
    }
    const ownerUrl = new URL(migrationUrl!);
    const appUrl = new URL(runtimeUrl!);
    if (ownerUrl.hostname !== appUrl.hostname || ownerUrl.port !== appUrl.port) {
      throw new Error('Owner and runtime URLs must target the same PostgreSQL server');
    }
    await migrate(migrationUrl!);
    routes = createRoutes(runtime);
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
  });
  beforeEach(async () => {
    await owner.query(`TRUNCATE flightdeck.audit, flightdeck.configurations, flightdeck.flags,
      flightdeck.credentials, flightdeck.environments, flightdeck.projects, flightdeck.organizations`);
    await seedDatabase(migrationUrl!, token);
  });

  function invoke(
    route: string,
    options: {
      principal?: Principal;
      params?: Record<string, string>;
      query?: string;
      body?: unknown;
    } = {}
  ) {
    return routes[route]!({
      principal: options.principal ?? administrator,
      params: { projectId, environmentId, flagKey: 'sample', ...options.params },
      query: new URLSearchParams(options.query),
      body: options.body,
    });
  }
  async function create(key = 'sample') {
    return flagSchema.parse(
      await invoke(`POST ${base}/flags`, {
        body: {
          key,
          name: `Flag ${key}`,
          description: 'Synthetic configuration',
          owner: 'Enablements',
        },
      })
    );
  }
  async function update(body: unknown, env = environmentId) {
    return flagSchema.parse(
      await invoke(`PATCH ${base}/flags/:flagKey`, { body, params: { environmentId: env } })
    );
  }
  async function evaluate(env = environmentId) {
    return evaluationSchema.parse(
      await invoke(`GET ${base}/evaluate/:flagKey`, { params: { environmentId: env } })
    );
  }

  it('creates disabled configurations in every environment and persists scoped changes with project-wide revisions', async () => {
    const created = await create();
    expect(created).toMatchObject({ revision: 1, enabled: false, archived: false });
    expect(await evaluate()).toMatchObject({ value: false, reason: 'disabled', revision: 1 });
    expect(await evaluate(productionId)).toMatchObject({
      value: false,
      reason: 'disabled',
      revision: 1,
    });
    const changed = await update({ expectedRevision: 1, enabled: true, name: 'Renamed' });
    expect(changed).toMatchObject({ revision: 2, enabled: true, name: 'Renamed' });
    expect(await evaluate()).toMatchObject({ value: true, reason: 'enabled', revision: 2 });
    expect(await evaluate(productionId)).toMatchObject({
      value: false,
      reason: 'disabled',
      revision: 2,
    });
    const freshPool = connectDatabase(runtimeUrl!);
    try {
      const restartedRoutes = createRoutes(freshPool);
      const persisted = await restartedRoutes[`GET ${base}/flags/:flagKey`]!({
        principal: viewer,
        params: { projectId, environmentId, flagKey: 'sample' },
        query: new URLSearchParams(),
        body: undefined,
      });
      expect(flagSchema.parse(persisted)).toEqual(changed);
    } finally {
      await freshPool.end();
    }
    const activity = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
    expect(activity.items.map((entry) => [entry.revision, entry.action])).toEqual([
      [2, 'enabled'],
      [1, 'created'],
    ]);
    expect(activity.items[0]).toMatchObject({
      actorId: administrator.id,
      previous: { enabled: false },
      next: { enabled: true },
    });
    expect(activity.items[1]!.previous).toBeNull();
  });

  it('allows exactly one concurrent writer and records no losing audit revision', async () => {
    await create();
    const attempts = await Promise.allSettled([
      update({ expectedRevision: 1, enabled: true }),
      update({ expectedRevision: 1, owner: 'Competing owner' }, productionId),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({
      status: 409,
    });
    const activity = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
    expect(activity.items.map((entry) => entry.revision)).toEqual([2, 1]);
    expect((await evaluate()).revision).toBe(2);
  });

  it('rolls back both configuration and revision when the audit insert fails', async () => {
    await create();
    await owner.query(
      "ALTER TABLE flightdeck.audit ADD CONSTRAINT test_reject_updated CHECK (action = 'created')"
    );
    try {
      await expect(update({ expectedRevision: 1, enabled: true })).rejects.toMatchObject({
        code: '23514',
      });
      expect(await evaluate()).toMatchObject({ value: false, revision: 1 });
      const history = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
      expect(history.items).toHaveLength(1);
    } finally {
      await owner.query('ALTER TABLE flightdeck.audit DROP CONSTRAINT test_reject_updated');
    }
  });

  it('distinguishes archived evaluations from unknown flags and retains configuration on restore', async () => {
    await create();
    await update({ expectedRevision: 1, enabled: true });
    await expect(
      update({ expectedRevision: 2, archived: true, enabled: true })
    ).rejects.toMatchObject({ status: 400 });
    const archived = await update({ expectedRevision: 2, archived: true });
    expect(archived).toMatchObject({ enabled: true, archived: true, revision: 3 });
    expect(await evaluate()).toMatchObject({ value: false, reason: 'archived', revision: 3 });
    expect(await evaluate(productionId)).toMatchObject({
      value: false,
      reason: 'archived',
      revision: 3,
    });
    await expect(update({ expectedRevision: 3, enabled: true })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      invoke(`GET ${base}/evaluate/:flagKey`, { params: { flagKey: 'unknown' } })
    ).rejects.toMatchObject({ status: 404 });
    await update({ expectedRevision: 3, archived: false });
    expect(await evaluate()).toMatchObject({ value: true, reason: 'enabled', revision: 4 });
  });

  it('rejects duplicate keys and keeps keys immutable across updates', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({ status: 409 });
    await expect(update({ expectedRevision: 1, key: 'renamed' })).rejects.toMatchObject({
      status: 400,
    });
    expect((await evaluate()).revision).toBe(1);
    const history = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
    expect(history.items).toHaveLength(1);
  });

  it('enforces viewer/editor/administrator and operator/service boundaries on every route', async () => {
    await create();
    expect(
      projectsSchema.parse(await invoke('GET /api/v1/projects', { principal: viewer })).items
    ).toHaveLength(2);
    expect(
      flagSchema.parse(await invoke(`GET ${base}/flags/:flagKey`, { principal: viewer })).key
    ).toBe('sample');
    await expect(
      invoke(`POST ${base}/flags`, {
        principal: viewer,
        body: { key: 'denied', name: 'Denied', description: '', owner: 'Test' },
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invoke(`PATCH ${base}/flags/:flagKey`, {
        principal: viewer,
        body: { expectedRevision: 1, enabled: true },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(
      flagSchema.parse(
        await invoke(`PATCH ${base}/flags/:flagKey`, {
          principal: editor,
          body: { expectedRevision: 1, enabled: true },
        })
      ).revision
    ).toBe(2);
    for (const principal of [viewer, editor]) {
      for (const route of [
        `GET ${base}/credentials`,
        `POST ${base}/credentials`,
        `DELETE ${base}/credentials/:credentialId`,
      ]) {
        await expect(
          invoke(route, {
            principal,
            params: { credentialId: '40000000-0000-4000-8000-000000000001' },
            body: { name: 'Denied' },
          })
        ).rejects.toMatchObject({ status: 403 });
      }
    }
    for (const route of Object.keys(routes).filter((route) => !route.includes('/evaluate/'))) {
      await expect(invoke(route, { principal: service })).rejects.toMatchObject({ status: 403 });
    }
    expect(
      evaluationSchema.parse(await invoke(`GET ${base}/evaluate/:flagKey`, { principal: service }))
        .value
    ).toBe(true);
  });

  it('hides cross-organization and mismatched environment/project scopes without enumeration', async () => {
    await create();
    const foreignProjects = projectsSchema.parse(
      await invoke('GET /api/v1/projects', { principal: outsider })
    );
    expect(foreignProjects.items.map((project) => project.id)).toEqual([localProjects[2]!.id]);
    for (const route of Object.keys(routes).filter((route) => route.includes(':projectId'))) {
      await expect(invoke(route, { principal: outsider })).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      invoke(`GET ${base}/flags`, { params: { environmentId: localEnvironments[2]!.id } })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      invoke(`GET ${base}/evaluate/:flagKey`, {
        principal: service,
        params: { environmentId: productionId },
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invoke(`GET ${base}/evaluate/:flagKey`, {
        principal: service,
        params: { projectId: localProjects[1]!.id, environmentId: localEnvironments[2]!.id },
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('validates bounded queries and request bodies before accepting writes', async () => {
    await create();
    for (const invalid of [
      'limit=0',
      'limit=101',
      'limit=1.5',
      'archived=unknown',
      `search=${'a'.repeat(101)}`,
      'limit=1&limit=2',
      'unknown=value',
    ]) {
      await expect(invoke(`GET ${base}/flags`, { query: invalid })).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(
      invoke(`GET ${base}/flags`, { params: { projectId: 'invalid' } })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      invoke(`GET ${base}/flags/:flagKey`, { params: { flagKey: 'invalid/key' } })
    ).rejects.toMatchObject({ status: 400 });
    for (const body of [
      { expectedRevision: 1 },
      { expectedRevision: 0, enabled: true },
      { expectedRevision: 1, enabled: 'true' },
      { expectedRevision: 1, context: { arbitrary: true } },
    ]) {
      await expect(update(body)).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      invoke(`POST ${base}/flags`, {
        body: { key: 'invalid key', name: 'Bad', owner: 'Test', description: '' },
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      invoke(`GET ${base}/flags/:flagKey/activity`, { query: 'before=abc' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('paginates/searches inventory and project-wide audit by stable cursors', async () => {
    await create('alpha');
    await create('sample');
    await create('zulu');
    const first = flagsSchema.parse(await invoke(`GET ${base}/flags`, { query: 'limit=2' }));
    expect(first.items.map((entry) => entry.key)).toEqual(['alpha', 'sample']);
    expect(first.nextCursor).toBe('sample');
    const second = flagsSchema.parse(
      await invoke(`GET ${base}/flags`, { query: `limit=2&after=${first.nextCursor}` })
    );
    expect(second.items.map((entry) => entry.key)).toEqual(['zulu']);
    expect(second.nextCursor).toBeNull();
    expect(
      flagsSchema
        .parse(await invoke(`GET ${base}/flags`, { query: 'search=ALPHA' }))
        .items.map((entry) => entry.key)
    ).toEqual(['alpha']);
    expect(
      flagsSchema.parse(await invoke(`GET ${base}/flags`, { query: "search=' OR true --" })).items
    ).toEqual([]);
    await update({ expectedRevision: 1, enabled: true }, productionId);
    await update({ expectedRevision: 2, archived: true });
    expect(
      flagsSchema.parse(await invoke(`GET ${base}/flags`)).items.map((entry) => entry.key)
    ).toEqual(['alpha', 'zulu']);
    expect(
      flagsSchema
        .parse(await invoke(`GET ${base}/flags`, { query: 'archived=archived' }))
        .items.map((entry) => entry.key)
    ).toEqual(['sample']);
    expect(
      flagsSchema.parse(await invoke(`GET ${base}/flags`, { query: 'archived=all' })).items
    ).toHaveLength(3);
    const page = activitySchema.parse(
      await invoke(`GET ${base}/flags/:flagKey/activity`, { query: 'limit=2' })
    );
    expect(page.items.map((entry) => entry.revision)).toEqual([3, 2]);
    expect(page.items[1]!.environmentId).toBe(productionId);
    expect(page.nextCursor).toBe('2');
    const history = activitySchema.parse(
      await invoke(`GET ${base}/flags/:flagKey/activity`, {
        query: `before=${page.nextCursor}&limit=2`,
      })
    );
    expect(history.items.map((entry) => entry.revision)).toEqual([1]);
    expect(history.nextCursor).toBeNull();
  });

  it('persists only credential verifiers, returns secrets only at issuance and scopes revocation', async () => {
    const issued = issuedCredentialSchema.parse(
      await invoke(`POST ${base}/credentials`, { body: { name: 'Consumer test' } })
    );
    expect(issued.token).toMatch(/^fd_[a-f0-9]{64}$/);
    const stored = await owner.query<{ token_hash: string }>(
      'SELECT token_hash FROM flightdeck.credentials WHERE id = $1',
      [issued.credential.id]
    );
    expect(stored.rows[0]!.token_hash).toBe(
      createHash('sha256').update(issued.token).digest('hex')
    );
    const listed = credentialsSchema.parse(await invoke(`GET ${base}/credentials`));
    expect(listed.items.find((entry) => entry.id === issued.credential.id)).toEqual(
      issued.credential
    );
    expect(JSON.stringify(listed)).not.toContain(issued.token);
    expect(JSON.stringify(listed)).not.toContain(stored.rows[0]!.token_hash);
    await expect(
      invoke(`DELETE ${base}/credentials/:credentialId`, {
        params: { credentialId: issued.credential.id, environmentId: productionId },
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await invoke(`DELETE ${base}/credentials/:credentialId`, {
        params: { credentialId: issued.credential.id },
      })
    ).toBeUndefined();
    const revoked = credentialsSchema
      .parse(await invoke(`GET ${base}/credentials`))
      .items.find((entry) => entry.id === issued.credential.id)!;
    expect(revoked.revokedAt).not.toBeNull();
    const active = await runtime.query(
      'SELECT id FROM flightdeck.credentials WHERE id = $1 AND revoked_at IS NULL',
      [issued.credential.id]
    );
    expect(active.rowCount).toBe(0);
    await invoke(`DELETE ${base}/credentials/:credentialId`, {
      params: { credentialId: issued.credential.id },
    });
  });

  it('tracks repeatable migrations and idempotent synthetic seed without runtime migration access', async () => {
    await migrate(migrationUrl!);
    await seedDatabase(migrationUrl!, token);
    const migrations = await owner.query('SELECT name, checksum FROM flightdeck.schema_migrations');
    expect(migrations.rows).toHaveLength(1);
    expect(migrations.rows[0]).toMatchObject({
      name: '001-initial.sql',
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await owner.query('SELECT id FROM flightdeck.organizations')).rows).toHaveLength(2);
    const seeded = await owner.query<{ token_hash: string }>(
      'SELECT token_hash FROM flightdeck.credentials'
    );
    expect(seeded.rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);
    await expect(runtime.query('SELECT * FROM flightdeck.schema_migrations')).rejects.toMatchObject(
      { code: '42501' }
    );
  });

  it('denies runtime DDL and audit mutations, and enforces composite scope foreign keys', async () => {
    const value = await create();
    for (const sql of [
      'CREATE TABLE flightdeck.runtime_forbidden (id integer)',
      'CREATE SCHEMA runtime_forbidden',
      'UPDATE flightdeck.audit SET actor_name = actor_name',
      'DELETE FROM flightdeck.audit',
      'TRUNCATE flightdeck.audit',
      'ALTER TABLE flightdeck.flags ADD COLUMN forbidden text',
    ]) {
      await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(
      runtime.query(
        `INSERT INTO flightdeck.configurations (flag_id, environment_id, project_id, enabled)
      VALUES ($1, $2, $3, false)`,
        [value.id, localEnvironments[2]!.id, projectId]
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      runtime.query(
        `INSERT INTO flightdeck.credentials
      (id, organization_id, project_id, environment_id, name, token_hash)
      VALUES ($1,$2,$3,$4,'Cross scope',$5)`,
        [
          '50000000-0000-4000-8000-000000000001',
          localOrganizations[1]!.id,
          projectId,
          environmentId,
          'a'.repeat(64),
        ]
      )
    ).rejects.toMatchObject({ code: '23503' });
    expect((await evaluate()).revision).toBe(1);
  });
});
