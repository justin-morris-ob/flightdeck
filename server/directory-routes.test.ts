import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';

import { once } from 'node:events';
import { createServer } from 'node:http';
import { createServer as reservePort } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { localEnvironments, localOperators, localProjects } from '../shared/fixtures.ts';
import { sessionCookie, signSession } from './auth.ts';
import { connectDatabase, migrate, seedDatabase } from './database.ts';
import { DirectoryClient } from './directory.ts';
import { createApplication } from './http.ts';

const runtimeUrl = process.env.FLIGHTDECK_TEST_DATABASE_URL;
const migrationUrl = process.env.FLIGHTDECK_TEST_MIGRATION_DATABASE_URL;
if (!runtimeUrl || !migrationUrl)
  throw new Error('Run pnpm db:setup, then pnpm test to exercise the real test database');

const projectId = localProjects[0]!.id;
const environmentId = localEnvironments[0]!.id;
const foreignProjectId = localProjects[2]!.id;
const foreignEnvironmentId = localEnvironments[4]!.id;
const tenantId = '40000000-0000-4000-8000-000000000001';
const personId = '50000000-0000-4000-8000-000000000001';
const token = `fd_${'2'.repeat(64)}`;
const secret = 'directory-http-session-secret-at-least-32-characters';
const binding = { sourceId: 'bc-directory-route-test', tenantId };
const person = { id: personId, label: 'Directory Person', email: 'directory@example.test' };
const oauthPath = '/api/external/oauth/token';

describe('persistent directory HTTP authorization', () => {
  let owner: Pool;
  let runtime: Pool;
  let app: Server | undefined;
  let upstream: Server | undefined;
  let origin: string;
  let received: string[];
  let upstreamStatus: number;
  let previousMode: string | undefined;

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
    const ownerUrl = new URL(migrationUrl!);
    const appUrl = new URL(runtimeUrl!);
    if (!database.endsWith('_test') || database !== runtimeIdentity.rows[0]!.database)
      throw new Error('Refusing fixture reset: both URLs must target the same *_test database');
    if (
      runtimeIdentity.rows[0]!.role !== 'flightdeck_runtime' ||
      ownerIdentity.rows[0]!.role === 'flightdeck_runtime' ||
      ownerUrl.hostname !== appUrl.hostname ||
      ownerUrl.port !== appUrl.port
    )
      throw new Error('Tests require separate owner/runtime roles on the same PostgreSQL server');
    await migrate(migrationUrl!);
  });

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
  });

  beforeEach(async () => {
    await owner.query(`TRUNCATE flightdeck.subject_overrides, flightdeck.project_targeting_audit,
      flightdeck.project_targeting, flightdeck.audit, flightdeck.configurations, flightdeck.flags,
      flightdeck.credentials, flightdeck.environments, flightdeck.projects, flightdeck.organizations`);
    await seedDatabase(migrationUrl!, token);
    received = [];
    upstreamStatus = 200;
    upstream = createServer((req, res) => {
      received.push(req.url!);
      res.setHeader('content-type', 'application/json');
      if (req.url === oauthPath) {
        res.end(
          JSON.stringify({ access_token: 'directory-token', token_type: 'Bearer', expires_in: 60 })
        );
        return;
      }
      res.statusCode = upstreamStatus;
      res.end(
        JSON.stringify(
          upstreamStatus === 200
            ? req.method === 'POST'
              ? { ...binding, kind: 'people', items: [person], missingIds: [] }
              : { ...binding, kind: 'people', items: [person], nextOffset: null }
            : { error: 'private-directory-internals' }
        )
      );
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const upstreamPort = (upstream.address() as AddressInfo).port;
    const connection = {
      projectId,
      environmentId,
      ...binding,
      label: 'Test BC',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      clientId: 'private-directory-client',
      clientSecret: 'private-directory-secret',
    };
    const directory = new DirectoryClient([
      connection,
      { ...connection, projectId: foreignProjectId, environmentId: foreignEnvironmentId },
    ]);
    const reservation = reservePort();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as AddressInfo).port;
    const reservedClose = once(reservation, 'close');
    reservation.close();
    await reservedClose;
    previousMode = process.env.FLIGHTDECK_MODE;
    process.env.FLIGHTDECK_MODE = 'local-development';
    app = createApplication({ pool: runtime, sessionSecret: secret, port, directory });
    app.listen(port, '127.0.0.1');
    await once(app, 'listening');
    origin = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const server of [app, upstream]) {
      if (server) {
        server.closeAllConnections();
        const closed = once(server, 'close');
        server.close();
        await closed;
      }
    }
    app = undefined;
    upstream = undefined;
    if (previousMode === undefined) delete process.env.FLIGHTDECK_MODE;
    else process.env.FLIGHTDECK_MODE = previousMode;
  });

  function request(
    operation: 'status' | 'search' | 'resolve',
    identity: number | 'service' | 'anonymous' = 0,
    scope = { projectId, environmentId },
    suffix = ''
  ) {
    const headers: Record<string, string> = {};
    if (typeof identity === 'number')
      headers.cookie = sessionCookie(signSession(localOperators[identity]!.id, secret)).split(
        ';'
      )[0]!;
    else if (identity === 'service') headers.authorization = `Bearer ${token}`;
    if (operation === 'resolve') headers['content-type'] = 'application/json';
    const path =
      operation === 'status'
        ? ''
        : operation === 'search'
          ? '/search?kind=people&q=directory'
          : '/resolve';
    return fetch(
      `${origin}/api/v1/projects/${scope.projectId}/environments/${scope.environmentId}/directory${path}${suffix}`,
      {
        method: operation === 'resolve' ? 'POST' : 'GET',
        headers,
        ...(operation === 'resolve'
          ? { body: JSON.stringify({ kind: 'people', ids: [personId] }) }
          : {}),
      }
    );
  }

  it('permits operator status reads without contacting BC or exposing connection credentials', async () => {
    for (const identity of [0, 1, 2]) {
      const response = await request('status', identity);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'configured', label: 'Test BC', binding });
    }
    const disconnected = await request('status', 2, {
      projectId,
      environmentId: localEnvironments[1]!.id,
    });
    expect(disconnected.status).toBe(200);
    expect(await disconnected.json()).toEqual({ status: 'disconnected' });
    expect(received).toEqual([]);
  });

  it('allows editor/admin search and resolve through actual OAuth and directory sockets', async () => {
    for (const identity of [0, 1]) {
      const search = await request('search', identity);
      expect(search.status).toBe(200);
      expect(await search.json()).toEqual({
        ...binding,
        kind: 'people',
        items: [person],
        nextOffset: null,
      });
      const resolve = await request('resolve', identity);
      expect(resolve.status).toBe(200);
      expect(await resolve.json()).toEqual({
        ...binding,
        kind: 'people',
        items: [person],
        missingIds: [],
      });
    }
    expect(received).toHaveLength(8);
    expect(received.filter((path) => path === oauthPath)).toHaveLength(4);
  });

  it('rejects viewers, evaluation credentials and unauthenticated requests before upstream access', async () => {
    for (const operation of ['status', 'search', 'resolve'] as const) {
      for (const identity of ['anonymous', 'service', 2] as const) {
        if (operation === 'status' && identity === 2) continue;
        const response = await request(operation, identity);
        expect(response.status).toBe(identity === 'anonymous' ? 401 : 403);
        await response.json();
      }
    }
    expect(received).toEqual([]);
  });

  it('checks persisted organization/project/environment scope before even configured upstream calls', async () => {
    for (const operation of ['status', 'search', 'resolve'] as const) {
      for (const [identity, scope] of [
        [3, { projectId, environmentId }],
        [0, { projectId: foreignProjectId, environmentId: foreignEnvironmentId }],
        [0, { projectId, environmentId: localEnvironments[2]!.id }],
        [0, { projectId, environmentId: '30000000-0000-4000-8000-000000000099' }],
      ] as const) {
        const response = await request(operation, identity, scope);
        expect(response.status).toBe(404);
        await response.json();
      }
    }
    // A previously configured connection must not bypass removal of its persisted scope.
    await owner.query('DELETE FROM flightdeck.credentials WHERE environment_id = $1', [
      environmentId,
    ]);
    await owner.query('DELETE FROM flightdeck.environments WHERE id = $1', [environmentId]);
    for (const operation of ['status', 'search', 'resolve'] as const) {
      const response = await request(operation);
      expect(response.status).toBe(404);
      await response.json();
    }
    expect(received).toEqual([]);
  });

  it('rejects browser-supplied tenant/source scope and repeated query parameters before OAuth', async () => {
    for (const suffix of [
      `&tenantId=${tenantId}`,
      '&sourceId=another-bc',
      '&q=another',
      '&offset=10001',
    ]) {
      const response = await request('search', 1, undefined, suffix);
      expect(response.status).toBe(400);
      await response.json();
    }
    expect(received).toEqual([]);
  });

  it('returns explicit sanitized upstream failures rather than an empty successful directory', async () => {
    for (const [status, expected] of [
      [403, 502],
      [503, 503],
    ] as const) {
      upstreamStatus = status;
      for (const operation of ['search', 'resolve'] as const) {
        const response = await request(operation, 1);
        expect(response.status).toBe(expected);
        const body = await response.json();
        expect(body).toEqual({
          error:
            status === 403
              ? 'BC directory credential scope was rejected'
              : 'BC directory is unavailable',
        });
      }
    }
    expect(received).toHaveLength(8);
  });
});
