import type { AddressInfo } from 'node:net';

import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateFlag, EvaluationAuthorizationError } from '../examples/evaluate.ts';
import { localEnvironments, localProjects } from '../shared/fixtures.ts';

const projectId = localProjects[0].id;
const environmentId = localEnvironments[0].id;
let responseBody: unknown;
let responseStatus = 200;
const server = createServer((_request, response) => {
  response.writeHead(responseStatus, { 'content-type': 'application/json' });
  response.end(JSON.stringify(responseBody));
});
let baseUrl: string;
beforeAll(async () => {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
  await promise;
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((error) => (error ? reject(error) : resolve()));
  server.closeAllConnections();
  await promise;
});
function options() {
  return {
    baseUrl,
    token: 'fd_local-consumer-test',
    projectId,
    environmentId,
    key: 'preview',
    context: { tenantId: 'local-tenant', subjectId: 'consumer', attributes: {} },
    fallback: { type: 'string' as const, value: 'safe-fallback' },
  };
}
function decision() {
  return {
    key: 'preview',
    projectId,
    environmentId,
    enabled: true,
    value: { type: 'string', value: 'treatment' },
    reason: 'default',
    revision: 2,
    catalogRevision: 1,
    variantId: null,
    matchedRuleId: null,
    matchedOverrideId: null,
    trace: [],
  };
}
describe('typed backend consumer trust boundaries', () => {
  it('does not consume a well-formed decision from another environment', async () => {
    responseStatus = 200;
    responseBody = { ...decision(), environmentId: localEnvironments[1].id };
    expect(await evaluateFlag(options())).toEqual({
      source: 'fallback',
      value: { type: 'string', value: 'safe-fallback' },
      reason: 'invalid-response',
      revision: null,
    });
  });
  it('does not replace a declared string contract with an otherwise valid numeric decision', async () => {
    responseStatus = 200;
    responseBody = { ...decision(), value: { type: 'number', value: 42 } };
    expect(await evaluateFlag(options())).toEqual({
      source: 'fallback',
      value: { type: 'string', value: 'safe-fallback' },
      reason: 'invalid-response',
      revision: null,
    });
  });
  it('does not hide a tenant authorization failure behind a typed fallback', async () => {
    responseStatus = 403;
    responseBody = { error: 'Credential does not permit this tenant' };
    await expect(evaluateFlag(options())).rejects.toBeInstanceOf(EvaluationAuthorizationError);
  });
});
