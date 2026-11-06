import type { Flag, Principal, Routes } from '../shared/contracts.ts';
import type { Condition, ConfigurationInput } from '../shared/targeting.ts';
import type { Deployment, SegmentRecord } from '../shared/unified.ts';
import type { Pool } from 'pg';

import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { evaluationSchema, flagSchema, flagsSchema } from '../shared/contracts.ts';
import { directoryConditions } from '../shared/directory.ts';
import {
  localEnvironments,
  localOperators,
  localOrganizations,
  localProjects,
} from '../shared/fixtures.ts';
import {
  byteLength,
  catalogActivitySchema,
  catalogSchema,
  configurationInput,
} from '../shared/targeting.ts';
import {
  auditTrailSchema,
  deploymentSchema,
  segmentHistorySchema,
  segmentLibrarySchema,
  segmentRecordSchema,
} from '../shared/unified.ts';
import { connectDatabase, migrate, seedDatabase } from './database.ts';
import { defaultDeployment, loadDeployment } from './deployment.ts';
import { createRoutes } from './routes.ts';

const runtimeUrl = process.env.FLIGHTDECK_TEST_DATABASE_URL;
const migrationUrl = process.env.FLIGHTDECK_TEST_MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl) throw new Error('Run pnpm db:setup, then pnpm test');
const projectId = localProjects[0]!.id;
const environmentId = localEnvironments[0]!.id;
const productionId = localEnvironments[1]!.id;
const base = '/api/v1/projects/:projectId/environments/:environmentId';
const administrator = localOperators[0]!;
const viewer = localOperators[2]!;
const outsider = localOperators[3]!;
const token = `fd_${'a'.repeat(64)}`;
const production: Deployment = {
  ...defaultDeployment,
  environmentKey: 'production',
  environmentName: 'Production',
};
const service: Principal = {
  kind: 'service',
  id: 'unified-consumer',
  organizationId: localOrganizations[0]!.id,
  projectId,
  environmentId,
  allowedTenantIds: ['local-tenant'],
};

it('accepts only configured deployment authority and safe dashboard destinations', () => {
  expect(loadDeployment({})).toEqual(defaultDeployment);
  expect(
    loadDeployment({
      FLIGHTDECK_DASHBOARD_MODE: 'master',
      FLIGHTDECK_ENVIRONMENT_KEY: 'production',
      FLIGHTDECK_ENVIRONMENT_NAME: 'Production',
      FLIGHTDECK_DASHBOARD_LINKS:
        '{"production":"https://flags.example.test/path","development":"http://localhost:4721"}',
    })
  ).toMatchObject({ mode: 'master', environmentKey: 'production' });
  for (const env of [
    { FLIGHTDECK_DASHBOARD_MODE: 'remote' },
    { FLIGHTDECK_ENVIRONMENT_KEY: '../production' },
    { FLIGHTDECK_DASHBOARD_LINKS: '{' },
    { FLIGHTDECK_DASHBOARD_LINKS: '[]' },
    { FLIGHTDECK_DASHBOARD_LINKS: '{"production":"http://flags.example.test"}' },
    { FLIGHTDECK_DASHBOARD_LINKS: '{"production":"javascript:alert(1)"}' },
    { FLIGHTDECK_DASHBOARD_LINKS: '{"production":"https://secret:password@flags.example.test"}' },
  ])
    expect(() => loadDeployment(env)).toThrow();
  expect(
    deploymentSchema.safeParse({
      ...defaultDeployment,
      dashboards: { production: 'http://127.0.0.1:4721' },
    }).success
  ).toBe(true);
});

describe('unified local publication and historical truth', () => {
  let owner: Pool;
  let runtime: Pool;
  let routes: Routes;
  beforeAll(async () => {
    owner = connectDatabase(migrationUrl!);
    runtime = connectDatabase(runtimeUrl!);
    const identities = await Promise.all([
      owner.query('SELECT current_database() AS db,current_user AS role'),
      runtime.query('SELECT current_database() AS db,current_user AS role'),
    ]);
    const ownerIdentity = identities[0].rows[0]!;
    const runtimeIdentity = identities[1].rows[0]!;
    const ownerAddress = new URL(migrationUrl!);
    const runtimeAddress = new URL(runtimeUrl!);
    if (
      !ownerIdentity.db.endsWith('_test') ||
      ownerIdentity.db !== runtimeIdentity.db ||
      ownerIdentity.role === 'flightdeck_runtime' ||
      runtimeIdentity.role !== 'flightdeck_runtime' ||
      ownerAddress.hostname !== runtimeAddress.hostname ||
      ownerAddress.port !== runtimeAddress.port
    )
      throw new Error(
        'Refusing fixture resets outside one disposable *_test database with separate owner/runtime identities'
      );
    await migrate(migrationUrl!);
    routes = createRoutes(runtime);
  });
  beforeEach(async () => {
    await owner.query(`TRUNCATE flightdeck.environment_targeting,flightdeck.environment_targeting_audit,
      flightdeck.segments,flightdeck.segment_history,flightdeck.unified_audit,flightdeck.subject_overrides,
      flightdeck.project_targeting_audit,flightdeck.project_targeting,flightdeck.audit,flightdeck.configurations,
      flightdeck.flags,flightdeck.credentials,flightdeck.environments,flightdeck.projects,flightdeck.organizations`);
    await seedDatabase(migrationUrl!, token);
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
  });

  function invoke(
    route: string,
    body?: unknown,
    options: {
      params?: Record<string, string>;
      query?: string;
      principal?: Principal;
      deployment?: Deployment;
    } = {}
  ) {
    const selected = options.deployment
      ? createRoutes(runtime, undefined, options.deployment)
      : routes;
    return selected[route]!({
      principal: options.principal ?? administrator,
      params: { projectId, environmentId, flagKey: 'sample', ...options.params },
      query: new URLSearchParams(options.query),
      body,
    });
  }
  async function createFlag(
    key: string,
    lifecycle: Flag['lifecycle'] = 'development',
    deployment?: Deployment
  ) {
    return flagSchema.parse(
      await invoke(
        `POST ${base}/flags`,
        { key, name: `Flag ${key}`, description: '', owner: 'Team', lifecycle },
        deployment ? { deployment, params: { environmentId: productionId } } : {}
      )
    );
  }
  async function readFlag(key: string) {
    return flagSchema.parse(
      await invoke(`GET ${base}/flags/:flagKey`, undefined, { params: { flagKey: key } })
    );
  }
  async function patch(flag: Flag, changes: Record<string, unknown>) {
    return flagSchema.parse(
      await invoke(
        `PATCH ${base}/flags/:flagKey`,
        { expectedRevision: flag.revision, ...changes },
        { params: { flagKey: flag.key } }
      )
    );
  }
  async function createSegment(blocks: { conditions: Condition[] }[], key = 'audience') {
    return segmentRecordSchema.parse(
      await invoke(`POST ${base}/segments`, {
        key,
        name: 'Early access',
        description: 'Known members or matching traits',
        blocks,
      })
    );
  }
  async function currentSegment(id: string) {
    return segmentLibrarySchema
      .parse(await invoke(`GET ${base}/segments`))
      .items.find((item) => item.id === id)!;
  }
  async function saveDraft(segment: SegmentRecord, blocks: { conditions: Condition[] }[]) {
    return segmentRecordSchema.parse(
      await invoke(
        `PUT ${base}/segments/:segmentId/draft`,
        {
          expectedRevision: segment.revision,
          name: 'Early access',
          description: 'Updated draft',
          blocks,
        },
        { params: { segmentId: segment.id } }
      )
    );
  }
  async function publishSegment(segment: SegmentRecord) {
    return segmentRecordSchema.parse(
      await invoke(
        `POST ${base}/segments/:segmentId/publish`,
        { expectedRevision: segment.revision },
        { params: { segmentId: segment.id } }
      )
    );
  }
  async function publishFlag(
    flag: Flag,
    configuration: ConfigurationInput,
    expectedCatalogRevision?: number
  ) {
    const catalog = catalogSchema.parse(await invoke(`GET ${base}/catalog`));
    return flagSchema.parse(
      await invoke(
        `PUT ${base}/flags/:flagKey/configuration`,
        {
          expectedRevision: flag.revision,
          expectedCatalogRevision: expectedCatalogRevision ?? catalog.revision,
          configuration,
        },
        { params: { flagKey: flag.key } }
      )
    );
  }
  function following(flag: Flag, id: string): ConfigurationInput {
    return {
      ...configurationInput(flag.configuration),
      defaultOutcome: { kind: 'value', value: { type: 'boolean', value: false } },
      rules: [
        {
          id: randomUUID(),
          name: 'Following audience',
          conditions: [],
          segmentIds: [id],
          rolloutBasisPoints: 10000,
          outcome: { kind: 'value', value: { type: 'boolean', value: true } },
        },
      ],
    };
  }
  async function evaluate(
    key: string,
    attributes: Record<string, string | number | boolean | string[]>,
    subjectId = 'unrelated-person'
  ) {
    return evaluationSchema.parse(
      await invoke(
        `POST ${base}/evaluate/:flagKey`,
        { context: { tenantId: 'local-tenant', subjectId, attributes } },
        { principal: service, params: { flagKey: key } }
      )
    );
  }

  it('enforces every operator mutation at local scope and denies master/viewer writes before resource mutation', async () => {
    const flag = await createFlag('sample');
    const writes = Object.keys(routes).filter(
      (route) =>
        !route.startsWith('GET ') &&
        !route.includes('/evaluate/') &&
        !route.endsWith('/preview') &&
        !route.endsWith('/directory/resolve')
    );
    for (const route of writes) {
      for (const options of [
        { params: { environmentId: productionId } },
        { deployment: { ...defaultDeployment, mode: 'master' as const } },
        { principal: viewer },
      ])
        await expect(
          invoke(
            route,
            {},
            {
              ...options,
              params: {
                segmentId: randomUUID(),
                credentialId: randomUUID(),
                overrideId: randomUUID(),
                ...options.params,
              },
            }
          )
        ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      invoke('GET /api/v1/deployment', undefined, {
        query: 'mode=master&environmentKey=production',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(await invoke('GET /api/v1/deployment')).toEqual(defaultDeployment);
    for (const route of [`GET ${base}/audit`, `GET ${base}/segments`]) {
      await expect(invoke(route, undefined, { principal: outsider })).rejects.toMatchObject({
        status: 404,
      });
      await expect(invoke(route, undefined, { principal: service })).rejects.toMatchObject({
        status: 403,
      });
    }
    expect(await readFlag('sample')).toEqual(flag);
    expect(auditTrailSchema.parse(await invoke(`GET ${base}/audit`)).items).toHaveLength(1);
    expect(catalogSchema.parse(await invoke(`GET ${base}/catalog`)).revision).toBe(1);
  });

  it('creates only locally and filters actual local metadata before stable inventory pagination', async () => {
    const initial = await createFlag('a_temporary');
    const local = await createFlag('z_system', 'system');
    await createFlag('production_only', 'permissions', production);
    const peer = await createFlag('z_system', 'permissions', production);
    expect(peer.id).toBe(local.id);
    await patch(local, {
      name: 'Local service control',
      owner: 'Local owner',
      lifecycle: 'release',
      archived: true,
    });
    const lifecycle = flagsSchema.parse(
      await invoke(`GET ${base}/flags`, undefined, { query: 'lifecycle=development&limit=1' })
    );
    expect(lifecycle.items.map((item) => item.key)).toEqual(['a_temporary']);
    const longLived = flagsSchema.parse(
      await invoke(`GET ${base}/flags`, undefined, {
        query: 'longevity=long-lived&archived=all&limit=1',
      })
    );
    expect(longLived.items).toEqual([]);
    const archived = flagsSchema.parse(
      await invoke(`GET ${base}/flags`, undefined, {
        query: 'lifecycle=release&archived=archived&search=Local%20owner&limit=1',
      })
    );
    expect(archived.items.map((item) => item.key)).toEqual(['z_system']);
    expect(archived.items[0]!.environments).toEqual([
      expect.objectContaining({
        environmentId,
        lifecycle: 'release',
        archived: true,
        name: 'Local service control',
        valueType: 'boolean',
        audienceSummary: 'Everyone',
        configurationSummary: expect.stringContaining('Gate Off → false'),
      }),
    ]);
    const all = flagsSchema.parse(
      await invoke('GET /api/v1/projects/:projectId/flags', undefined, { query: 'archived=all' })
    );
    expect(all.items.find((item) => item.key === 'production_only')!.environments).toEqual([
      expect.objectContaining({ environmentId: productionId }),
    ]);
    expect(all.items.find((item) => item.key === 'a_temporary')!.environments).toHaveLength(1);
    expect(
      flagSchema.parse(
        await invoke(`GET ${base}/flags/:flagKey`, undefined, {
          params: { flagKey: 'z_system', environmentId: productionId },
        })
      )
    ).toEqual(peer);
    expect(await readFlag('a_temporary')).toEqual(initial);
  });

  it('publishes OR blocks once for every local following reference while Off gates, direct selections, revisions and old snapshots stay unchanged', async () => {
    const catalog = catalogSchema.parse(
      await invoke(`PUT ${base}/catalog`, {
        expectedRevision: 1,
        catalog: {
          attributes: [
            { key: 'email', type: 'string', description: '' },
            { key: 'tier', type: 'string', description: '' },
          ],
        },
      })
    );
    const oldBlocks: { conditions: Condition[] }[] = [
      { conditions: [{ attribute: 'subjectId', operator: 'in', values: ['known-person'] }] },
    ];
    let segment = await createSegment(oldBlocks);
    expect(segment.published).toBeNull();
    const onCreated = await createFlag('on_flag');
    await expect(
      publishFlag(onCreated, following(onCreated, segment.id), catalog.revision)
    ).rejects.toMatchObject({ status: 400 });
    segment = await publishSegment(segment);
    let on = await publishFlag(onCreated, following(onCreated, segment.id));
    on = await patch(on, { enabled: true });
    const offCreated = await createFlag('off_flag');
    let off = await publishFlag(offCreated, following(offCreated, segment.id));
    const direct = {
      id: randomUUID(),
      name: 'Direct person',
      conditions: [{ attribute: 'subjectId', operator: 'in' as const, values: ['direct-person'] }],
      segmentIds: [],
      rolloutBasisPoints: 10000,
      outcome: { kind: 'value' as const, value: { type: 'boolean' as const, value: true } },
    };
    off = await publishFlag(off, {
      ...configurationInput(off.configuration),
      rules: [...off.configuration.rules, direct],
    });
    const rawBefore = await owner.query(
      'SELECT flag_id,enabled,revision,configuration FROM flightdeck.configurations ORDER BY flag_id'
    );
    const flagEventsBefore = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'objectType=flag&limit=100' })
    );
    const membership = directoryConditions({
      sourceId: 'consumer',
      tenantId: '11111111-1111-4111-8111-111111111111',
      kind: 'organizations',
      ids: ['42'],
    });
    // The real consumer uses local-tenant in this suite, so use ordinary membership predicates with that same exact tenant guard.
    membership[0] = { attribute: 'tenantId', operator: 'eq', values: ['local-tenant'] };
    const newBlocks: { conditions: Condition[] }[] = [
      ...oldBlocks,
      { conditions: membership },
      {
        conditions: [
          { attribute: 'email', operator: 'ends_with', values: ['@example.test'] },
          { attribute: 'tier', operator: 'eq', values: ['partner'] },
        ],
      },
    ];
    segment = await saveDraft(await currentSegment(segment.id), newBlocks);
    expect(
      (await evaluate('on_flag', { email: 'pilot@example.test', tier: 'partner' })).value.value
    ).toBe(false);
    const published = await publishSegment(segment);
    expect(published).toMatchObject({ published: { version: 2, blocks: newBlocks }, draft: null });
    expect(published.history.map((item) => item.version)).toEqual([2, 1]);
    expect(
      (await evaluate('on_flag', { email: 'pilot@example.test', tier: 'partner' })).value.value
    ).toBe(true);
    expect(
      (await evaluate('on_flag', { email: 'pilot@example.test', tier: 'other' })).value.value
    ).toBe(false);
    expect(
      (await evaluate('on_flag', { email: 'pilot@else.test', tier: 'partner' })).value.value
    ).toBe(false);
    expect((await evaluate('on_flag', { email: 7, tier: 'partner' })).value.value).toBe(false);
    expect(
      (
        await evaluate('on_flag', {
          sourceId: 'consumer',
          organizationIds: ['42'],
          currentOrganizationId: '99',
        })
      ).value.value
    ).toBe(true);
    expect(
      (await evaluate('on_flag', { sourceId: 'other', organizationIds: ['42'] })).value.value
    ).toBe(false);
    expect(
      await evaluate('off_flag', { email: 'pilot@example.test', tier: 'partner' })
    ).toMatchObject({
      reason: 'disabled',
      value: { type: 'boolean', value: false },
      revision: off.revision,
    });
    expect(
      await owner.query(
        'SELECT flag_id,enabled,revision,configuration FROM flightdeck.configurations ORDER BY flag_id'
      )
    ).toMatchObject({ rows: rawBefore.rows });
    expect(await readFlag('on_flag')).toMatchObject({
      revision: on.revision,
      configuration: { segments: [{ revision: 2 }] },
    });
    expect((await readFlag('off_flag')).configuration.rules[1]).toEqual(direct);
    const flagEventsAfter = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'objectType=flag&limit=100' })
    );
    expect(flagEventsAfter).toEqual(flagEventsBefore);
    const audit = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: `objectType=segment&objectId=${segment.id}&action=published`,
      })
    );
    expect(audit.items[0]!.affectedReferences).toEqual([
      {
        flagId: off.id,
        flagKey: off.key,
        flagName: off.name,
        enabled: false,
        archived: false,
        revision: off.revision,
      },
      {
        flagId: on.id,
        flagKey: on.key,
        flagName: on.name,
        enabled: true,
        archived: false,
        revision: on.revision,
      },
    ]);
    const restored = segmentRecordSchema.parse(
      await invoke(
        `POST ${base}/segments/:segmentId/restore`,
        { expectedRevision: published.revision, version: 1 },
        { params: { segmentId: segment.id } }
      )
    );
    expect(restored).toMatchObject({
      published: published.published,
      draft: { version: 3, blocks: oldBlocks },
      history: published.history,
    });
    expect(
      (await evaluate('on_flag', { email: 'pilot@example.test', tier: 'partner' })).value.value
    ).toBe(true);
    await expect(
      invoke(
        `POST ${base}/segments/:segmentId/restore`,
        { expectedRevision: published.revision, version: 1 },
        { params: { segmentId: segment.id } }
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('retains archived following references with their actual stored gate and immutable archival snapshot', async () => {
    const blocks: { conditions: Condition[] }[] = [
      { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['one'] }] },
    ];
    let segment = await publishSegment(await createSegment(blocks));
    let flag = await createFlag('sample');
    flag = await publishFlag(flag, following(flag, segment.id));
    flag = await patch(flag, { enabled: true });
    flag = await patch(flag, { archived: true });
    segment = await saveDraft(await currentSegment(segment.id), blocks);
    const published = await publishSegment(segment);
    expect(published.usage).toEqual([
      {
        flagId: flag.id,
        flagKey: flag.key,
        flagName: flag.name,
        enabled: true,
        archived: true,
        revision: flag.revision,
      },
    ]);
    expect(await evaluate('sample', {}, 'one')).toMatchObject({
      reason: 'archived',
      value: { type: 'boolean', value: false },
    });
    const events = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: 'objectType=segment&action=published&limit=1',
      })
    );
    expect(events.items[0]!.affectedReferences).toEqual(published.usage);
    await patch(flag, { archived: false });
    const retained = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: 'objectType=segment&action=published&limit=1',
      })
    );
    expect(retained.items[0]).toEqual(events.items[0]);
  });

  it('uses built-in directory types for direct selections without schema preparation or an authoring directory', async () => {
    let flag = await createFlag('sample');
    const input = configurationInput(flag.configuration);
    input.defaultOutcome = { kind: 'value', value: { type: 'boolean', value: false } };
    input.rules = [
      {
        id: randomUUID(),
        name: 'Known organization memberships',
        conditions: [
          { attribute: 'tenantId', operator: 'eq', values: ['local-tenant'] },
          { attribute: 'sourceId', operator: 'eq', values: ['consumer'] },
          { attribute: 'organizationIds', operator: 'contains_any', values: ['42'] },
        ],
        segmentIds: [],
        rolloutBasisPoints: 10000,
        outcome: { kind: 'value', value: { type: 'boolean', value: true } },
      },
    ];
    flag = await publishFlag(flag, input);
    flag = await patch(flag, { enabled: true });
    expect(
      (
        await evaluate('sample', {
          sourceId: 'consumer',
          organizationIds: ['42'],
          currentOrganizationId: '99',
        })
      ).value.value
    ).toBe(true);
    expect(
      (await evaluate('sample', { sourceId: 'consumer', organizationIds: [] })).value.value
    ).toBe(false);
    expect(catalogSchema.parse(await invoke(`GET ${base}/catalog`))).toMatchObject({
      revision: 1,
      attributes: [],
    });
    await invoke(`PUT ${base}/catalog`, {
      expectedRevision: 1,
      catalog: { attributes: [{ key: 'sourceId', type: 'number', description: '' }] },
    });
    await expect(publishFlag(flag, input)).rejects.toMatchObject({ status: 400 });
    await expect(
      createSegment([{ conditions: [{ attribute: 'sourceId', operator: 'eq', values: [7] }] }])
    ).rejects.toMatchObject({ status: 400 });
    expect((await readFlag('sample')).revision).toBe(flag.revision);
  });

  it('publishes directory predicates with a full custom catalog without discarding that catalog', async () => {
    const attributes = Array.from({ length: 32 }, (_, index) => ({
      key: `custom_${index}`,
      type: 'string',
      description: `Consumer trait ${index}`,
    }));
    await invoke(`PUT ${base}/catalog`, { expectedRevision: 1, catalog: { attributes } });
    let flag = await createFlag('sample');
    const input = configurationInput(flag.configuration);
    input.defaultOutcome = { kind: 'value', value: { type: 'boolean', value: false } };
    const subjectId = '50000000-0000-4000-8000-000000000001';
    const tenantId = randomUUID();
    input.rules = [
      {
        id: randomUUID(),
        name: 'Directory person',
        conditions: directoryConditions({
          tenantId,
          sourceId: 'consumer',
          kind: 'people',
          ids: [subjectId],
        }),
        segmentIds: [],
        rolloutBasisPoints: 10000,
        outcome: { kind: 'value', value: { type: 'boolean', value: true } },
      },
    ];
    flag = await publishFlag(flag, input);
    await patch(flag, { enabled: true });
    const evaluatePerson = async (sourceId: string, person = subjectId) =>
      evaluationSchema.parse(
        await invoke(
          `POST ${base}/evaluate/:flagKey`,
          {
            context: { tenantId, subjectId: person, attributes: { sourceId } },
          },
          { principal: { ...service, allowedTenantIds: [tenantId] } }
        )
      );
    expect((await evaluatePerson('consumer')).value.value).toBe(true);
    expect((await evaluatePerson('other')).value.value).toBe(false);
    expect((await evaluatePerson('consumer', 'another-person')).value.value).toBe(false);
    expect(catalogSchema.parse(await invoke(`GET ${base}/catalog`)).attributes).toEqual(attributes);
  });

  it('binds segment publication review to concurrent gates, attachments and drafts, and rejects stale flag review after segment publication', async () => {
    const blocks: { conditions: Condition[] }[] = [
      { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['one'] }] },
    ];
    let segment = await publishSegment(await createSegment(blocks));
    let flag = await publishFlag(
      await createFlag('sample'),
      following(await readFlag('sample'), segment.id)
    );
    let draft = await saveDraft(await currentSegment(segment.id), [
      { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['two'] }] },
    ]);
    flag = await patch(flag, { enabled: true });
    await expect(publishSegment(draft)).rejects.toMatchObject({ status: 409 });
    draft = await currentSegment(segment.id);
    const another = await createFlag('another');
    await publishFlag(another, following(another, segment.id));
    await expect(publishSegment(draft)).rejects.toMatchObject({ status: 409 });
    draft = await currentSegment(segment.id);
    const concurrency = await Promise.allSettled([
      saveDraft(draft, blocks),
      saveDraft(draft, blocks),
    ]);
    expect(concurrency.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrency.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) }),
    ]);
    const catalog = catalogSchema.parse(await invoke(`GET ${base}/catalog`));
    segment = await publishSegment(await currentSegment(segment.id));
    await expect(
      publishFlag(flag, configurationInput(flag.configuration), catalog.revision)
    ).rejects.toMatchObject({ status: 409 });
    expect((await readFlag('sample')).revision).toBe(flag.revision);
    const audit = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: 'objectType=segment&action=draft_saved&limit=100',
      })
    );
    expect(audit.items).toHaveLength(2);
    expect(segment.usage).toHaveLength(2);
  });

  it('bounds initial segment history, pages every older version and audits fixed-size record-time snapshots', async () => {
    const blocks: { conditions: Condition[] }[] = [
      { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['one'] }] },
    ];
    let segment = await publishSegment(await createSegment(blocks));
    for (let version = 2; version <= 24; version++)
      segment = await publishSegment(
        await saveDraft(segment, [
          {
            conditions: [{ attribute: 'subjectId', operator: 'eq', values: [`person-${version}`] }],
          },
        ])
      );
    expect(segment.history.map((definition) => definition.version)).toEqual(
      Array.from({ length: 20 }, (_, index) => 24 - index)
    );
    expect(segment.historyNextCursor).toBe(5);
    const route = `GET ${base}/segments/:segmentId/history`;
    const older = segmentHistorySchema.parse(
      await invoke(route, undefined, {
        params: { segmentId: segment.id },
        query: 'before=5&limit=2',
        principal: viewer,
      })
    );
    expect(older.items.map((definition) => definition.version)).toEqual([4, 3]);
    expect(older.nextCursor).toBe(3);
    const oldest = segmentHistorySchema.parse(
      await invoke(route, undefined, {
        params: { segmentId: segment.id },
        query: 'before=3&limit=2',
      })
    );
    expect(oldest.items.map((definition) => definition.version)).toEqual([2, 1]);
    expect(oldest.nextCursor).toBeNull();
    expect(
      (
        await owner.query(
          'SELECT count(*)::integer AS count FROM flightdeck.segment_history WHERE segment_id=$1',
          [segment.id]
        )
      ).rows[0]!.count
    ).toBe(24);
    for (const query of ['before=0', 'before=2147483648', 'limit=101'])
      await expect(
        invoke(route, undefined, { params: { segmentId: segment.id }, query })
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      invoke(route, undefined, { params: { segmentId: segment.id, environmentId: productionId } })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      invoke(route, undefined, { params: { segmentId: segment.id }, principal: service })
    ).rejects.toMatchObject({ status: 403 });
    const events = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: 'objectType=segment&action=published&limit=100',
      })
    );
    expect(events.items).toHaveLength(24);
    expect(events.items[0]!.previous).toMatchObject({
      published: { version: 23 },
      draft: { version: 24 },
    });
    expect(events.items[0]!.next).toMatchObject({ published: { version: 24 }, draft: null });
    for (const event of events.items) {
      expect(event.previous).not.toHaveProperty('history');
      expect(event.next).not.toHaveProperty('history');
      expect(event.previous).not.toHaveProperty('historyNextCursor');
      expect(event.next).not.toHaveProperty('historyNextCursor');
    }
    const restored = segmentRecordSchema.parse(
      await invoke(
        `POST ${base}/segments/:segmentId/restore`,
        { expectedRevision: segment.revision, version: 1 },
        { params: { segmentId: segment.id } }
      )
    );
    expect(restored).toMatchObject({ published: { version: 24 }, draft: { version: 25, blocks } });
  });

  it('rolls publication and retained history back if its immutable audit insert fails', async () => {
    let segment = await publishSegment(
      await createSegment([
        { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['one'] }] },
      ])
    );
    segment = await saveDraft(segment, [
      { conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['two'] }] },
    ]);
    const before = await currentSegment(segment.id);
    const catalogBefore = catalogSchema.parse(await invoke(`GET ${base}/catalog`));
    await owner.query(`CREATE FUNCTION flightdeck.reject_unified_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='published' THEN RAISE EXCEPTION 'synthetic audit storage failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_unified_publication BEFORE INSERT ON flightdeck.unified_audit FOR EACH ROW EXECUTE FUNCTION flightdeck.reject_unified_publication()`);
    try {
      await expect(publishSegment(segment)).rejects.toThrow('synthetic audit storage failure');
      expect(await currentSegment(segment.id)).toEqual(before);
      expect(catalogSchema.parse(await invoke(`GET ${base}/catalog`))).toEqual(catalogBefore);
      expect(
        auditTrailSchema.parse(
          await invoke(`GET ${base}/audit`, undefined, { query: 'action=published' })
        ).items
      ).toHaveLength(1);
    } finally {
      await owner.query(
        'DROP TRIGGER reject_unified_publication ON flightdeck.unified_audit; DROP FUNCTION flightdeck.reject_unified_publication()'
      );
    }
  });

  it('filters immutable environment audit before bounded cursor pagination without exposing credentials or evaluation contexts', async () => {
    let flag = await createFlag('sample');
    const created = auditTrailSchema.parse(await invoke(`GET ${base}/audit`)).items[0]!;
    flag = await patch(flag, { name: 'Renamed local flag' });
    await patch(flag, { enabled: true });
    await createFlag('other_environment', 'system', production);
    // Filter by the actual verified actor name/ID rather than a role label.
    const actorPage = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, {
        query: `limit=1&objectType=flag&search=sample&actor=${encodeURIComponent(administrator.name)}&action=updated`,
      })
    );
    expect(actorPage.items).toHaveLength(1);
    expect(actorPage.items[0]).toMatchObject({
      objectId: flag.id,
      objectName: 'Renamed local flag',
      action: 'updated',
      previous: { name: 'Flag sample' },
      next: { name: 'Renamed local flag' },
    });
    const page = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'limit=1' })
    );
    expect(page.nextCursor).not.toBeNull();
    const older = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: `limit=1&before=${page.nextCursor}` })
    );
    expect(older.items[0]!.id).not.toBe(page.items[0]!.id);
    const all = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'limit=100' })
    );
    expect(all.items).toHaveLength(3);
    expect(all.items.find((event) => event.id === created.id)).toEqual(created);
    expect(
      auditTrailSchema.parse(
        await invoke(`GET ${base}/audit`, undefined, { query: `search=${created.id}` })
      ).items
    ).toEqual([created]);
    expect(
      auditTrailSchema.parse(
        await invoke(`GET ${base}/audit`, undefined, {
          query: `search=${created.id.toUpperCase()}`,
        })
      ).items
    ).toEqual([created]);
    expect(
      auditTrailSchema.parse(
        await invoke(`GET ${base}/audit`, undefined, {
          query: `search=${created.id}`,
          params: { environmentId: productionId },
        })
      ).items
    ).toEqual([]);
    const outsideTime = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'since=2099-01-01T00%3A00%3A00.000Z' })
    );
    expect(outsideTime.items).toEqual([]);
    expect(
      auditTrailSchema.parse(
        await invoke(`GET ${base}/audit`, undefined, {
          query: 'since=2099-01-01T00%3A00%3A00Z&until=2099-01-01T00%3A00%3A00.001Z',
        })
      ).items
    ).toEqual([]);
    for (const query of [
      'limit=101',
      'before=-1',
      'before=9999999999999999999',
      'search=' + 'x'.repeat(101),
      'objectType=credential',
      'since=not-a-date',
      'since=2099-01-01T00%3A00%3A00.000Z&until=2000-01-01T00%3A00%3A00.000Z',
    ])
      await expect(invoke(`GET ${base}/audit`, undefined, { query })).rejects.toMatchObject({
        status: 400,
      });
    await invoke(`POST ${base}/credentials`, {
      name: 'Private credential',
      allowedTenantIds: ['local-tenant'],
    });
    await evaluate('sample', { confidentialTrait: 'must-not-persist' });
    expect(
      auditTrailSchema.parse(await invoke(`GET ${base}/audit`, undefined, { query: 'limit=100' }))
    ).toEqual(all);
  });

  it('migrates Stage 2 pinned references into explicit local following without rewriting old event snapshots or flag revisions', async () => {
    const initial = await readFile(
      new URL('../migrations/001-initial.sql', import.meta.url),
      'utf8'
    );
    const targeting = await readFile(
      new URL('../migrations/002-targeting.sql', import.meta.url),
      'utf8'
    );
    const flagId = randomUUID();
    const segmentId = randomUUID();
    const auditId = randomUUID();
    const oldSegment = {
      id: segmentId,
      key: 'legacy',
      name: 'Legacy audience',
      revision: 1,
      conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['old-person'] }],
    };
    const nextSegment = {
      ...oldSegment,
      revision: 2,
      conditions: [{ attribute: 'subjectId', operator: 'eq', values: ['new-person'] }],
    };
    const typedFlagId = randomUUID();
    const typedSegment = {
      id: randomUUID(),
      key: 'typed_legacy',
      name: 'Typed legacy audience',
      revision: 1,
      conditions: [
        { attribute: 'x', operator: 'present', values: [] as (string | number | boolean)[] },
      ],
    };
    const nextTypedSegment = {
      ...typedSegment,
      revision: 2,
      conditions: [{ attribute: 'x', operator: 'eq', values: [true] }],
    };
    const removedReference = {
      ...oldSegment,
      id: randomUUID(),
      key: 'removed_reference',
      name: 'Removed but referenced',
    };
    const nextRemovedReference = {
      ...removedReference,
      revision: 2,
      conditions: nextSegment.conditions,
    };
    const retired = Array.from({ length: 60 }, (_, index) => ({
      ...oldSegment,
      id: randomUUID(),
      key: `retired_${index}`,
      name: `Removed ${index}`,
    }));
    const configuration = {
      allocationNamespace: randomUUID(),
      hashVersion: 'sha256-v1',
      offValue: { type: 'boolean', value: false },
      defaultOutcome: { kind: 'value', value: { type: 'boolean', value: false } },
      variants: [],
      rules: [
        {
          id: randomUUID(),
          name: 'Legacy reference',
          conditions: [],
          segmentIds: [segmentId, removedReference.id],
          rolloutBasisPoints: 10000,
          outcome: { kind: 'value', value: { type: 'boolean', value: true } },
        },
      ],
      catalogRevision: 1,
      contextDefinitions: [],
      segments: [oldSegment, removedReference],
    };
    const oldSnapshot = {
      name: 'Preserved flag',
      description: '',
      owner: 'Historical owner',
      archived: false,
      enabled: true,
      configuration,
    };
    const typedConfiguration = {
      ...configuration,
      allocationNamespace: randomUUID(),
      contextDefinitions: [{ key: 'x', type: 'number', description: '' }],
      segments: [typedSegment],
      rules: [
        {
          ...configuration.rules[0]!,
          id: randomUUID(),
          name: 'Preserved direct numeric predicate',
          segmentIds: [],
          conditions: [{ attribute: 'x', operator: 'gte', values: [10] }],
        },
        {
          ...configuration.rules[0]!,
          id: randomUUID(),
          name: 'Following typed predicate',
          segmentIds: [typedSegment.id],
        },
      ],
    };
    const expandedAttributes = Array.from({ length: 10 }, (_, index) => ({
      key: `expanded_${index}`,
      type: 'number',
      description: 'Shared legacy context description. '.repeat(8).slice(0, 300),
    }));
    const expandedSegments = Array.from({ length: 20 }, (_, index) => ({
      id: randomUUID(),
      key: `size_${String(index).padStart(2, '0')}`,
      name: `Preserved large audience ${index}`,
      revision: 1,
      conditions: expandedAttributes.map((attribute) => ({
        attribute: attribute.key,
        operator: 'present',
        values: [],
      })),
    }));
    const expandedFlagId = randomUUID();
    const expandedConfiguration = {
      ...configuration,
      allocationNamespace: randomUUID(),
      contextDefinitions: expandedAttributes,
      segments: expandedSegments,
      rules: Array.from({ length: 4 }, (_, index) => ({
        ...configuration.rules[0]!,
        id: randomUUID(),
        name: `Preserved large rule ${index}`,
        segmentIds: expandedSegments.slice(index * 5, (index + 1) * 5).map((item) => item.id),
      })),
    };
    expect(byteLength({ attributes: expandedAttributes, segments: expandedSegments })).toBeLessThan(
      24576
    );
    expect(byteLength(expandedConfiguration)).toBeLessThan(65536);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('DROP SCHEMA flightdeck CASCADE');
      await client.query(initial);
      await client.query(targeting);
      await client.query(
        'CREATE TABLE flightdeck.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())'
      );
      for (const [name, sql] of [
        ['001-initial.sql', initial],
        ['002-targeting.sql', targeting],
      ])
        await client.query(
          'INSERT INTO flightdeck.schema_migrations(name,checksum) VALUES($1,$2)',
          [name, createHash('sha256').update(sql!).digest('hex')]
        );
      await client.query('INSERT INTO flightdeck.organizations(id,name) VALUES($1,$2)', [
        administrator.organizationId,
        'Synthetic organization',
      ]);
      await client.query(
        'INSERT INTO flightdeck.projects(id,organization_id,key,name) VALUES($1,$2,$3,$4)',
        [projectId, administrator.organizationId, 'sandbox', 'Sandbox']
      );
      for (const environment of localEnvironments.filter((item) => item.projectId === projectId))
        await client.query(
          'INSERT INTO flightdeck.environments(id,project_id,key,name) VALUES($1,$2,$3,$4)',
          [environment.id, projectId, environment.key, environment.name]
        );
      await client.query(
        'INSERT INTO flightdeck.project_targeting(project_id,revision,attributes,segments) VALUES($1,3,$2,$3)',
        [
          projectId,
          JSON.stringify([{ key: 'x', type: 'boolean', description: '' }, ...expandedAttributes]),
          JSON.stringify([nextSegment, nextTypedSegment, ...expandedSegments]),
        ]
      );
      for (const [revision, segments] of [
        [1, [oldSegment, removedReference, typedSegment, ...retired.slice(0, 30)]],
        [2, [nextSegment, nextRemovedReference, typedSegment, ...retired.slice(30)]],
      ] as const)
        await client.query(
          'INSERT INTO flightdeck.project_targeting_audit(id,project_id,revision,actor_id,actor_name,next) VALUES($1,$2,$3,$4,$5,$6)',
          [
            randomUUID(),
            projectId,
            revision,
            administrator.id,
            administrator.name,
            JSON.stringify({
              projectId,
              revision,
              attributes: [
                { key: 'x', type: revision === 1 ? 'number' : 'string', description: '' },
              ],
              segments,
            }),
          ]
        );
      await client.query(
        "INSERT INTO flightdeck.flags(id,project_id,key,name,description,owner,revision) VALUES($1,$2,'sample','Preserved flag','','Historical owner',7)",
        [flagId, projectId]
      );
      for (const environment of localEnvironments.filter((item) => item.projectId === projectId))
        await client.query(
          'INSERT INTO flightdeck.configurations(flag_id,environment_id,project_id,enabled,configuration) VALUES($1,$2,$3,$4,$5)',
          [
            flagId,
            environment.id,
            projectId,
            environment.id === environmentId,
            JSON.stringify(configuration),
          ]
        );
      await client.query(
        "INSERT INTO flightdeck.flags(id,project_id,key,name,description,owner,revision) VALUES($1,$2,'typed_flag','Typed flag','','Historical owner',5)",
        [typedFlagId, projectId]
      );
      for (const environment of localEnvironments.filter((item) => item.projectId === projectId))
        await client.query(
          'INSERT INTO flightdeck.configurations(flag_id,environment_id,project_id,enabled,configuration) VALUES($1,$2,$3,$4,$5)',
          [
            typedFlagId,
            environment.id,
            projectId,
            environment.id === environmentId,
            JSON.stringify(typedConfiguration),
          ]
        );
      await client.query(
        "INSERT INTO flightdeck.flags(id,project_id,key,name,description,owner,revision) VALUES($1,$2,'expanded_flag','Preserved large flag','','Historical owner',9)",
        [expandedFlagId, projectId]
      );
      await client.query(
        'INSERT INTO flightdeck.configurations(flag_id,environment_id,project_id,enabled,configuration) VALUES($1,$2,$3,false,$4)',
        [expandedFlagId, environmentId, projectId, JSON.stringify(expandedConfiguration)]
      );
      await client.query(
        "INSERT INTO flightdeck.audit(id,flag_id,environment_id,project_id,actor_id,actor_name,action,revision,next) VALUES($1,$2,$3,$4,$5,$6,'configuration',7,$7)",
        [
          auditId,
          flagId,
          environmentId,
          projectId,
          administrator.id,
          administrator.name,
          JSON.stringify(oldSnapshot),
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
    let expandedFlag = await readFlag('expanded_flag');
    expect(expandedFlag).toMatchObject({ id: expandedFlagId, revision: 9, enabled: false });
    expect(
      expandedFlag.configuration.segments.map((segment) => segment.contextDefinitions)
    ).toEqual(expandedSegments.map(() => expandedAttributes));
    expect(byteLength(expandedFlag.configuration)).toBeGreaterThan(65536);
    expect((await evaluate('expanded_flag', {})).reason).toBe('disabled');
    expandedFlag = await patch(expandedFlag, { enabled: true });
    const expandedContext = Object.fromEntries(
      expandedAttributes.map((attribute) => [attribute.key, 1])
    );
    expect((await evaluate('expanded_flag', expandedContext)).value.value).toBe(true);
    delete expandedContext.expanded_0;
    expect((await evaluate('expanded_flag', expandedContext)).value.value).toBe(false);
    const flag = await readFlag('sample');
    expect(flag).toMatchObject({
      id: flagId,
      revision: 7,
      enabled: true,
      lifecycle: 'development',
      owner: 'Historical owner',
      configuration: {
        allocationNamespace: configuration.allocationNamespace,
        segments: [
          { id: segmentId, revision: 2 },
          { id: removedReference.id, revision: 2 },
        ],
      },
    });
    expect((await evaluate('sample', {}, 'new-person')).value.value).toBe(true);
    expect((await evaluate('sample', {}, 'old-person')).value.value).toBe(false);
    const segment = await currentSegment(segmentId);
    expect(segment.history.map((item) => item.version)).toEqual([2, 1]);
    expect((await currentSegment(removedReference.id)).published).toMatchObject({
      version: 2,
      blocks: [{ conditions: nextRemovedReference.conditions }],
    });
    expect(
      catalogSchema.parse(await invoke(`GET ${base}/catalog`)).segments.map((item) => item.key)
    ).toEqual([
      'legacy',
      'removed_reference',
      ...expandedSegments.map((item) => item.key),
      'typed_legacy',
    ]);
    const preservedCatalogHistory = await owner.query(
      'SELECT next FROM flightdeck.project_targeting_audit WHERE project_id=$1 ORDER BY revision',
      [projectId]
    );
    expect(preservedCatalogHistory.rows[0]!.next.segments).toHaveLength(33);
    expect(preservedCatalogHistory.rows[1]!.next.segments).toHaveLength(33);
    const historicalPage = catalogActivitySchema.parse(
      await invoke(`GET ${base}/catalog/activity`)
    );
    expect(historicalPage.items[0]!.next).toEqual(preservedCatalogHistory.rows[1]!.next);
    const typedFlag = await readFlag('typed_flag');
    expect(typedFlag.configuration.contextDefinitions).toEqual(
      typedConfiguration.contextDefinitions
    );
    expect(typedFlag.configuration.segments[0]!.contextDefinitions).toEqual([
      { key: 'x', type: 'boolean', description: '' },
    ]);
    expect((await evaluate('typed_flag', { x: 42 })).value.value).toBe(true);
    expect((await evaluate('typed_flag', { x: true })).value.value).toBe(true);
    expect((await evaluate('typed_flag', { x: 7 })).value.value).toBe(false);
    expect((await evaluate('typed_flag', { x: '42' })).value.value).toBe(false);
    expect((await evaluate('typed_flag', {})).value.value).toBe(false);
    const retainedBinding = await owner.query(
      'SELECT context_definitions FROM flightdeck.segment_history WHERE segment_id=$1 AND environment_id=$2 AND version=1',
      [typedSegment.id, environmentId]
    );
    expect(retainedBinding.rows[0]!.context_definitions).toEqual([
      { key: 'x', type: 'string', description: '' },
    ]);
    const typedRecord = await currentSegment(typedSegment.id);
    const typedRestore = segmentRecordSchema.parse(
      await invoke(
        `POST ${base}/segments/:segmentId/restore`,
        { expectedRevision: typedRecord.revision, version: 1 },
        { params: { segmentId: typedSegment.id } }
      )
    );
    await publishSegment(typedRestore);
    expect((await evaluate('typed_flag', { x: 'restored-string' })).value.value).toBe(true);
    expect((await evaluate('typed_flag', { x: 42 })).value.value).toBe(true);
    expect((await evaluate('typed_flag', { x: 7 })).value.value).toBe(false);
    expect((await readFlag('typed_flag')).revision).toBe(5);
    expect((await readFlag('typed_flag')).configuration.contextDefinitions).toEqual(
      typedConfiguration.contextDefinitions
    );
    const events = auditTrailSchema.parse(
      await invoke(`GET ${base}/audit`, undefined, { query: 'limit=100' })
    );
    expect(events.items.find((event) => event.id === auditId)!.next).toEqual(oldSnapshot);
    expect(
      events.items.find(
        (event) => event.action === 'following_migrated' && event.objectId === segmentId
      )
    ).toMatchObject({
      previous: { mode: 'pinned' },
      next: { mode: 'following' },
      affectedReferences: [{ flagId, enabled: true, revision: 7 }],
    });
    expect(
      (await owner.query('SELECT next FROM flightdeck.audit WHERE id=$1', [auditId])).rows[0]!.next
    ).toEqual(oldSnapshot);
    expect(
      (
        await owner.query(
          'SELECT configuration FROM flightdeck.configurations WHERE flag_id=$1 AND environment_id=$2',
          [flagId, environmentId]
        )
      ).rows[0]!.configuration.segments
    ).toEqual([]);
    const restored = segmentRecordSchema.parse(
      await invoke(
        `POST ${base}/segments/:segmentId/restore`,
        { expectedRevision: segment.revision, version: 1 },
        { params: { segmentId } }
      )
    );
    expect(restored).toMatchObject({
      published: { version: 2 },
      draft: { version: 3, blocks: [{ conditions: oldSegment.conditions }] },
    });
    expect((await readFlag('sample')).revision).toBe(7);
    await migrate(migrationUrl!);
    expect((await readFlag('sample')).revision).toBe(7);
  });
});
