import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { HttpError } from '@onebrief/atlas-bff-kit';

import {
  DirectoryClient,
  directoryResolveRequestSchema,
  directorySearchQuerySchema,
  loadDirectoryConnections,
  type DirectoryConnection,
} from './directory.ts';

const projectId = '20000000-0000-4000-8000-000000000001';
const environmentId = '30000000-0000-4000-8000-000000000001';
const tenantId = '40000000-0000-4000-8000-000000000001';
const personId = '50000000-0000-4000-8000-000000000001';
const missingId = '50000000-0000-4000-8000-000000000002';
const scope = { projectId, environmentId };
const binding = { sourceId: 'bc-local', tenantId };
const person = { id: personId, label: 'Directory Person', email: 'directory@example.test' };
const searchResult = { ...binding, kind: 'people', items: [person], nextOffset: null };
const resolveResult = { ...binding, kind: 'people', items: [person], missingIds: [missingId] };
const token = { access_token: 'directory-access-token', token_type: 'Bearer', expires_in: 300 };
const oauthPath = '/api/external/oauth/token';
const searchPath = '/api/external/flightdeck-directory/v1/search';
const resolvePath = '/api/external/flightdeck-directory/v1/resolve';
const servers: Server[] = [];
const directories: string[] = [];

function connection(baseUrl = 'https://bc.example.test'): DirectoryConnection {
  return {
    ...scope,
    ...binding,
    label: 'Local BC',
    baseUrl,
    clientId: 'private-client-id',
    clientSecret: 'private-client-secret',
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

type Received = {
  method: string | undefined;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
};
type Handler = (req: Received, res: ServerResponse) => void | Promise<void>;

/** Actual sockets exercise fetch, credentials, redirects, streamed bodies and cancellation. */
async function upstream(override?: Handler) {
  const received: Received[] = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString('utf8');
      const request: Received = {
        method: req.method,
        url: req.url ?? '/',
        headers: req.headers,
        body: body ? (JSON.parse(body) as unknown) : undefined,
      };
      received.push(request);
      if (override) return await override(request, res);
      if (request.url === oauthPath) {
        if (
          request.method !== 'POST' ||
          JSON.stringify(request.body) !==
            JSON.stringify({
              grant_type: 'client_credentials',
              client_id: 'private-client-id',
              client_secret: 'private-client-secret',
            })
        )
          return send(res, 401, { error: 'invalid_client' });
        return send(res, 200, token);
      }
      if (request.headers.authorization !== `Bearer ${token.access_token}`)
        return send(res, 403, { error: 'directory_scope_required' });
      if (request.url.startsWith(searchPath)) return send(res, 200, searchResult);
      if (request.url === resolvePath) return send(res, 200, resolveResult);
      send(res, 404, { error: 'not_found' });
    } catch {
      if (!res.destroyed) send(res, 500, { error: 'fixture_failure' });
    }
  });
  servers.push(server);
  const listening = Promise.withResolvers<void>();
  server.once('error', listening.reject);
  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  return { baseUrl: `http://127.0.0.1:${address.port}`, received };
}

async function configFile(value: unknown) {
  const directory = await mkdtemp(join(tmpdir(), 'flightdeck-directory-'));
  directories.push(directory);
  const path = join(directory, 'connections.json');
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  return path;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolve()));
      return promise;
    })
  );
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('private BC directory configuration', () => {
  it('is disconnected only when no path is configured', async () => {
    expect(await loadDirectoryConnections()).toEqual([]);
    const path = await configFile({ connections: [] });
    expect(await loadDirectoryConnections(path)).toEqual([]);
    await expect(loadDirectoryConnections(`${path}.absent`)).rejects.toThrow(
      'Invalid BC directory configuration'
    );
    await expect(loadDirectoryConnections('')).rejects.toThrow(
      'Invalid BC directory configuration'
    );
  });

  it('loads validated mode-0600 connections without putting secrets into public status', async () => {
    const privateConnection = connection();
    const path = await configFile({ connections: [privateConnection] });
    const loaded = await loadDirectoryConnections(path);
    expect(loaded).toEqual([privateConnection]);
    const client = new DirectoryClient(loaded);
    expect(client.publicStatus(projectId, environmentId)).toEqual({
      status: 'configured',
      label: 'Local BC',
      binding,
    });
    expect(client.publicStatus(projectId, missingId)).toEqual({ status: 'disconnected' });
    expect(client.publicStatus(missingId, environmentId)).toEqual({ status: 'disconnected' });
    expect(JSON.stringify(client)).toBe('{}');
  });

  it.each([0o644, 0o640, 0o660, 0o400, 0o700])('rejects file mode %i', async (mode) => {
    const path = await configFile({ connections: [connection()] });
    await chmod(path, mode);
    await expect(loadDirectoryConnections(path)).rejects.toThrow('mode-0600');
  });

  it('rejects symlinks, directories, malformed files and excessive file bytes without leaking input', async () => {
    const path = await configFile({ connections: [connection()] });
    const link = `${path}.link`;
    await symlink(path, link);
    for (const invalid of [link, join(path, '..')])
      await expect(loadDirectoryConnections(invalid)).rejects.toThrow(
        'Invalid BC directory configuration'
      );
    await writeFile(path, 'private-client-secret malformed JSON');
    await expect(loadDirectoryConnections(path)).rejects.toThrow(
      /^Invalid BC directory configuration; require a private mode-0600 JSON file$/
    );
    await writeFile(path, ' '.repeat(65537));
    await expect(loadDirectoryConnections(path)).rejects.toThrow(
      'Invalid BC directory configuration'
    );
  });

  it.each([
    'http://bc.example.test',
    'ftp://localhost',
    'file:///etc/passwd',
    'https://private-client-secret@bc.example.test',
    'https://user:secret@bc.example.test',
    'https://bc.example.test?query=secret',
    'https://bc.example.test#fragment',
    'https://bc.example.test?',
    'https://bc.example.test#',
    'http://localhost.evil.test',
    'http://128.0.0.1',
  ])('rejects unsafe base URL %s', async (baseUrl) => {
    const path = await configFile({ connections: [connection(baseUrl)] });
    await expect(loadDirectoryConnections(path)).rejects.toThrow(
      'Invalid BC directory configuration'
    );
    expect(() => new DirectoryClient([connection(baseUrl)])).toThrow();
  });

  it.each([
    'http://localhost:4722',
    'http://127.0.0.1:4722',
    'http://[::1]:4722',
    'https://bc.example.test',
  ])('accepts HTTPS or loopback URL %s', async (baseUrl) => {
    const path = await configFile({ connections: [connection(baseUrl)] });
    expect(await loadDirectoryConnections(path)).toEqual([connection(baseUrl)]);
  });

  it('requires exact schema, tenant UUID, scope uniqueness and at most twenty connections', async () => {
    const uniqueConnections = Array.from({ length: 20 }, (_, index) => ({
      ...connection(),
      environmentId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    const valid = await configFile({ connections: uniqueConnections });
    expect(await loadDirectoryConnections(valid)).toHaveLength(20);
    for (const value of [
      { connections: [connection(), connection()] },
      { connections: [...uniqueConnections, { ...connection(), environmentId: missingId }] },
      { connections: [{ ...connection(), tenantId: 'untrusted-tenant' }] },
      { connections: [{ ...connection(), browserCookie: 'forbidden' }] },
      { connections: [{ ...connection(), clientSecret: '' }] },
      { connections: [], unknown: true },
    ]) {
      const path = await configFile(value);
      await expect(loadDirectoryConnections(path)).rejects.toThrow(
        'Invalid BC directory configuration'
      );
    }
  });
});

describe('BC directory HTTP boundary', () => {
  it('reaches OAuth and both directory operations under the configured BC deployment prefix', async () => {
    const fixture = await upstream((request, res) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === `/onebrief${oauthPath}`) return send(res, 200, token);
      if (request.headers.authorization !== `Bearer ${token.access_token}`)
        return send(res, 403, { error: 'directory_scope_required' });
      if (path === `/onebrief${searchPath}`) return send(res, 200, searchResult);
      if (path === `/onebrief${resolvePath}`) return send(res, 200, resolveResult);
      return send(res, 404, { error: 'not_found' });
    });
    const client = new DirectoryClient([connection(`${fixture.baseUrl}/onebrief/`)]);
    expect(await client.search(scope, { kind: 'people', q: 'directory' })).toEqual(searchResult);
    expect(await client.resolve(scope, { kind: 'people', ids: [personId, missingId] })).toEqual(
      resolveResult
    );
  });
  it('uses fresh client-credentials OAuth for each operation and returns validated directory records', async () => {
    const fixture = await upstream();
    const client = new DirectoryClient([connection(fixture.baseUrl)]);
    expect(
      await client.search(scope, { kind: 'people', q: '  directory@example.test  ', offset: 20 })
    ).toEqual(searchResult);
    expect(await client.resolve(scope, { kind: 'people', ids: [personId, missingId] })).toEqual(
      resolveResult
    );
    expect(fixture.received).toHaveLength(4);
    expect(fixture.received.map((request) => request.method)).toEqual([
      'POST',
      'GET',
      'POST',
      'POST',
    ]);
    expect(fixture.received[0].body).toEqual({
      grant_type: 'client_credentials',
      client_id: 'private-client-id',
      client_secret: 'private-client-secret',
    });
    const search = new URL(fixture.received[1].url, fixture.baseUrl);
    expect(search.pathname).toBe(searchPath);
    expect(Object.fromEntries(search.searchParams)).toEqual({
      kind: 'people',
      q: 'directory@example.test',
      offset: '20',
      limit: '20',
    });
    expect(fixture.received[3].body).toEqual({ kind: 'people', ids: [personId, missingId] });
    for (const [index, request] of fixture.received.entries()) {
      expect(request.headers.cookie).toBeUndefined();
      expect(request.headers.authorization).toBe(
        index % 2 === 0 ? undefined : `Bearer ${token.access_token}`
      );
      if (index % 2 === 1) {
        expect(request.url).not.toContain('private-client');
        expect(JSON.stringify(request.body) ?? '').not.toContain('private-client');
      }
    }
  });

  it('keeps scope connections isolated and never falls back to another connection', async () => {
    const fixture = await upstream();
    const other = { ...scope, environmentId: missingId };
    const client = new DirectoryClient([connection(fixture.baseUrl)]);
    await expect(client.search(other, { kind: 'people', q: 'directory' })).rejects.toMatchObject({
      status: 503,
      message: 'BC directory is disconnected',
    });
    await expect(
      client.resolve({ ...scope, projectId: missingId }, { kind: 'people', ids: [personId] })
    ).rejects.toMatchObject({ status: 503 });
    expect(fixture.received).toEqual([]);
    expect(client.publicStatus(projectId, environmentId).status).toBe('configured');
    expect(fixture.received).toEqual([]);
  });

  it('fails OAuth authentication with incorrect private credentials before any directory request', async () => {
    const fixture = await upstream();
    const client = new DirectoryClient([
      { ...connection(fixture.baseUrl), clientSecret: 'wrong-secret' },
    ]);
    await expect(client.search(scope, { kind: 'people', q: 'directory' })).rejects.toMatchObject({
      status: 502,
      message: 'BC directory credential was rejected',
    });
    expect(fixture.received).toHaveLength(1);
  });

  it('rejects invalid requests before sending OAuth credentials', async () => {
    const fixture = await upstream();
    const client = new DirectoryClient([connection(fixture.baseUrl)]);
    for (const input of [
      { kind: 'people', q: ' ' },
      { kind: 'people', q: 'a' },
      { kind: 'people', q: 'a'.repeat(129) },
      { kind: 'roles', q: 'valid' },
      { kind: 'people', q: 'valid', offset: -1 },
      { kind: 'people', q: 'valid', offset: 10001 },
      { kind: 'people', q: 'valid', offset: 0.5 },
      { kind: 'people', q: 'valid', offset: Infinity },
    ])
      await expect(
        client.search(scope, input as Parameters<DirectoryClient['search']>[1])
      ).rejects.toThrow();
    for (const input of [
      { kind: 'people', ids: [] },
      { kind: 'people', ids: ['1'] },
      { kind: 'people', ids: ['50000000-0000-4000-8000-00000000000A'] },
      { kind: 'people', ids: [personId, personId] },
      { kind: 'groups', ids: ['01'] },
      { kind: 'organizations', ids: ['0'] },
      { kind: 'groups', ids: ['9007199254740992'] },
      { kind: 'groups', ids: Array.from({ length: 21 }, (_, index) => String(index + 1)) },
    ])
      await expect(
        client.resolve(scope, input as Parameters<DirectoryClient['resolve']>[1])
      ).rejects.toThrow();
    expect(fixture.received).toEqual([]);
    expect(
      directorySearchQuerySchema.parse({ kind: 'groups', q: '  ok  ', offset: '10000' })
    ).toEqual({ kind: 'groups', q: 'ok', offset: 10000 });
    expect(directoryResolveRequestSchema.parse({ kind: 'groups', ids: ['1'] })).toEqual({
      kind: 'groups',
      ids: ['1'],
    });
  });

  it.each(['organizations', 'groups'] as const)(
    'supports canonical numeric %s IDs',
    async (kind) => {
      const item = { id: '42', label: 'Scoped directory resource', email: null };
      const fixture = await upstream((request, res) => {
        if (request.url === oauthPath) return send(res, 200, token);
        send(res, 200, { ...binding, kind, items: [item], missingIds: ['43'] });
      });
      const client = new DirectoryClient([connection(fixture.baseUrl)]);
      expect(await client.resolve(scope, { kind, ids: ['42', '43'] })).toEqual({
        ...binding,
        kind,
        items: [item],
        missingIds: ['43'],
      });
    }
  );

  it.each([oauthPath, searchPath])(
    'sanitizes upstream authorization, scope, unavailable and contract errors at %s',
    async (stage) => {
      for (const [status, expectedStatus, message] of [
        [401, 502, 'BC directory credential was rejected'],
        [403, 502, 'BC directory credential scope was rejected'],
        [400, 502, 'BC directory returned an invalid response'],
        [404, 502, 'BC directory returned an invalid response'],
        [429, 503, 'BC directory is unavailable'],
        [500, 503, 'BC directory is unavailable'],
        [503, 503, 'BC directory is unavailable'],
      ] as const) {
        const fixture = await upstream((request, res) => {
          if (stage !== oauthPath && request.url === oauthPath) return send(res, 200, token);
          send(res, status, { error: 'private-client-secret', stack: 'confidential BC internals' });
        });
        const client = new DirectoryClient([connection(fixture.baseUrl)]);
        await expect(
          client.search(scope, { kind: 'people', q: 'directory' })
        ).rejects.toMatchObject({ status: expectedStatus, message });
        expect(fixture.received).toHaveLength(stage === oauthPath ? 1 : 2);
      }
    }
  );

  it.each([oauthPath, searchPath])(
    'does not follow redirects or forward secrets at %s',
    async (stage) => {
      const target = await upstream();
      const fixture = await upstream((request, res) => {
        if (stage !== oauthPath && request.url === oauthPath) return send(res, 200, token);
        res.writeHead(307, { location: `${target.baseUrl}/secret-collector` });
        res.end();
      });
      const client = new DirectoryClient([connection(fixture.baseUrl)]);
      await expect(client.search(scope, { kind: 'people', q: 'directory' })).rejects.toMatchObject({
        status: 502,
      });
      expect(target.received).toEqual([]);
      expect(fixture.received).toHaveLength(stage === oauthPath ? 1 : 2);
    }
  );

  it('does not retain upstream cookies as service authentication', async () => {
    const fixture = await upstream((request, res) => {
      if (request.url === oauthPath) {
        res.setHeader('set-cookie', 'bc_session=private-session; Path=/');
        return send(res, 200, token);
      }
      send(res, 401, { error: 'cookie_required' });
    });
    const client = new DirectoryClient([connection(fixture.baseUrl)]);
    await expect(client.search(scope, { kind: 'people', q: 'directory' })).rejects.toMatchObject({
      status: 502,
    });
    expect(fixture.received[1].headers.cookie).toBeUndefined();
  });

  it.each([
    { access_token: '', token_type: 'Bearer', expires_in: 300 },
    { access_token: 'header\r\ninjection', token_type: 'Bearer', expires_in: 300 },
    { access_token: 'token', token_type: 'Basic', expires_in: 300 },
    { access_token: 'token', token_type: 'Bearer', expires_in: 0 },
    { access_token: 'token', token_type: 'Bearer', expires_in: '300' },
    { token_type: 'Bearer', expires_in: 300 },
  ])('rejects malformed OAuth contracts without making a directory call', async (body) => {
    const fixture = await upstream((_request, res) => send(res, 200, body));
    await expect(
      new DirectoryClient([connection(fixture.baseUrl)]).search(scope, {
        kind: 'people',
        q: 'directory',
      })
    ).rejects.toMatchObject({ status: 502 });
    expect(fixture.received).toHaveLength(1);
  });

  it.each([
    { ...searchResult, sourceId: 'another-bc' },
    { ...searchResult, tenantId: missingId },
    { ...searchResult, kind: 'groups' },
    { ...searchResult, items: [person, person] },
    { ...searchResult, items: [{ ...person, id: '1' }] },
    { ...searchResult, items: [{ ...person, email: 'not-an-email' }] },
    { ...searchResult, items: [{ ...person, resetToken: 'private' }] },
    { ...searchResult, items: Array.from({ length: 21 }, () => person) },
    { ...searchResult, nextOffset: 0 },
    { ...searchResult, nextOffset: 10001 },
    { ...searchResult, internalRoster: ['private'] },
  ])('rejects incorrect scope, kind, IDs, pagination or private response fields', async (body) => {
    const fixture = await upstream((request, res) =>
      send(res, 200, request.url === oauthPath ? token : body)
    );
    await expect(
      new DirectoryClient([connection(fixture.baseUrl)]).search(scope, {
        kind: 'people',
        q: 'directory',
      })
    ).rejects.toMatchObject({ status: 502, message: 'BC directory returned an invalid response' });
  });

  it.each([
    { ...resolveResult, missingIds: [] },
    { ...resolveResult, missingIds: [personId] },
    { ...resolveResult, missingIds: [missingId, missingId] },
    { ...resolveResult, missingIds: ['50000000-0000-4000-8000-000000000003'] },
    { ...resolveResult, items: [person, person] },
    { ...resolveResult, sourceId: 'foreign-source' },
    { ...resolveResult, tenantId: missingId },
    { ...resolveResult, kind: 'groups' },
    { ...resolveResult, items: [{ ...person, id: missingId }], missingIds: [missingId] },
  ])(
    'requires resolve items and missing IDs to partition exactly the requested set',
    async (body) => {
      const fixture = await upstream((request, res) =>
        send(res, 200, request.url === oauthPath ? token : body)
      );
      await expect(
        new DirectoryClient([connection(fixture.baseUrl)]).resolve(scope, {
          kind: 'people',
          ids: [personId, missingId],
        })
      ).rejects.toMatchObject({ status: 502 });
    }
  );

  it('returns explicitly missing IDs rather than fabricated directory entities', async () => {
    const fixture = await upstream((request, res) =>
      send(
        res,
        200,
        request.url === oauthPath
          ? token
          : { ...binding, kind: 'people', items: [], missingIds: [personId] }
      )
    );
    expect(
      await new DirectoryClient([connection(fixture.baseUrl)]).resolve(scope, {
        kind: 'people',
        ids: [personId],
      })
    ).toEqual({ ...binding, kind: 'people', items: [], missingIds: [personId] });
  });

  it.each([oauthPath, searchPath])(
    'bounds announced and streamed response bytes at %s',
    async (stage) => {
      for (const announced of [true, false]) {
        const fixture = await upstream((request, res) => {
          if (stage !== oauthPath && request.url === oauthPath) return send(res, 200, token);
          res.writeHead(200, {
            'content-type': 'application/json',
            ...(announced ? { 'content-length': '65537' } : {}),
          });
          res.write(' '.repeat(32768));
          res.end(' '.repeat(32769));
        });
        await expect(
          new DirectoryClient([connection(fixture.baseUrl)]).search(scope, {
            kind: 'people',
            q: 'directory',
          })
        ).rejects.toMatchObject({ status: 502 });
        expect(fixture.received).toHaveLength(stage === oauthPath ? 1 : 2);
      }
    }
  );

  it.each([oauthPath, searchPath])(
    'rejects malformed JSON and wrong content type at %s',
    async (stage) => {
      for (const contentType of ['application/json', 'text/html', 'application/jsonp']) {
        const fixture = await upstream((request, res) => {
          if (stage !== oauthPath && request.url === oauthPath) return send(res, 200, token);
          res.writeHead(200, { 'content-type': contentType });
          res.end(
            contentType === 'application/json'
              ? 'private-client-secret malformed JSON'
              : JSON.stringify(stage === oauthPath ? token : searchResult)
          );
        });
        await expect(
          new DirectoryClient([connection(fixture.baseUrl)]).search(scope, {
            kind: 'people',
            q: 'directory',
          })
        ).rejects.toMatchObject({
          status: 502,
          message: 'BC directory returned an invalid response',
        });
      }
    }
  );

  it('accepts an exactly 64-KiB OAuth response and validates the subsequent directory contract', async () => {
    const paddingLength = 65536 - Buffer.byteLength(JSON.stringify({ ...token, padding: '' }));
    const fixture = await upstream((request, res) =>
      send(
        res,
        200,
        request.url === oauthPath ? { ...token, padding: 'x'.repeat(paddingLength) } : searchResult
      )
    );
    expect(
      await new DirectoryClient([connection(fixture.baseUrl)]).search(scope, {
        kind: 'people',
        q: 'directory',
      })
    ).toEqual(searchResult);
  });

  it.each([oauthPath, searchPath])(
    'applies the deadline to stalled response bodies at %s',
    async (stage) => {
      const fixture = await upstream((request, res) => {
        if (stage !== oauthPath && request.url === oauthPath) return send(res, 200, token);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{');
      });
      await expect(
        new DirectoryClient([connection(fixture.baseUrl)], { timeoutMs: 100 }).search(scope, {
          kind: 'people',
          q: 'directory',
        })
      ).rejects.toMatchObject({ status: 503, message: 'BC directory is unavailable' });
    }
  );

  it('uses one total deadline rather than resetting it after OAuth', async () => {
    const fixture = await upstream(async (request, res) => {
      await delay(150);
      if (!res.destroyed) send(res, 200, request.url === oauthPath ? token : searchResult);
    });
    const client = new DirectoryClient([connection(fixture.baseUrl)], { timeoutMs: 250 });
    await expect(client.search(scope, { kind: 'people', q: 'directory' })).rejects.toMatchObject({
      status: 503,
    });
    expect(fixture.received).toHaveLength(2);
  });

  it('sanitizes socket failures and retains configured status without claiming health', async () => {
    const fixture = await upstream((_request, res) => {
      res.destroy();
    });
    const client = new DirectoryClient([connection(fixture.baseUrl)]);
    const result = client.search(scope, { kind: 'people', q: 'directory' });
    await expect(result).rejects.toBeInstanceOf(HttpError);
    await expect(result).rejects.toMatchObject({
      status: 503,
      message: 'BC directory is unavailable',
    });
    expect(client.publicStatus(projectId, environmentId)).toEqual({
      status: 'configured',
      label: 'Local BC',
      binding,
    });
    expect(fixture.received).toHaveLength(1);
  });

  it.each([0, -1, Infinity, NaN, 3001])(
    'rejects nonfinite or unbounded timeout %s',
    (timeoutMs) => {
      expect(() => new DirectoryClient([], { timeoutMs })).toThrow('at most 3000 ms');
    }
  );
});
