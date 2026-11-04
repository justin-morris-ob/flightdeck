import { readFile, mkdir, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import {
  activitySchema,
  apiErrorSchema,
  createCredentialSchema,
  createFlagSchema,
  credentialsSchema,
  evaluationSchema,
  flagSchema,
  flagsSchema,
  issuedCredentialSchema,
  operatorSchema,
  projectsSchema,
  sessionSchema,
  updateFlagSchema,
} from '../shared/contracts.ts';

const output = new URL('../api/openapi.json', import.meta.url);
const schema = (value: z.ZodType) => z.toJSONSchema(value, { target: 'draft-2020-12' });
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
          413: 'Body exceeds 32 KiB',
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
  options: { body?: z.ZodType; public?: boolean; service?: boolean; parameters?: unknown[] } = {}
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
    },
  };
}
const document = {
  openapi: '3.1.0',
  info: {
    title: 'Flightdeck API',
    version: '1.0.0',
    description:
      'Stage 1 local-development API. Signed local sessions are demo-only and cannot be used in production. Flag metadata and revision are project-wide; enabled state is environment-specific. All mutations publish immediately and append transactional audit history. Archived flags evaluate false with reason archived; unknown flags are 404. Flag keys are immutable and never reused after archival.',
  },
  servers: [{ url: 'http://localhost:4721' }],
  components: {
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
          'Backend-only fd_ token, restricted to one organization/project/environment and evaluation operation; only its SHA256 verifier is stored.',
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
    [`${scope}/flags`]: {
      get: operation('List scoped flag configuration, ordered by immutable key', flagsSchema, {
        parameters: [
          ...scopeParameters,
          parameter('search', 'query', { type: 'string', maxLength: 100 }),
          parameter('after', 'query', {
            type: 'string',
            description: 'Exclusive last flag key from previous page',
          }),
          parameter('limit', 'query', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
          parameter('archived', 'query', {
            type: 'string',
            enum: ['active', 'archived', 'all'],
            default: 'active',
          }),
        ],
      }),
      post: operation(
        'Create a project flag disabled in all environments; editor or administrator',
        flagSchema,
        { parameters: scopeParameters, body: createFlagSchema }
      ),
    },
    [`${scope}/flags/{flagKey}`]: {
      get: operation('Read flag metadata and selected environment state', flagSchema, {
        parameters: [...scopeParameters, flagParameter],
      }),
      patch: operation(
        'Publish a configuration/metadata change against the expected global revision',
        flagSchema,
        { parameters: [...scopeParameters, flagParameter], body: updateFlagSchema }
      ),
    },
    [`${scope}/flags/{flagKey}/activity`]: {
      get: operation(
        'Read immutable project flag history, including environment of each change',
        activitySchema,
        {
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
        }
      ),
    },
    [`${scope}/evaluate/{flagKey}`]: {
      get: operation(
        'Evaluate a boolean flag using a scoped service credential or operator preview',
        evaluationSchema,
        { service: true, parameters: [...scopeParameters, flagParameter] }
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
