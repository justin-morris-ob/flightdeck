import { readFile, mkdir, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { directoryResolveRequestSchema } from '../server/directory.ts';
import {
  activitySchema,
  apiErrorSchema,
  createCredentialSchema,
  createFlagSchema,
  credentialsSchema,
  evaluationSchema,
  flagSchema,
  flagsSchema,
  flagSummarySchema,
  issuedCredentialSchema,
  operatorSchema,
  projectsSchema,
  previewSchema,
  sessionSchema,
  updateFlagSchema,
} from '../shared/contracts.ts';
import {
  directoryKindSchema,
  directoryResolveSchema,
  directorySearchSchema,
  directoryStatusSchema,
} from '../shared/directory.ts';
import {
  catalogSchema,
  catalogUpdateSchema,
  catalogActivitySchema,
  publishConfigurationSchema,
  evaluationRequestSchema,
  previewRequestSchema,
  overridesSchema,
  createOverrideSchema,
  revokeOverrideSchema,
} from '../shared/targeting.ts';
import {
  deploymentSchema,
  segmentRecordSchema,
  segmentLibrarySchema,
  segmentHistorySchema,
  createSegmentSchema,
  updateSegmentDraftSchema,
  publishSegmentSchema,
  restoreSegmentSchema,
  auditTrailSchema,
} from '../shared/unified.ts';

const output = new URL('../api/openapi.json', import.meta.url);
const componentSchemas: Record<string, unknown> = {};
const schemaNames = new Map<z.ZodType, string>([
  [activitySchema, 'FlagActivity'],
  [apiErrorSchema, 'ApiError'],
  [createCredentialSchema, 'CreateCredential'],
  [createFlagSchema, 'CreateFlag'],
  [credentialsSchema, 'CredentialList'],
  [evaluationSchema, 'Evaluation'],
  [flagSchema, 'Flag'],
  [flagsSchema, 'FlagList'],
  [flagSummarySchema, 'FlagSummary'],
  [issuedCredentialSchema, 'IssuedCredential'],
  [operatorSchema, 'Operator'],
  [projectsSchema, 'Projects'],
  [sessionSchema, 'Session'],
  [updateFlagSchema, 'UpdateFlag'],
  [previewSchema, 'Preview'],
  [catalogSchema, 'TargetingCatalog'],
  [catalogUpdateSchema, 'UpdateCatalog'],
  [catalogActivitySchema, 'CatalogActivity'],
  [publishConfigurationSchema, 'PublishConfiguration'],
  [evaluationRequestSchema, 'EvaluateContext'],
  [previewRequestSchema, 'PreviewContext'],
  [overridesSchema, 'SubjectOverrides'],
  [createOverrideSchema, 'CreateSubjectOverride'],
  [revokeOverrideSchema, 'RevokeSubjectOverride'],
  [directoryStatusSchema, 'DirectoryStatus'],
  [directorySearchSchema, 'DirectorySearch'],
  [directoryResolveSchema, 'DirectoryResolve'],
  [directoryResolveRequestSchema, 'ResolveDirectory'],
  [deploymentSchema, 'Deployment'],
  [segmentRecordSchema, 'SegmentRecord'],
  [segmentLibrarySchema, 'SegmentLibrary'],
  [segmentHistorySchema, 'SegmentHistory'],
  [createSegmentSchema, 'CreateSegment'],
  [updateSegmentDraftSchema, 'UpdateSegmentDraft'],
  [publishSegmentSchema, 'PublishSegment'],
  [restoreSegmentSchema, 'RestoreSegment'],
  [auditTrailSchema, 'AuditTrail'],
]);
function rebaseReferences(value: unknown, name: string): unknown {
  if (Array.isArray(value)) return value.map((item) => rebaseReferences(item, name));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === '$ref' && typeof item === 'string' && item.startsWith('#')
        ? `#/components/schemas/${name}${item.slice(1)}`
        : rebaseReferences(item, name),
    ])
  );
}
const schema = (value: z.ZodType) => {
  let name = schemaNames.get(value);
  if (!name) {
    name = `Auxiliary${schemaNames.size + 1}`;
    schemaNames.set(value, name);
  }
  if (!componentSchemas[name]) {
    const { $schema: _dialect, ...generated } = z.toJSONSchema(value, { target: 'draft-2020-12' });
    componentSchemas[name] = rebaseReferences(generated, name);
  }
  return { $ref: `#/components/schemas/${name}` };
};
const content = (value: z.ZodType) => ({ 'application/json': { schema: schema(value) } });
const scope = '/api/v1/projects/{projectId}/environments/{environmentId}';
const parameter = (name: string, location: 'path' | 'query', value: Record<string, unknown>) => ({
  name,
  in: location,
  required: location === 'path',
  schema: value,
});
const scopeParameters = [
  parameter('projectId', 'path', { type: 'string', format: 'uuid' }),
  parameter('environmentId', 'path', { type: 'string', format: 'uuid' }),
];
const flagParameter = parameter('flagKey', 'path', {
  type: 'string',
  pattern: '^[a-z][a-z0-9_-]*$',
  maxLength: 100,
});
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 500].map((code) => [
    code,
    {
      description: (
        {
          400: 'Invalid input',
          401: 'Authentication required',
          403: 'Insufficient permission',
          404: 'Unknown or inaccessible resource',
          409: 'Duplicate key or conflicting revision',
          413: 'Body exceeds 64 KiB',
          415: 'JSON required',
          500: 'Internal error',
        } as Record<number, string>
      )[code],
      content: content(apiErrorSchema),
    },
  ])
);
function operation(
  summary: string,
  response: z.ZodType | null,
  options: {
    body?: z.ZodType;
    public?: boolean;
    service?: boolean;
    parameters?: unknown[];
    directory?: boolean;
  } = {}
) {
  return {
    summary,
    security: options.public
      ? []
      : options.service
        ? [{ evaluationBearer: [] }, { localSession: [] }]
        : [{ localSession: [] }],
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: { required: true, content: content(options.body) } } : {}),
    responses: {
      [response ? '200' : '204']: response
        ? { description: 'Success', content: content(response) }
        : { description: 'Success, no content' },
      ...errors,
      ...(options.directory
        ? {
            502: {
              description: 'Directory authentication, scope or response contract rejected',
              content: content(apiErrorSchema),
            },
            503: {
              description: 'Directory disconnected or unavailable',
              content: content(apiErrorSchema),
            },
          }
        : {}),
    },
  };
}
const document = {
  openapi: '3.1.0',
  info: {
    title: 'Flightdeck API',
    version: '3.0.0',
    description:
      'Local-development API with deployment-fixed local authoring and read-only master observation. Dashboard mode and environment come only from validated server configuration; master mode is not production authentication. Signed local sessions remain loopback-only and demo-only. Flag identity is shared by project key, but metadata, lifecycle, archive state, revisions, gates and configurations are environment-local. Creating a flag initializes only the configured local environment, disabled. Reusable segments have independent drafts and immutable publication history. Published flag references follow current local published segment blocks (OR blocks, AND conditions) without republishing flags or changing flag revisions or gates; historical audit retains original snapshots. Catalog writes edit only local attributes. All operator mutations require local dashboard mode and the configured environment. Credentials grant explicit tenant contexts within one project/environment. Context and proposed configuration retain independent bounds inside a 64-KiB HTTP envelope. No context is stored as exposure or used as entitlement authorization. This is not a production-stable external API.',
  },
  servers: [{ url: 'http://localhost:4721' }],
  components: {
    schemas: componentSchemas,
    securitySchemes: {
      localSession: {
        type: 'apiKey',
        in: 'cookie',
        name: 'fd_local_session',
        description:
          'HttpOnly SameSite=Strict signed development session, issued only by explicit loopback development startup. Not a production authentication protocol.',
      },
      evaluationBearer: {
        type: 'http',
        scheme: 'bearer',
        description:
          'Backend-only fd_ token, restricted to one organization/project/environment, explicit tenant grants and evaluation; only its SHA256 verifier is stored. Context traits are asserted by the trusted backend caller, not browser authority.',
      },
    },
  },
  paths: {
    '/healthz': {
      get: operation(
        'Database readiness and explicit runtime mode',
        z.object({
          name: z.literal('flightdeck'),
          ok: z.literal(true),
          mode: z.literal('local-development'),
        }),
        { public: true }
      ),
    },
    '/api/v1/dev/operators': {
      get: operation(
        'List synthetic local development identities',
        z.object({ items: z.array(operatorSchema) }),
        { public: true }
      ),
    },
    '/api/v1/dev/session': {
      get: operation(
        'Bootstrap local session without invalidating an Atlas demo session',
        z.object({ session: sessionSchema.nullable() }),
        { public: true }
      ),
      post: operation(
        'Select a synthetic development identity and issue an HttpOnly cookie',
        sessionSchema,
        { public: true, body: z.strictObject({ operatorId: z.string() }) }
      ),
    },
    '/api/v1/session': {
      get: operation('Read the authenticated local session', sessionSchema),
      delete: operation('Clear the local session cookie', null, { public: true }),
    },
    '/api/v1/projects': {
      get: operation('List projects and environments in the operator organization', projectsSchema),
    },
    '/api/v1/deployment': {
      get: operation(
        'Read validated server-fixed dashboard mode, environment and dashboard links',
        deploymentSchema
      ),
    },
    [`${scope}/segments`]: {
      get: operation(
        'Read local segment drafts, published definitions, history and published flag usage',
        segmentLibrarySchema,
        {
          parameters: scopeParameters,
        }
      ),
      post: operation(
        'Create an environment-local segment draft; local editor or administrator only',
        segmentRecordSchema,
        {
          parameters: scopeParameters,
          body: createSegmentSchema,
        }
      ),
    },
    [`${scope}/segments/{segmentId}/draft`]: {
      put: operation(
        'Save a segment draft against its expected local revision without publishing',
        segmentRecordSchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('segmentId', 'path', { type: 'string', format: 'uuid' }),
          ],
          body: updateSegmentDraftSchema,
        }
      ),
    },
    [`${scope}/segments/{segmentId}/publish`]: {
      post: operation(
        'Publish a reviewed segment draft for all local published references atomically; preserve flag revisions and gates',
        segmentRecordSchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('segmentId', 'path', { type: 'string', format: 'uuid' }),
          ],
          body: publishSegmentSchema,
        }
      ),
    },
    [`${scope}/segments/{segmentId}/restore`]: {
      post: operation(
        'Restore a historical segment definition into a revision-guarded draft; never change the published definition',
        segmentRecordSchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('segmentId', 'path', { type: 'string', format: 'uuid' }),
          ],
          body: restoreSegmentSchema,
        }
      ),
    },
    [`${scope}/segments/{segmentId}/history`]: {
      get: operation(
        'Read immutable published segment history in descending version order; authorized environment scope',
        segmentHistorySchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('segmentId', 'path', { type: 'string', format: 'uuid' }),
            parameter('before', 'query', {
              type: 'integer',
              minimum: 1,
              maximum: 2147483647,
              description: 'Exclusive version cursor from the previous page nextCursor',
            }),
            parameter('limit', 'query', {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            }),
          ],
        }
      ),
    },
    [`${scope}/audit`]: {
      get: operation(
        'Search immutable environment-local flag and segment audit snapshots with opaque pagination',
        auditTrailSchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('search', 'query', { type: 'string', maxLength: 100 }),
            parameter('objectType', 'query', { type: 'string', enum: ['flag', 'segment'] }),
            parameter('objectId', 'query', { type: 'string', format: 'uuid' }),
            parameter('actor', 'query', { type: 'string', maxLength: 100 }),
            parameter('action', 'query', { type: 'string', maxLength: 100 }),
            parameter('before', 'query', {
              type: 'string',
              description: 'Opaque exclusive pagination cursor returned as nextCursor',
            }),
            parameter('since', 'query', {
              type: 'string',
              format: 'date-time',
              description: 'Inclusive UTC ISO datetime lower bound',
            }),
            parameter('until', 'query', {
              type: 'string',
              format: 'date-time',
              description: 'Inclusive UTC ISO datetime upper bound',
            }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
          ],
        }
      ),
    },
    [`${scope}/directory`]: {
      get: operation(
        'Read optional directory binding; operator viewer or above; configured is not a health claim',
        directoryStatusSchema,
        { parameters: scopeParameters }
      ),
    },
    [`${scope}/directory/search`]: {
      get: operation(
        'Search the bound BC tenant directory; editor or administrator only; no evaluation dependency',
        directorySearchSchema,
        {
          directory: true,
          parameters: [
            ...scopeParameters,
            {
              ...parameter('kind', 'query', { type: 'string', enum: directoryKindSchema.options }),
              required: true,
            },
            {
              ...parameter('q', 'query', {
                type: 'string',
                minLength: 2,
                maxLength: 128,
                description: 'Trimmed search text',
              }),
              required: true,
            },
            parameter('offset', 'query', {
              type: 'integer',
              minimum: 0,
              maximum: 10000,
              default: 0,
            }),
          ],
        }
      ),
    },
    [`${scope}/directory/resolve`]: {
      post: operation(
        'Resolve up to 20 unique canonical IDs in the bound BC tenant; editor or administrator only',
        directoryResolveSchema,
        { directory: true, parameters: scopeParameters, body: directoryResolveRequestSchema }
      ),
    },
    '/api/v1/projects/{projectId}/flags': {
      get: operation(
        'List project flag identities with environment-local metadata, lifecycle and configuration summaries; operator viewer or above',
        flagsSchema,
        {
          parameters: [
            parameter('projectId', 'path', { type: 'string', format: 'uuid' }),
            parameter('search', 'query', { type: 'string', maxLength: 100 }),
            parameter('environmentId', 'query', {
              type: 'string',
              format: 'uuid',
              description:
                'Filter inventory search and archive state to one authorized environment',
            }),
            parameter('after', 'query', {
              type: 'string',
              description: 'Exclusive last flag key from previous page',
            }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 20, default: 20 }),
            parameter('archived', 'query', {
              type: 'string',
              enum: ['active', 'archived', 'all'],
              default: 'active',
            }),
          ],
        }
      ),
    },
    [`${scope}/flags`]: {
      get: operation(
        'List flags initialized in this environment; apply local metadata and lifecycle filters before pagination',
        flagsSchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('search', 'query', { type: 'string', maxLength: 100 }),
            parameter('after', 'query', {
              type: 'string',
              description: 'Exclusive last flag key from previous page',
            }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 20, default: 20 }),
            parameter('archived', 'query', {
              type: 'string',
              enum: ['active', 'archived', 'all'],
              default: 'active',
            }),
            parameter('lifecycle', 'query', {
              type: 'string',
              enum: ['development', 'release', 'system', 'permissions'],
            }),
            parameter('longevity', 'query', {
              type: 'string',
              enum: ['temporary', 'long-lived'],
            }),
          ],
        }
      ),
      post: operation(
        'Initialize a flag disabled only in the configured local environment; reuse project key identity; editor or administrator',
        flagSchema,
        { parameters: scopeParameters, body: createFlagSchema }
      ),
    },
    [`${scope}/flags/{flagKey}`]: {
      get: operation('Read flag metadata and selected environment state', flagSchema, {
        parameters: [...scopeParameters, flagParameter],
      }),
      patch: operation(
        'Publish local metadata or state against the expected environment-local revision',
        flagSchema,
        { parameters: [...scopeParameters, flagParameter], body: updateFlagSchema }
      ),
    },
    [`${scope}/flags/{flagKey}/activity`]: {
      get: operation('Read immutable environment-local flag history', activitySchema, {
        parameters: [
          ...scopeParameters,
          flagParameter,
          parameter('before', 'query', {
            type: 'integer',
            minimum: 1,
            description: 'Exclusive revision cursor',
          }),
          parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
        ],
      }),
    },
    [`${scope}/evaluate/{flagKey}`]: {
      post: operation(
        'Evaluate typed configuration, ordered targeting and deterministic variants',
        evaluationSchema,
        {
          service: true,
          parameters: [...scopeParameters, flagParameter],
          body: evaluationRequestSchema,
        }
      ),
    },
    [`${scope}/catalog`]: {
      get: operation(
        'Read local targeting attributes and current published segment blocks',
        catalogSchema,
        { parameters: scopeParameters }
      ),
      put: operation(
        'Publish revision-checked local attribute definitions; segments use separate draft and publication routes',
        catalogSchema,
        { parameters: scopeParameters, body: catalogUpdateSchema }
      ),
    },
    [`${scope}/catalog/activity`]: {
      get: operation(
        'Read immutable environment-local attribute catalog history',
        catalogActivitySchema,
        {
          parameters: [
            ...scopeParameters,
            parameter('before', 'query', { type: 'integer', minimum: 1 }),
            parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
          ],
        }
      ),
    },
    [`${scope}/flags/{flagKey}/configuration`]: {
      put: operation(
        'Publish typed local configuration with expected flag/catalog revisions and immutable allocation namespace; segment references follow local publication',
        flagSchema,
        { parameters: [...scopeParameters, flagParameter], body: publishConfigurationSchema }
      ),
    },
    [`${scope}/flags/{flagKey}/preview`]: {
      post: operation(
        'Explain current and proposed decisions with the same evaluator, without publishing',
        previewSchema,
        { parameters: [...scopeParameters, flagParameter], body: previewRequestSchema }
      ),
    },
    [`${scope}/flags/{flagKey}/overrides`]: {
      get: operation('List scoped subject overrides with expiry and priority', overridesSchema, {
        parameters: [
          ...scopeParameters,
          flagParameter,
          parameter('after', 'query', { type: 'string', format: 'uuid' }),
          parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
        ],
      }),
      post: operation(
        'Create an expiring tenant/subject override against an expected environment-local flag revision',
        flagSchema,
        { parameters: [...scopeParameters, flagParameter], body: createOverrideSchema }
      ),
    },
    [`${scope}/flags/{flagKey}/overrides/{overrideId}/revoke`]: {
      post: operation(
        'Revoke a scoped subject override with transactional audit and revision conflict detection',
        flagSchema,
        {
          parameters: [
            ...scopeParameters,
            flagParameter,
            parameter('overrideId', 'path', { type: 'string', format: 'uuid' }),
          ],
          body: revokeOverrideSchema,
        }
      ),
    },
    [`${scope}/credentials`]: {
      get: operation('List at most 100 scoped credentials; administrator only', credentialsSchema, {
        parameters: scopeParameters,
      }),
      post: operation(
        'Issue a scoped credential and reveal its secret once; administrator only',
        issuedCredentialSchema,
        { parameters: scopeParameters, body: createCredentialSchema }
      ),
    },
    [`${scope}/credentials/{credentialId}`]: {
      delete: operation('Revoke a scoped evaluation credential; administrator only', null, {
        parameters: [
          ...scopeParameters,
          parameter('credentialId', 'path', { type: 'string', format: 'uuid' }),
        ],
      }),
    },
  },
};
function validateReferences(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) validateReferences(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref' && typeof item === 'string' && item.startsWith('#/')) {
      let resolved: unknown = document;
      for (const segment of item.slice(2).split('/')) {
        const name = segment.replace(/~1/g, '/').replace(/~0/g, '~');
        if (resolved === null || typeof resolved !== 'object' || !Object.hasOwn(resolved, name))
          throw new Error(`Unresolved OpenAPI reference: ${item}`);
        resolved = (resolved as Record<string, unknown>)[name];
      }
    } else validateReferences(item);
  }
}
validateReferences(document);
const serialized = JSON.stringify(document, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const existing = JSON.parse(await readFile(output, 'utf8'));
  if (JSON.stringify(existing) !== JSON.stringify(document))
    throw new Error('API schema is out of date; run pnpm contracts');
  console.log('Versioned OpenAPI contract matches runtime schemas.');
} else {
  await mkdir(new URL('../api/', import.meta.url), { recursive: true });
  await writeFile(output, serialized);
  console.log('Generated api/openapi.json from runtime request/response schemas.');
}
