import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';

import { flagSchema, issuedCredentialSchema, scopePath } from '../../shared/contracts.ts';
import { localEnvironments, localProjects } from '../../shared/fixtures.ts';
import {
  catalogSchema,
  configurationInput,
  type AttributeDefinition,
  type Segment,
} from '../../shared/targeting.ts';
import { demoConfigSchema, demoFlags } from './contracts.ts';

if (process.env.NODE_ENV === 'production' || process.env.FLIGHTDECK_MODE !== 'local-development')
  throw new Error('Demo seeding requires explicit local-development mode.');
const baseUrl = process.env.FLIGHTDECK_BASE_URL ?? 'http://localhost:4721';
const base = new URL(baseUrl);
if (
  base.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(base.hostname) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error('Demo setup requires a loopback HTTP Flightdeck service.');
const project = localProjects.find((item) => item.key === 'sandbox')!;
const environment = localEnvironments.find(
  (item) => item.projectId === project.id && item.key === 'development'
)!;
const scope = scopePath(project.id, environment.id);
const tenantId = 'consumer-demo';
const sourceId = 'consumer-demo';
const owner = 'Flightdeck consumer demo';
const segmentId = '40000000-0000-4000-8000-000000000501';
const privateDirectory = new URL('../../.local/consumer-demo/', import.meta.url);
const configFile = new URL('config.json', privateDirectory);
let cookie = '';
async function request(
  path: string,
  method = 'GET',
  payload?: unknown,
  allowMissing = false
): Promise<unknown> {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      accept: 'application/json',
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  if (response.headers.has('set-cookie'))
    cookie = response.headers.get('set-cookie')!.split(';')[0];
  if (allowMissing && response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Demo setup request failed (${response.status}): ${method} ${path}. Existing data was not reset.`
    );
  return response.status === 204 ? null : response.json();
}
await request('/api/v1/dev/session', 'POST', { operatorId: 'local-admin' });
let catalog = catalogSchema.parse(await request(`${scope}/catalog`));
const attributes: AttributeDefinition[] = [
  { key: 'sourceId', type: 'string', description: 'Trusted consumer deployment/source binding' },
  {
    key: 'organizationIds',
    type: 'string_list',
    description: 'Effective organization memberships; not current organization',
  },
  {
    key: 'groupIds',
    type: 'string_list',
    description: 'Effective group memberships in this source',
  },
];
for (const attribute of attributes) {
  const existing = catalog.attributes.find((item) => item.key === attribute.key);
  if (existing && existing.type !== attribute.type)
    throw new Error(
      `Sandbox attribute ${attribute.key} has an incompatible type; refusing to overwrite it.`
    );
}
const segment: Omit<Segment, 'revision'> = {
  id: segmentId,
  key: 'consumer-demo-alpha-pilots',
  name: 'Consumer demo · Alpha pilots',
  conditions: [
    { attribute: 'sourceId', operator: 'eq', values: [sourceId] },
    { attribute: 'groupIds', operator: 'contains_any', values: ['501'] },
  ],
};
const existingSegment = catalog.segments.find(
  (item) => item.id === segment.id || item.key === segment.key
);
if (
  existingSegment &&
  (existingSegment.id !== segment.id ||
    existingSegment.key !== segment.key ||
    JSON.stringify(existingSegment.conditions) !== JSON.stringify(segment.conditions))
)
  throw new Error(
    'Consumer demo segment conflicts with an existing definition; refusing to overwrite it.'
  );
const missingAttributes = attributes.filter(
  (attribute) => !catalog.attributes.some((item) => item.key === attribute.key)
);
if (missingAttributes.length || !existingSegment) {
  catalog = catalogSchema.parse(
    await request(`${scope}/catalog`, 'PUT', {
      expectedRevision: catalog.revision,
      catalog: {
        attributes: [...catalog.attributes, ...missingAttributes],
        segments: [
          ...catalog.segments.map(({ revision: _revision, ...item }) => item),
          ...(!existingSegment ? [segment] : []),
        ],
      },
    })
  );
}
for (const definition of demoFlags) {
  const path = `${scope}/flags/${definition.key}`;
  const found = await request(path, 'GET', undefined, true);
  if (found) {
    const existing = flagSchema.parse(found);
    if (existing.owner !== owner)
      throw new Error(
        `Existing ${definition.key} is not owned by the consumer demo; refusing to change it.`
      );
    continue;
  }
  let flag = flagSchema.parse(
    await request(`${scope}/flags`, 'POST', {
      key: definition.key,
      name: definition.name,
      description:
        'Reusable consumer contract demonstration. Synthetic identities; manage configuration normally after initial setup.',
      owner,
    })
  );
  const value =
    definition.type === 'boolean'
      ? { type: 'boolean' as const, value: false }
      : definition.type === 'string'
        ? { type: 'string' as const, value: 'Welcome from Flightdeck' }
        : definition.type === 'number'
          ? { type: 'number' as const, value: 12 }
          : { type: 'json' as const, value: { density: 'compact', showSummary: true } };
  const configuration = {
    ...configurationInput(flag.configuration),
    offValue: value,
    defaultOutcome: { kind: 'value' as const, value },
    rules:
      definition.type === 'boolean'
        ? [
            {
              id: '50000000-0000-4000-8000-000000000501',
              name: 'Alpha pilot membership',
              conditions: [],
              segmentIds: [segmentId],
              rolloutBasisPoints: 10000,
              outcome: { kind: 'value' as const, value: { type: 'boolean' as const, value: true } },
            },
          ]
        : [],
  };
  flag = flagSchema.parse(
    await request(`${path}/configuration`, 'PUT', {
      expectedRevision: flag.revision,
      expectedCatalogRevision: catalog.revision,
      configuration,
    })
  );
  await request(path, 'PATCH', { expectedRevision: flag.revision, enabled: true });
}
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
await chmod(privateDirectory, 0o700);
let existingConfig: unknown;
try {
  existingConfig = JSON.parse(await readFile(configFile, 'utf8'));
} catch (error) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
    throw new Error(
      'Private demo configuration is unreadable; restore it rather than regenerate credentials.'
    );
}
if (existingConfig) {
  const saved = demoConfigSchema.parse(existingConfig);
  if (
    saved.baseUrl !== baseUrl ||
    saved.projectId !== project.id ||
    saved.environmentId !== environment.id ||
    saved.tenantId !== tenantId ||
    saved.sourceId !== sourceId
  )
    throw new Error('Private demo scope differs from this setup; refusing credential replacement.');
} else {
  const issued = issuedCredentialSchema.parse(
    await request(`${scope}/credentials`, 'POST', {
      name: 'Consumer demo backend',
      allowedTenantIds: [tenantId],
    })
  );
  const config = demoConfigSchema.parse({
    baseUrl,
    token: issued.token,
    credentialId: issued.credential.id,
    projectId: project.id,
    environmentId: environment.id,
    tenantId,
    sourceId,
  });
  await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}
await chmod(configFile, 0o600);
console.log(
  'Consumer demo ready in Sandbox / Development. Existing flags/configurations retained; credential stored privately. Run pnpm demo.'
);
