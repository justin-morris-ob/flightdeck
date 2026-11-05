import type { Pool } from 'pg';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activitySchema,
  credentialsSchema,
  evaluationSchema,
  flagSchema,
  flagsSchema,
  issuedCredentialSchema,
  projectsSchema,
  previewSchema,
  type Flag,
  type Principal,
  type Routes,
} from '../shared/contracts.ts';
import {
  localEnvironments,
  localOperators,
  localOrganizations,
  localProjects,
} from '../shared/fixtures.ts';
import {
  catalogActivitySchema,
  catalogSchema,
  configurationInput,
  defaultConfiguration,
  overridesSchema,
  type ConfigurationInput,
  type EvaluationContext,
} from '../shared/targeting.ts';
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
  allowedTenantIds: ['local-tenant'],
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));
    await owner.query(`TRUNCATE flightdeck.subject_overrides, flightdeck.project_targeting_audit,
      flightdeck.project_targeting, flightdeck.audit, flightdeck.configurations, flightdeck.flags,
      flightdeck.credentials, flightdeck.environments, flightdeck.projects, flightdeck.organizations`);
    await seedDatabase(migrationUrl!, token);
  });
  afterEach(() => vi.useRealTimers());

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
      body:
        options.body ??
        (route.includes('/evaluate/')
          ? { context: { tenantId: 'local-tenant', attributes: {} } }
          : undefined),
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
  async function evaluate(env = environmentId, context: EvaluationContext = { attributes: {} }) {
    return evaluationSchema.parse(
      await invoke(`POST ${base}/evaluate/:flagKey`, {
        params: { environmentId: env },
        body: { context },
      })
    );
  }
  async function catalog() {
    return catalogSchema.parse(await invoke(`GET ${base}/catalog`));
  }
  async function publish(
    current: Flag,
    configuration: ConfigurationInput,
    expectedCatalogRevision = 1
  ) {
    return flagSchema.parse(
      await invoke(`PUT ${base}/flags/:flagKey/configuration`, {
        params: { environmentId: current.environmentId, flagKey: current.key },
        body: { expectedRevision: current.revision, expectedCatalogRevision, configuration },
      })
    );
  }
  async function addOverride(
    current: Flag,
    options: {
      tenantId?: string;
      subjectId?: string;
      expiresAt?: string;
      outcome?:
        | { kind: 'value'; value: { type: 'boolean'; value: boolean } }
        | { kind: 'variant'; variantId: string };
    } = {}
  ) {
    return flagSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/overrides`, {
        params: { environmentId: current.environmentId, flagKey: current.key },
        body: {
          expectedRevision: current.revision,
          override: {
            tenantId: options.tenantId ?? 'local-tenant',
            subjectId: options.subjectId ?? 'subject-1',
            owner: 'Customer enablement',
            reason: 'Synthetic temporary enablement',
            expiresAt: options.expiresAt ?? '2035-02-01T00:00:00.000Z',
            outcome: options.outcome ?? { kind: 'value', value: { type: 'boolean', value: true } },
          },
        },
      })
    );
  }
  async function listOverrides(env = environmentId, query = '') {
    return overridesSchema.parse(
      await invoke(`GET ${base}/flags/:flagKey/overrides`, {
        params: { environmentId: env },
        query,
      })
    );
  }
  const subject: EvaluationContext = {
    tenantId: 'local-tenant',
    subjectId: 'subject-1',
    attributes: {},
  };
  const segmentId = '71000000-0000-4000-8000-000000000001';
  const ruleId = '72000000-0000-4000-8000-000000000001';

  it('pins typed catalog definitions and segment snapshots without propagating catalog edits or other environments', async () => {
    const created = await create();
    const production = flagSchema.parse(
      await invoke(`GET ${base}/flags/:flagKey`, { params: { environmentId: productionId } })
    );
    expect(created.configuration.allocationNamespace).not.toBe(
      production.configuration.allocationNamespace
    );
    expect(await catalog()).toMatchObject({ revision: 1, attributes: [], segments: [] });
    const initial = catalogSchema.parse(
      await invoke(`PUT ${base}/catalog`, {
        body: {
          expectedRevision: 1,
          catalog: {
            attributes: [{ key: 'seats', type: 'number', description: 'Synthetic seats' }],
            segments: [
              {
                id: segmentId,
                key: 'large',
                name: 'Large accounts',
                conditions: [{ attribute: 'seats', operator: 'gte', values: [10] }],
              },
            ],
          },
        },
      })
    );
    const enabled = await update({ expectedRevision: created.revision, enabled: true });
    const configuration: ConfigurationInput = {
      ...configurationInput(enabled.configuration),
      offValue: { type: 'string', value: 'off' },
      defaultOutcome: { kind: 'value', value: { type: 'string', value: 'standard' } },
      rules: [
        {
          id: ruleId,
          name: 'Large tenant enablement',
          conditions: [{ attribute: 'tenantId', operator: 'eq', values: ['local-tenant'] }],
          segmentIds: [segmentId],
          rolloutBasisPoints: 10000,
          outcome: { kind: 'value', value: { type: 'string', value: 'large' } },
        },
      ],
    };
    const published = await publish(enabled, configuration, initial.revision);
    expect(published.configuration).toMatchObject({
      catalogRevision: 2,
      segments: [{ id: segmentId, revision: 1 }],
    });
    const context = { ...subject, attributes: { seats: 15 } };
    expect(await evaluate(environmentId, context)).toMatchObject({
      value: { type: 'string', value: 'large' },
      reason: 'rule',
      matchedRuleId: ruleId,
    });
    expect(await evaluate(environmentId, { ...context, tenantId: 'other' })).toMatchObject({
      value: { type: 'string', value: 'standard' },
      reason: 'default',
    });
    const edited = catalogSchema.parse(
      await invoke(`PUT ${base}/catalog`, {
        params: { environmentId: productionId },
        body: {
          expectedRevision: 2,
          catalog: {
            attributes: initial.attributes,
            segments: [
              {
                id: segmentId,
                key: 'large',
                name: 'Larger accounts',
                conditions: [{ attribute: 'seats', operator: 'gte', values: [20] }],
              },
            ],
          },
        },
      })
    );
    expect(edited.segments[0]!.revision).toBe(2);
    expect(await evaluate(environmentId, context)).toMatchObject({
      value: { type: 'string', value: 'large' },
      catalogRevision: 2,
    });
    await expect(publish(published, configuration, 2)).rejects.toMatchObject({ status: 409 });
    const refreshed = await publish(published, configuration, 3);
    expect(await evaluate(environmentId, context)).toMatchObject({
      value: { type: 'string', value: 'standard' },
      catalogRevision: 3,
    });
    expect(refreshed.configuration.segments[0]!.revision).toBe(2);
    const unchanged = flagSchema.parse(
      await invoke(`GET ${base}/flags/:flagKey`, { params: { environmentId: productionId } })
    );
    expect(unchanged.configuration).toEqual(production.configuration);
    expect(unchanged.enabled).toBe(false);
    const activity = catalogActivitySchema.parse(
      await invoke(`GET ${base}/catalog/activity`, { query: 'limit=1' })
    );
    expect(activity.items[0]).toMatchObject({
      revision: 3,
      actorId: administrator.id,
      previous: { revision: 2 },
    });
    expect(activity.nextCursor).toBe('3');
    const older = catalogActivitySchema.parse(
      await invoke(`GET ${base}/catalog/activity`, { query: 'limit=1&before=3' })
    );
    expect(older.items[0]!.revision).toBe(2);
    expect(older.nextCursor).toBeNull();
    await invoke(`PUT ${base}/catalog`, {
      body: {
        expectedRevision: 3,
        catalog: {
          attributes: [
            { key: 'seats', type: 'string', description: 'Now explicitly typed as a string' },
          ],
          segments: [
            {
              id: segmentId,
              key: 'large',
              name: 'Named tier',
              conditions: [{ attribute: 'seats', operator: 'eq', values: ['large'] }],
            },
          ],
        },
      },
    });
    expect(await evaluate(environmentId, { ...subject, attributes: { seats: 25 } })).toMatchObject({
      value: { type: 'string', value: 'large' },
      catalogRevision: 3,
    });
    await publish(refreshed, configuration, 4);
    expect(await evaluate(environmentId, { ...subject, attributes: { seats: 25 } })).toMatchObject({
      value: { type: 'string', value: 'standard' },
      catalogRevision: 4,
    });
    expect(
      await evaluate(environmentId, { ...subject, attributes: { seats: 'large' } })
    ).toMatchObject({ value: { type: 'string', value: 'large' }, catalogRevision: 4 });
  });

  it('serializes catalog revisions, validates operands and reserves historical segment identities', async () => {
    const input = {
      attributes: [{ key: 'tier', type: 'string', description: '' }],
      segments: [
        {
          id: segmentId,
          key: 'enterprise',
          name: 'Enterprise',
          conditions: [{ attribute: 'tier', operator: 'eq', values: ['enterprise'] }],
        },
      ],
    };
    const attempts = await Promise.allSettled([
      invoke(`PUT ${base}/catalog`, { body: { expectedRevision: 1, catalog: input } }),
      invoke(`PUT ${base}/catalog`, { body: { expectedRevision: 1, catalog: input } }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    for (const conditions of [
      [{ attribute: 'undeclared', operator: 'eq', values: ['enterprise'] }],
      [{ attribute: 'tier', operator: 'eq', values: [1] }],
      [{ attribute: 'tier', operator: 'gt', values: [1] }],
    ]) {
      await expect(
        invoke(`PUT ${base}/catalog`, {
          body: {
            expectedRevision: 2,
            catalog: { ...input, segments: [{ ...input.segments[0], conditions }] },
          },
        })
      ).rejects.toMatchObject({ status: 400 });
    }
    await invoke(`PUT ${base}/catalog`, {
      body: { expectedRevision: 2, catalog: { attributes: [], segments: [] } },
    });
    await expect(
      invoke(`PUT ${base}/catalog`, {
        body: {
          expectedRevision: 3,
          catalog: {
            ...input,
            segments: [{ ...input.segments[0], key: 'renamed_key' }],
          },
        },
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      invoke(`PUT ${base}/catalog`, {
        body: {
          expectedRevision: 3,
          catalog: {
            ...input,
            segments: [{ ...input.segments[0], id: '71000000-0000-4000-8000-000000000002' }],
          },
        },
      })
    ).rejects.toMatchObject({ status: 400 });
    const restored = catalogSchema.parse(
      await invoke(`PUT ${base}/catalog`, { body: { expectedRevision: 3, catalog: input } })
    );
    expect(restored.segments[0]!.revision).toBe(1);
    expect((await catalog()).revision).toBe(4);
  });

  it('enforces tenant grants before flag lookup and isolates exact override tuples and environments', async () => {
    let value = await create();
    value = await update({ expectedRevision: value.revision, enabled: true });
    value = await addOverride(value, {
      outcome: { kind: 'value', value: { type: 'boolean', value: false } },
    });
    expect(await evaluate(environmentId, subject)).toMatchObject({
      enabled: true,
      reason: 'override',
      value: { type: 'boolean', value: false },
    });
    for (const context of [
      { ...subject, tenantId: 'other' },
      { ...subject, subjectId: 'other' },
    ]) {
      expect(await evaluate(environmentId, context)).toMatchObject({
        reason: 'default',
        value: { type: 'boolean', value: true },
      });
    }
    expect(await evaluate(productionId, subject)).toMatchObject({ reason: 'disabled' });
    for (const context of [{ attributes: {} }, { ...subject, tenantId: 'not-granted' }]) {
      await expect(
        invoke(`POST ${base}/evaluate/:flagKey`, {
          principal: service,
          params: { flagKey: 'unknown' },
          body: { context },
        })
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      invoke(`POST ${base}/evaluate/:flagKey`, {
        principal: service,
        params: { flagKey: 'unknown' },
        body: { context: subject },
      })
    ).rejects.toMatchObject({ status: 404 });
    const permitted = evaluationSchema.parse(
      await invoke(`POST ${base}/evaluate/:flagKey`, {
        principal: service,
        body: { context: subject },
      })
    );
    expect(permitted).toEqual(await evaluate(environmentId, subject));
    expect(await listOverrides(productionId)).toEqual({ items: [], nextCursor: null });
    const item = (await listOverrides()).items[0]!;
    await expect(
      invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { environmentId: productionId, overrideId: item.id },
        body: { expectedRevision: value.revision },
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(routes[`GET ${base}/evaluate/:flagKey`]).toBeUndefined();
  });

  it('gives archive and environment disable priority and expires overrides at the exact boundary', async () => {
    let value = await create();
    value = await addOverride(value, { expiresAt: '2035-01-02T00:00:00.000Z' });
    expect(await evaluate(environmentId, subject)).toMatchObject({
      enabled: false,
      reason: 'disabled',
      value: { type: 'boolean', value: false },
    });
    value = await update({ expectedRevision: value.revision, enabled: true });
    expect(await evaluate(environmentId, subject)).toMatchObject({
      enabled: true,
      reason: 'override',
    });
    value = await update({ expectedRevision: value.revision, archived: true });
    expect(await evaluate(environmentId, subject)).toMatchObject({
      enabled: false,
      reason: 'archived',
    });
    value = await update({ expectedRevision: value.revision, archived: false });
    vi.setSystemTime(new Date('2035-01-02T00:00:00.000Z'));
    expect(await evaluate(environmentId, subject)).toMatchObject({
      reason: 'default',
      matchedOverrideId: null,
    });
    await expect(addOverride(value)).rejects.toMatchObject({ status: 409 });
    const item = (await listOverrides()).items[0]!;
    await expect(
      invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { overrideId: item.id },
        body: { expectedRevision: value.revision - 1 },
      })
    ).rejects.toMatchObject({ status: 409 });
    value = flagSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { overrideId: item.id },
        body: { expectedRevision: value.revision },
      })
    );
    expect((await listOverrides()).items[0]!.revokedAt).toEqual(expect.any(String));
    await expect(
      invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { overrideId: item.id },
        body: { expectedRevision: value.revision },
      })
    ).rejects.toMatchObject({ status: 409 });
    await addOverride(value);
    expect(await evaluate(environmentId, subject)).toMatchObject({ reason: 'override' });
    const history = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
    expect(history.items.find((entry) => entry.action === 'override_revoked')).toMatchObject({
      previous: { override: { id: item.id, revokedAt: null } },
      next: { override: { id: item.id, revokedAt: expect.any(String) } },
    });
  });

  it('uses one evaluator for read-only current and draft previews and preserves raw context privacy', async () => {
    let value = await create();
    value = await update({ expectedRevision: value.revision, enabled: true });
    const context = { ...subject, attributes: { privateAttribute: 'DO_NOT_STORE_CONTEXT' } };
    const currentPreview = previewSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/preview`, {
        principal: viewer,
        body: { context, expectedRevision: value.revision },
      })
    );
    expect(currentPreview).toEqual({
      current: await evaluate(environmentId, context),
      proposed: null,
      warnings: [],
      allocationChanged: false,
    });
    const proposedConfiguration: ConfigurationInput = {
      ...configurationInput(value.configuration),
      variants: [
        {
          id: 'control',
          name: 'Control',
          weightBasisPoints: 4000,
          value: { type: 'boolean', value: false },
        },
        {
          id: 'treatment',
          name: 'Treatment',
          weightBasisPoints: 6000,
          value: { type: 'boolean', value: true },
        },
      ],
      defaultOutcome: { kind: 'weighted' },
    };
    const before = await owner.query(
      'SELECT (SELECT count(*) FROM flightdeck.audit) AS audit, (SELECT count(*) FROM flightdeck.subject_overrides) AS overrides, (SELECT count(*) FROM flightdeck.project_targeting_audit) AS catalogs'
    );
    const preview = previewSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/preview`, {
        principal: viewer,
        body: {
          context,
          expectedRevision: value.revision,
          expectedCatalogRevision: 1,
          proposedConfiguration,
        },
      })
    );
    expect(preview.current).toEqual(currentPreview.current);
    expect(preview.proposed).toMatchObject({
      revision: value.revision + 1,
      enabled: true,
      variantId: expect.any(String),
    });
    expect(preview.allocationChanged).toBe(true);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(
      (
        await owner.query(
          'SELECT (SELECT count(*) FROM flightdeck.audit) AS audit, (SELECT count(*) FROM flightdeck.subject_overrides) AS overrides, (SELECT count(*) FROM flightdeck.project_targeting_audit) AS catalogs'
        )
      ).rows
    ).toEqual(before.rows);
    expect(flagSchema.parse(await invoke(`GET ${base}/flags/:flagKey`))).toEqual(value);
    const published = await publish(value, proposedConfiguration);
    expect(await evaluate(environmentId, context)).toEqual(preview.proposed);
    await expect(
      invoke(`POST ${base}/flags/:flagKey/preview`, {
        body: { context, expectedRevision: value.revision },
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      invoke(`POST ${base}/flags/:flagKey/preview`, {
        body: { context, expectedRevision: published.revision, proposedConfiguration },
      })
    ).rejects.toMatchObject({ status: 400 });
    const stored = await owner.query('SELECT previous, next FROM flightdeck.audit');
    expect(JSON.stringify(stored.rows)).not.toContain('DO_NOT_STORE_CONTEXT');
    expect(JSON.stringify(preview)).not.toContain('DO_NOT_STORE_CONTEXT');
  });

  it('rejects malformed weights, typed outcomes, namespace changes, references and oversized configurations atomically', async () => {
    const current = await create();
    const valid = configurationInput(current.configuration);
    const variant = {
      id: 'one',
      name: 'One',
      weightBasisPoints: 10000,
      value: { type: 'boolean', value: true },
    };
    for (const configuration of [
      { ...valid, allocationNamespace: 'changed' },
      { ...valid, defaultOutcome: { kind: 'value', value: { type: 'string', value: 'wrong' } } },
      { ...valid, variants: [{ ...variant, weightBasisPoints: 9999 }] },
      { ...valid, variants: [{ ...variant, weightBasisPoints: 1.5 }] },
      { ...valid, variants: [variant, variant] },
      { ...valid, variants: [{ ...variant, value: { type: 'number', value: 1 } }] },
      { ...valid, defaultOutcome: { kind: 'variant', variantId: 'missing' } },
      { ...valid, defaultOutcome: { kind: 'weighted' } },
      {
        ...valid,
        rules: [
          {
            id: ruleId,
            name: 'Missing segment',
            conditions: [],
            segmentIds: [segmentId],
            rolloutBasisPoints: 10000,
            outcome: valid.defaultOutcome,
          },
        ],
      },
      {
        ...valid,
        rules: [
          {
            id: ruleId,
            name: 'Unknown attribute',
            conditions: [{ attribute: 'unregistered', operator: 'eq', values: [true] }],
            segmentIds: [],
            rolloutBasisPoints: 10000,
            outcome: valid.defaultOutcome,
          },
        ],
      },
      { ...valid, offValue: { type: 'json', value: { oversized: 'x'.repeat(4097) } } },
      {
        ...valid,
        rules: Array.from({ length: 21 }, () => ({
          id: ruleId,
          name: 'Too many',
          conditions: [],
          segmentIds: [],
          rolloutBasisPoints: 10000,
          outcome: valid.defaultOutcome,
        })),
      },
    ]) {
      await expect(
        invoke(`PUT ${base}/flags/:flagKey/configuration`, {
          body: { expectedRevision: current.revision, expectedCatalogRevision: 1, configuration },
        })
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      addOverride(current, { expiresAt: '2035-01-01T00:00:00.000Z' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addOverride(current, { outcome: { kind: 'variant', variantId: 'missing' } })
    ).rejects.toMatchObject({ status: 400 });
    const published = await publish(current, valid);
    await expect(publish(current, valid)).rejects.toMatchObject({ status: 409 });
    await expect(addOverride(current)).rejects.toMatchObject({ status: 409 });
    expect(published.revision).toBe(2);
    expect(
      activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`)).items
    ).toHaveLength(2);
  });

  it('blocks configurations incompatible with any active override but permits expired or revoked overrides', async () => {
    let current = await create();
    const boolean = configurationInput(current.configuration);
    const variants: ConfigurationInput = {
      ...boolean,
      variants: [
        {
          id: 'one',
          name: 'One',
          weightBasisPoints: 10000,
          value: { type: 'boolean', value: true },
        },
      ],
    };
    current = await publish(current, variants);
    current = await addOverride(current, {
      tenantId: 'another-tenant',
      outcome: { kind: 'variant', variantId: 'one' },
      expiresAt: '2035-01-02T00:00:00.000Z',
    });
    await expect(publish(current, boolean)).rejects.toMatchObject({ status: 400 });
    vi.setSystemTime(new Date('2035-01-02T00:00:00.000Z'));
    current = await publish(current, boolean);
    current = await addOverride(current, { subjectId: 'another-subject' });
    const string: ConfigurationInput = {
      ...boolean,
      offValue: { type: 'string', value: 'off' },
      defaultOutcome: { kind: 'value', value: { type: 'string', value: 'on' } },
    };
    await expect(publish(current, string)).rejects.toMatchObject({ status: 400 });
    const item = (await listOverrides()).items.find(
      (entry) => entry.subjectId === 'another-subject'
    )!;
    current = flagSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { overrideId: item.id },
        body: { expectedRevision: current.revision },
      })
    );
    current = await publish(current, string);
    expect(current.configuration.offValue).toEqual({ type: 'string', value: 'off' });
  });

  it('bounds nonrevoked overrides and paginates persisted expired/revoked rows by stable UUID', async () => {
    const current = await create();
    await owner.query(
      `INSERT INTO flightdeck.subject_overrides
      (id, flag_id, project_id, environment_id, tenant_id, subject_id, owner, reason, outcome, expires_at)
      SELECT ('73000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, $1, $2, $3, 'local-tenant', 'subject-' || n, 'Test', 'Bounded synthetic entry', '{"kind":"value","value":{"type":"boolean","value":true}}'::jsonb, '2034-01-01'
      FROM generate_series(1,100) n`,
      [current.id, projectId, environmentId]
    );
    await expect(addOverride(current, { subjectId: 'new-subject' })).rejects.toMatchObject({
      status: 409,
    });
    const first = await listOverrides(environmentId, 'limit=60');
    expect(first.items).toHaveLength(60);
    expect(first.nextCursor).toBe(first.items.at(-1)!.id);
    const second = await listOverrides(environmentId, `limit=60&after=${first.nextCursor}`);
    expect(second.items).toHaveLength(40);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(100);
    const revoked = flagSchema.parse(
      await invoke(`POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`, {
        params: { overrideId: first.items[0]!.id },
        body: { expectedRevision: current.revision },
      })
    );
    await addOverride(revoked, { subjectId: 'new-subject' });
    await expect(listOverrides(environmentId, 'limit=101')).rejects.toMatchObject({ status: 400 });
  });

  it('rolls back override, configuration and catalog writes when their immutable audit append fails', async () => {
    const current = await create();
    await owner.query(
      "ALTER TABLE flightdeck.audit ADD CONSTRAINT test_targeting_audit_failure CHECK (action = 'created')"
    );
    try {
      await expect(addOverride(current)).rejects.toMatchObject({ code: '23514' });
      await expect(
        publish(current, configurationInput(current.configuration))
      ).rejects.toMatchObject({ code: '23514' });
      expect((await listOverrides()).items).toEqual([]);
      expect(flagSchema.parse(await invoke(`GET ${base}/flags/:flagKey`))).toEqual(current);
    } finally {
      await owner.query(
        'ALTER TABLE flightdeck.audit DROP CONSTRAINT test_targeting_audit_failure'
      );
    }
    await owner.query(
      'ALTER TABLE flightdeck.project_targeting_audit ADD CONSTRAINT test_catalog_audit_failure CHECK (revision < 2)'
    );
    try {
      await expect(
        invoke(`PUT ${base}/catalog`, {
          body: { expectedRevision: 1, catalog: { attributes: [], segments: [] } },
        })
      ).rejects.toMatchObject({ code: '23514' });
      expect((await catalog()).revision).toBe(1);
    } finally {
      await owner.query(
        'ALTER TABLE flightdeck.project_targeting_audit DROP CONSTRAINT test_catalog_audit_failure'
      );
    }
  });

  it('preserves real Stage 1 state and historical snapshots while applying the new checksummed migration', async () => {
    const initialSql = await readFile(
      new URL('../migrations/001-initial.sql', import.meta.url),
      'utf8'
    );
    const checksum = createHash('sha256').update(initialSql).digest('hex');
    const flagId = '74000000-0000-4000-8000-000000000001';
    const oldSnapshot = {
      name: 'Existing',
      description: 'Preserve me',
      owner: 'Existing owner',
      archived: false,
      enabled: true,
    };
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      // beforeAll verified both identities and the same disposable *_test database.
      await client.query('DROP SCHEMA flightdeck CASCADE');
      await client.query(initialSql);
      await client.query(
        'CREATE TABLE flightdeck.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())'
      );
      await client.query(
        'INSERT INTO flightdeck.schema_migrations (name, checksum) VALUES ($1,$2)',
        ['001-initial.sql', checksum]
      );
      await client.query('INSERT INTO flightdeck.organizations (id, name) VALUES ($1,$2)', [
        localOrganizations[0]!.id,
        'Existing org',
      ]);
      await client.query(
        'INSERT INTO flightdeck.projects (id, organization_id, key, name) VALUES ($1,$2,$3,$4)',
        [projectId, localOrganizations[0]!.id, 'existing', 'Existing project']
      );
      for (const [id, key] of [
        [environmentId, 'development'],
        [productionId, 'production'],
      ]) {
        await client.query(
          'INSERT INTO flightdeck.environments (id, project_id, key, name) VALUES ($1,$2,$3,$3)',
          [id, projectId, key]
        );
      }
      await client.query(
        "INSERT INTO flightdeck.flags (id, project_id, key, name, description, owner, revision) VALUES ($1,$2,'sample','Existing','Preserve me','Existing owner',7)",
        [flagId, projectId]
      );
      await client.query(
        'INSERT INTO flightdeck.configurations (flag_id, project_id, environment_id, enabled) VALUES ($1,$2,$3,true),($1,$2,$4,false)',
        [flagId, projectId, environmentId, productionId]
      );
      await client.query(
        "INSERT INTO flightdeck.audit (id, flag_id, environment_id, project_id, actor_id, actor_name, action, revision, next) VALUES ($1,$2,$3,$4,'existing','Existing actor','enabled',7,$5)",
        [
          '75000000-0000-4000-8000-000000000001',
          flagId,
          environmentId,
          projectId,
          JSON.stringify(oldSnapshot),
        ]
      );
      await client.query(
        "INSERT INTO flightdeck.credentials (id, organization_id, project_id, environment_id, name, token_hash) VALUES ($1,$2,$3,$4,'Existing credential',$5)",
        [
          '40000000-0000-4000-8000-000000000001',
          localOrganizations[0]!.id,
          projectId,
          environmentId,
          createHash('sha256').update(token).digest('hex'),
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await migrate(migrationUrl!);
    const value = flagSchema.parse(await invoke(`GET ${base}/flags/:flagKey`));
    expect(value).toMatchObject({
      id: flagId,
      revision: 7,
      enabled: true,
      name: 'Existing',
      description: 'Preserve me',
      owner: 'Existing owner',
    });
    expect(value.configuration).toEqual(
      defaultConfiguration(value.configuration.allocationNamespace)
    );
    expect(await evaluate()).toMatchObject({
      value: { type: 'boolean', value: true },
      revision: 7,
    });
    expect(await evaluate(productionId)).toMatchObject({
      value: { type: 'boolean', value: false },
      revision: 7,
    });
    const oldAudit = activitySchema.parse(await invoke(`GET ${base}/flags/:flagKey/activity`));
    expect(oldAudit.items[0]!.next).toEqual(oldSnapshot);
    const granted = credentialsSchema.parse(await invoke(`GET ${base}/credentials`));
    expect(granted.items[0]!.allowedTenantIds).toEqual(['local-tenant']);
    const firstNamespace = value.configuration.allocationNamespace;
    await migrate(migrationUrl!);
    expect(
      flagSchema.parse(await invoke(`GET ${base}/flags/:flagKey`)).configuration.allocationNamespace
    ).toBe(firstNamespace);
    expect((await catalog()).revision).toBe(1);
    expect(
      (
        await owner.query('SELECT checksum FROM flightdeck.schema_migrations WHERE name = $1', [
          '001-initial.sql',
        ])
      ).rows[0]!.checksum
    ).toBe(checksum);
    await owner.query('UPDATE flightdeck.schema_migrations SET checksum = $1 WHERE name = $2', [
      '0'.repeat(64),
      '001-initial.sql',
    ]);
    try {
      await expect(migrate(migrationUrl!)).rejects.toThrow(
        'Migration checksum mismatch: 001-initial.sql'
      );
    } finally {
      await owner.query('UPDATE flightdeck.schema_migrations SET checksum = $1 WHERE name = $2', [
        checksum,
        '001-initial.sql',
      ]);
    }
  });

  it('keeps new mutation routes editor-only and requires explicit bounded unique tenant grants', async () => {
    await create();
    for (const route of [
      `PUT ${base}/catalog`,
      `PUT ${base}/flags/:flagKey/configuration`,
      `POST ${base}/flags/:flagKey/overrides`,
      `POST ${base}/flags/:flagKey/overrides/:overrideId/revoke`,
    ]) {
      await expect(invoke(route, { principal: viewer })).rejects.toMatchObject({ status: 403 });
    }
    for (const body of [
      { name: 'Missing grants' },
      { name: 'Empty', allowedTenantIds: [] },
      { name: 'Duplicates', allowedTenantIds: ['tenant', 'tenant'] },
      {
        name: 'Too many',
        allowedTenantIds: Array.from({ length: 21 }, (_, index) => `tenant-${index}`),
      },
    ]) {
      await expect(invoke(`POST ${base}/credentials`, { body })).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(credentialsSchema.parse(await invoke(`GET ${base}/credentials`)).items).toHaveLength(1);
  });

  it('creates disabled configurations in every environment and persists scoped changes with project-wide revisions', async () => {
    const created = await create();
    expect(created).toMatchObject({ revision: 1, enabled: false, archived: false });
    expect(await evaluate()).toMatchObject({
      value: { type: 'boolean', value: false },
      reason: 'disabled',
      revision: 1,
    });
    expect(await evaluate(productionId)).toMatchObject({
      value: { type: 'boolean', value: false },
      reason: 'disabled',
      revision: 1,
    });
    const changed = await update({ expectedRevision: 1, enabled: true, name: 'Renamed' });
    expect(changed).toMatchObject({ revision: 2, enabled: true, name: 'Renamed' });
    expect(await evaluate()).toMatchObject({
      value: { type: 'boolean', value: true },
      reason: 'default',
      revision: 2,
    });
    expect(await evaluate(productionId)).toMatchObject({
      value: { type: 'boolean', value: false },
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
      expect(await evaluate()).toMatchObject({
        value: { type: 'boolean', value: false },
        revision: 1,
      });
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
    expect(await evaluate()).toMatchObject({
      value: { type: 'boolean', value: false },
      reason: 'archived',
      revision: 3,
    });
    expect(await evaluate(productionId)).toMatchObject({
      value: { type: 'boolean', value: false },
      reason: 'archived',
      revision: 3,
    });
    await expect(update({ expectedRevision: 3, enabled: true })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      invoke(`POST ${base}/evaluate/:flagKey`, { params: { flagKey: 'unknown' } })
    ).rejects.toMatchObject({ status: 404 });
    await update({ expectedRevision: 3, archived: false });
    expect(await evaluate()).toMatchObject({
      value: { type: 'boolean', value: true },
      reason: 'default',
      revision: 4,
    });
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
      evaluationSchema.parse(await invoke(`POST ${base}/evaluate/:flagKey`, { principal: service }))
        .value
    ).toEqual({ type: 'boolean', value: true });
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
      invoke(`POST ${base}/evaluate/:flagKey`, {
        principal: service,
        params: { environmentId: productionId },
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      invoke(`POST ${base}/evaluate/:flagKey`, {
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
      await invoke(`POST ${base}/credentials`, {
        body: { name: 'Consumer test', allowedTenantIds: ['tenant-a', 'tenant-b'] },
      })
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
    const migrations = await owner.query(
      'SELECT name, checksum FROM flightdeck.schema_migrations ORDER BY name'
    );
    expect(migrations.rows).toEqual([
      { name: '001-initial.sql', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { name: '002-targeting.sql', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
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
      'UPDATE flightdeck.project_targeting_audit SET actor_name = actor_name',
      'DELETE FROM flightdeck.project_targeting_audit',
      'DELETE FROM flightdeck.subject_overrides',
      'UPDATE flightdeck.subject_overrides SET reason = reason',
      'ALTER TABLE flightdeck.flags ADD COLUMN forbidden text',
    ]) {
      await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(
      runtime.query(
        `INSERT INTO flightdeck.configurations (flag_id, environment_id, project_id, enabled, configuration)
      VALUES ($1, $2, $3, false, $4)`,
        [
          value.id,
          localEnvironments[2]!.id,
          projectId,
          JSON.stringify(defaultConfiguration('test-cross-scope')),
        ]
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
    await expect(
      runtime.query(
        `INSERT INTO flightdeck.subject_overrides
      (id, flag_id, project_id, environment_id, tenant_id, subject_id, owner, reason, outcome, expires_at)
      VALUES ($1,$2,$3,$4,'local-tenant','subject-1','Test','Invalid scope',$5,'2035-02-01')`,
        [
          '76000000-0000-4000-8000-000000000001',
          value.id,
          projectId,
          localEnvironments[2]!.id,
          JSON.stringify({ kind: 'value', value: { type: 'boolean', value: true } }),
        ]
      )
    ).rejects.toMatchObject({ code: '23503' });
    expect((await evaluate()).revision).toBe(1);
  });
});
