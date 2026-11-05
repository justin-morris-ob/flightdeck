import type { EvaluationContext } from '@openfeature/server-sdk';
import type { RequestListener, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createServer } from 'node:http';

import {
  FlightdeckAuthorizationError,
  FlightdeckContractError,
  FlightdeckProvider,
  enforceFlightdeckPolicy,
} from '@flightdeck/openfeature-provider';
import { ErrorCode, OpenFeature, StandardResolutionReasons } from '@openfeature/server-sdk';
import { afterEach, describe, expect, it } from 'vitest';

const projectId = '00000000-0000-4000-8000-000000000001';
const environmentId = '00000000-0000-4000-8000-000000000002';
const secondEnvironmentId = '00000000-0000-4000-8000-000000000003';
const token = 'fd_provider-test-secret';
const context = { tenantId: 'test-tenant', targetingKey: 'account-uuid' };
const servers: Server[] = [];
let domainId = 0;

function decision(value: unknown = { type: 'boolean', value: true }) {
  return {
    key: 'feature',
    projectId,
    environmentId,
    value,
    enabled: true,
    reason: 'default',
    revision: 7,
    catalogRevision: 3,
    variantId: null,
    matchedRuleId: null,
    matchedOverrideId: null,
    trace: [],
  };
}

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
  await promise;
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function client(
  baseUrl: string,
  options: { environmentId?: string; timeoutMs?: number } = {}
) {
  const domain = `flightdeck-test-${++domainId}`;
  await OpenFeature.setProviderAndWait(
    domain,
    new FlightdeckProvider({
      baseUrl,
      token,
      projectId,
      environmentId,
      ...options,
    })
  );
  return OpenFeature.getClient(domain);
}

async function fixedResponse(payload: unknown, status = 200) {
  return listen((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
}

afterEach(async () => {
  await OpenFeature.clearProviders();
  await Promise.all(
    servers.splice(0).map(async (server) => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
      await promise;
    })
  );
});

describe('Flightdeck provider through the actual OpenFeature server SDK', () => {
  it('returns boolean decisions and public decision metadata instead of the caller default', async () => {
    const sdk = await client(await fixedResponse(decision()));
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context));
    expect(details).toMatchObject({
      flagKey: 'feature',
      value: true,
      reason: StandardResolutionReasons.DEFAULT,
      flagMetadata: {
        flightdeckSource: 'decision',
        flightdeckReason: 'default',
        revision: 7,
        catalogRevision: 3,
        enabled: true,
      },
    });
    expect(details.errorCode).toBeUndefined();
  });

  it('returns string, number and JSON values through all four real SDK methods', async () => {
    const string = await client(
      await fixedResponse(decision({ type: 'string', value: 'treatment' }))
    );
    const number = await client(await fixedResponse(decision({ type: 'number', value: 42.5 })));
    const object = await client(
      await fixedResponse(
        decision({
          type: 'json',
          value: { title: 'Ready', limits: [1, 2], visible: true, note: null },
        })
      )
    );
    expect(
      enforceFlightdeckPolicy(await string.getStringDetails('feature', 'control', context)).value
    ).toBe('treatment');
    expect(
      enforceFlightdeckPolicy(await number.getNumberDetails('feature', 0, context)).value
    ).toBe(42.5);
    expect(
      enforceFlightdeckPolicy(await object.getObjectDetails('feature', {}, context)).value
    ).toEqual({ title: 'Ready', limits: [1, 2], visible: true, note: null });
  });

  it.each([
    ['disabled', StandardResolutionReasons.DISABLED],
    ['archived', StandardResolutionReasons.DISABLED],
    ['rule', StandardResolutionReasons.TARGETING_MATCH],
    ['override', StandardResolutionReasons.TARGETING_MATCH],
    ['missing_subject', StandardResolutionReasons.DEFAULT],
  ])(
    'preserves Flightdeck reason %s independently of the standard reason',
    async (reason, expected) => {
      const sdk = await client(
        await fixedResponse({
          ...decision(),
          reason,
          variantId: 'treatment',
        })
      );
      const details = await sdk.getBooleanDetails('feature', false, context);
      expect(details).toMatchObject({ value: true, reason: expected, variant: 'treatment' });
      expect(details.flagMetadata.flightdeckReason).toBe(reason);
    }
  );

  it('maps targetingKey, tenant and typed membership attributes into a usable decision', async () => {
    const baseUrl = await listen(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      const admitted =
        request.method === 'POST' &&
        request.url ===
          `/api/v1/projects/${projectId}/environments/${environmentId}/evaluate/feature` &&
        request.headers.authorization === `Bearer ${token}` &&
        request.headers['content-type'] === 'application/json' &&
        payload.context.tenantId === 'test-tenant' &&
        payload.context.subjectId === 'account-uuid' &&
        payload.context.attributes.sourceId === 'bc-test' &&
        payload.context.attributes.organizationIds.includes('org-b') &&
        payload.context.attributes.groupIds.includes('group-a') &&
        payload.context.attributes.seats === 12 &&
        payload.context.attributes.earlyAccess === true &&
        !Object.hasOwn(payload.context.attributes, 'targetingKey') &&
        !Object.hasOwn(payload.context.attributes, 'tenantId');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(decision({ type: 'boolean', value: admitted })));
    });
    const sdk = await client(baseUrl);
    expect(
      enforceFlightdeckPolicy(
        await sdk.getBooleanDetails('feature', false, {
          ...context,
          sourceId: 'bc-test',
          organizationIds: ['org-a', 'org-b'],
          groupIds: ['group-a'],
          seats: 12,
          earlyAccess: true,
        })
      ).value
    ).toBe(true);
  });

  it.each([401, 403])(
    'retains HTTP %i authorization metadata despite SDK defaulting',
    async (status) => {
      const sdk = await client(await fixedResponse({ error: `${token} private context` }, status));
      const details = await sdk.getBooleanDetails('feature', false, context);
      expect(details).toMatchObject({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        flagMetadata: {
          flightdeckSource: 'fallback',
          flightdeckErrorCategory: 'authorization',
          httpStatus: status,
        },
      });
      expect(() => enforceFlightdeckPolicy(details)).toThrow(FlightdeckAuthorizationError);
      try {
        enforceFlightdeckPolicy(details);
      } catch (error) {
        expect(error).toMatchObject({ status });
        expect(String(error)).not.toContain(token);
        expect(String(error)).not.toContain('private context');
      }
      expect(JSON.stringify(details)).not.toContain(token);
      expect(JSON.stringify(details)).not.toContain('account-uuid');
    }
  );

  it.each([400, 405, 409, 413, 422])(
    'refuses a nonretryable HTTP %i rejection after SDK defaulting',
    async (status) => {
      const sdk = await client(await fixedResponse({ error: 'private request rejected' }, status));
      const details = await sdk.getBooleanDetails('feature', true, context);
      expect(details).toMatchObject({
        value: true,
        reason: 'ERROR',
        flagMetadata: { httpStatus: status },
      });
      expect(() => enforceFlightdeckPolicy(details)).toThrow(FlightdeckContractError);
      expect(JSON.stringify(details)).not.toContain('private request');
    }
  );

  it.each([
    [404, 'not-found', ErrorCode.FLAG_NOT_FOUND],
    [408, 'unavailable', ErrorCode.GENERAL],
    [429, 'unavailable', ErrorCode.GENERAL],
    [500, 'unavailable', ErrorCode.GENERAL],
    [503, 'unavailable', ErrorCode.GENERAL],
  ] as const)(
    'allows deliberate caller default policy for HTTP %i',
    async (status, category, code) => {
      const sdk = await client(await fixedResponse({}, status));
      const details = await sdk.getStringDetails('feature', 'safe-control', context);
      expect(enforceFlightdeckPolicy(details)).toBe(details);
      expect(details).toMatchObject({
        value: 'safe-control',
        reason: 'ERROR',
        errorCode: code,
        flagMetadata: { flightdeckSource: 'fallback', flightdeckErrorCategory: category },
      });
    }
  );

  it.each([
    { tenantId: 'test-tenant', subjectId: 'ambiguous' },
    { tenantId: 'test-tenant', attributes: { groupIds: ['group-a'] } },
    { tenantId: 'test-tenant', organization: { id: 'nested' } },
    { tenantId: 'test-tenant', timestamp: new Date('2026-01-01T00:00:00.000Z') },
    { tenantId: 'test-tenant', groupIds: [1, 2] },
    { tenantId: 'test-tenant', groupIds: Array(101).fill('group-a') },
    { tenantId: 'test-tenant', groupIds: ['x'.repeat(501)] },
    { tenantId: 'test-tenant', seats: Number.NaN },
    { tenantId: 'test-tenant', organizationId: null },
    { tenantId: ' test-tenant ' },
    { tenantId: '' },
    { targetingKey: 'account-uuid' },
    { tenantId: 'test-tenant', targetingKey: '' },
    { tenantId: 'test-tenant', targetingKey: 'x'.repeat(201) },
    { tenantId: 'test-tenant', groupIds: Array(100).fill('x'.repeat(500)) },
    {
      tenantId: 'test-tenant',
      ...Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`attr${i}`, true])),
    },
  ] as EvaluationContext[])(
    'rejects unsupported or over-bound context without making an HTTP request: %#',
    async (invalid) => {
      let calls = 0;
      const sdk = await client(
        await listen((_request, response) => {
          calls++;
          response.end();
        })
      );
      const details = await sdk.getBooleanDetails('feature', false, invalid);
      expect(details).toMatchObject({
        value: false,
        reason: 'ERROR',
        errorCode: ErrorCode.INVALID_CONTEXT,
        flagMetadata: { flightdeckErrorCategory: 'invalid-context' },
      });
      expect(() => enforceFlightdeckPolicy(details)).toThrow(FlightdeckContractError);
      expect(calls).toBe(0);
    }
  );

  it('accepts empty string lists, exactly 100 list items and exactly 32 attributes', async () => {
    const sdk = await client(await fixedResponse(decision()));
    for (const attributes of [
      { groupIds: [] },
      { groupIds: Array(100).fill('group-a') },
      Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`attr${i}`, 'x'.repeat(500)])),
    ]) {
      expect(
        enforceFlightdeckPolicy(
          await sdk.getBooleanDetails('feature', false, {
            ...context,
            ...attributes,
          })
        ).value
      ).toBe(true);
    }
  });

  it('permits tenant-only fixed decisions without inventing a subject', async () => {
    const sdk = await client(await fixedResponse(decision()));
    expect(
      enforceFlightdeckPolicy(
        await sdk.getBooleanDetails('feature', false, {
          tenantId: 'test-tenant',
        })
      ).value
    ).toBe(true);
  });

  it.each([
    'wrong-key',
    'wrong-project',
    'wrong-environment',
    'bad-revision',
    'bad-catalog',
    'bad-value',
  ])('defaults on %s without accepting a malformed or cross-scope decision', async (kind) => {
    const payload = decision();
    if (kind === 'wrong-key') payload.key = 'other';
    if (kind === 'wrong-project') payload.projectId = secondEnvironmentId;
    if (kind === 'wrong-environment') payload.environmentId = secondEnvironmentId;
    if (kind === 'bad-revision') payload.revision = 0;
    if (kind === 'bad-catalog') payload.catalogRevision = 1.5;
    if (kind === 'bad-value') payload.value = { type: 'boolean', value: 'true' };
    const sdk = await client(await fixedResponse(payload));
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context));
    expect(details).toMatchObject({
      value: false,
      reason: 'ERROR',
      errorCode: ErrorCode.PARSE_ERROR,
      flagMetadata: { flightdeckSource: 'fallback', flightdeckErrorCategory: 'invalid-response' },
    });
    expect(details.flagMetadata.revision).toBeUndefined();
  });

  it('distinguishes a well-formed wrong type from an unavailable or unknown decision', async () => {
    const sdk = await client(await fixedResponse(decision({ type: 'number', value: 10 })));
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context));
    expect(details).toMatchObject({
      value: false,
      reason: 'ERROR',
      errorCode: ErrorCode.TYPE_MISMATCH,
      flagMetadata: { flightdeckErrorCategory: 'type-mismatch' },
    });
  });

  it.each([
    'malformed',
    'wrong-content-type',
    'declared-oversize',
    'streamed-oversize',
    'json-value-oversize',
  ])('bounds and rejects %s responses', async (kind) => {
    const sdk = await client(
      await listen((_request, response) => {
        response.writeHead(200, {
          'content-type': kind === 'wrong-content-type' ? 'text/html' : 'application/json',
          ...(kind === 'declared-oversize' ? { 'content-length': 300_000 } : {}),
        });
        if (kind === 'malformed') response.end('{');
        else if (kind === 'json-value-oversize')
          response.end(
            JSON.stringify(decision({ type: 'json', value: { large: 'x'.repeat(4096) } }))
          );
        else if (kind === 'declared-oversize' || kind === 'streamed-oversize')
          response.end('x'.repeat(300_000));
        else response.end(JSON.stringify(decision()));
      })
    );
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context));
    expect(details).toMatchObject({
      value: false,
      reason: 'ERROR',
      errorCode: ErrorCode.PARSE_ERROR,
      flagMetadata: { flightdeckErrorCategory: 'invalid-response' },
    });
  });

  it.each(['headers', 'body'])('keeps the same deadline while waiting for %s', async (phase) => {
    const sdk = await client(
      await listen((_request, response) => {
        if (phase === 'body') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.write('{');
        }
      }),
      { timeoutMs: 40 }
    );
    const started = performance.now();
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', true, context));
    expect(details).toMatchObject({
      value: true,
      reason: 'ERROR',
      flagMetadata: { flightdeckErrorCategory: 'unavailable' },
    });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('does not forward credentials to a redirect target', async () => {
    let redirectedCalls = 0;
    const target = await listen((_request, response) => {
      redirectedCalls++;
      response.end(JSON.stringify(decision()));
    });
    const sdk = await client(
      await listen((_request, response) => {
        response.writeHead(302, { location: target });
        response.end();
      })
    );
    const details = enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context));
    expect(details.flagMetadata.flightdeckErrorCategory).toBe('unavailable');
    expect(redirectedCalls).toBe(0);
  });

  it.each(['/gateway', '/gateway/'])('preserves base URL deployment prefix %s', async (prefix) => {
    const baseUrl = await listen((request, response) => {
      const routed =
        request.url ===
        `/gateway/api/v1/projects/${projectId}/environments/${environmentId}/evaluate/feature`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(decision({ type: 'boolean', value: routed })));
    });
    const sdk = await client(`${baseUrl}${prefix}`);
    expect(
      enforceFlightdeckPolicy(await sdk.getBooleanDetails('feature', false, context)).value
    ).toBe(true);
  });

  it('does not mix fixed provider scopes or reuse stale decisions across domains', async () => {
    let firstValue = true;
    const baseUrl = await listen((request, response) => {
      const second = request.url?.includes(secondEnvironmentId);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ...decision({ type: 'boolean', value: second ? false : firstValue }),
          environmentId: second ? secondEnvironmentId : environmentId,
        })
      );
    });
    const first = await client(baseUrl);
    const second = await client(baseUrl, { environmentId: secondEnvironmentId });
    const [a, b] = await Promise.all([
      first.getBooleanDetails('feature', false, context),
      second.getBooleanDetails('feature', true, context),
    ]);
    expect(enforceFlightdeckPolicy(a).value).toBe(true);
    expect(enforceFlightdeckPolicy(b).value).toBe(false);
    firstValue = false;
    expect(
      enforceFlightdeckPolicy(await first.getBooleanDetails('feature', true, context)).value
    ).toBe(false);
  });

  it('rejects invalid keys as contract failures without attempting HTTP', async () => {
    let calls = 0;
    const sdk = await client(
      await listen((_request, response) => {
        calls++;
        response.end();
      })
    );
    const details = await sdk.getBooleanDetails('../secret', false, context);
    expect(() => enforceFlightdeckPolicy(details)).toThrow(FlightdeckContractError);
    expect(calls).toBe(0);
  });

  it.each([
    { baseUrl: 'http://example.com' },
    { baseUrl: 'https://user:secret@example.com' },
    { baseUrl: 'https://example.com?secret=value' },
    { baseUrl: 'https://example.com#secret' },
    { baseUrl: 'https://example.com?' },
    { baseUrl: 'https://example.com#' },
    { baseUrl: 'ftp://localhost' },
    { baseUrl: 'not a URL' },
    { token: '' },
    { token: 'secret\nheader' },
    { projectId: 'not-a-uuid' },
    { environmentId: 'not-a-uuid' },
    { timeoutMs: 0 },
    { timeoutMs: -1 },
    { timeoutMs: 10_001 },
    { timeoutMs: Number.NaN },
  ])('validates fixed backend configuration without including secrets in errors: %#', (invalid) => {
    expect(
      () =>
        new FlightdeckProvider({
          baseUrl: 'https://flightdeck.example',
          token,
          projectId,
          environmentId,
          ...invalid,
        })
    ).toThrow(FlightdeckContractError);
  });
});
