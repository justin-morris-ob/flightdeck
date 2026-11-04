import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';

import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z, ZodError } from 'zod';

import { HttpError } from '@onebrief/atlas-bff-kit';

import { sessionSchema } from '../shared/contracts.ts';
import { localOperators } from '../shared/fixtures.ts';
import {
  assertLocalDevelopment,
  authenticate,
  clearSessionCookie,
  readOperator,
  sessionCookie,
  signSession,
} from './auth.ts';
import { createRoutes } from './routes.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'JSON content type required');
  const { promise, resolve: resolveBody, reject } = Promise.withResolvers<unknown>();
  const chunks: Buffer[] = [];
  let size = 0;
  let exceeded = false;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > 32768) {
      exceeded = true;
      chunks.length = 0;
      reject(new HttpError(413, 'Request body exceeds 32 KiB'));
    } else if (!exceeded) chunks.push(chunk);
  });
  req.on('error', reject);
  req.on('end', () => {
    if (exceeded) return;
    try {
      resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(new HttpError(400, 'Invalid JSON'));
    }
  });
  return promise;
}

export function createApplication({
  pool,
  sessionSecret,
  port = 4721,
  shellOrigin = 'http://localhost:4720',
}: {
  pool: Pool;
  sessionSecret: string;
  port?: number;
  shellOrigin?: string;
}) {
  assertLocalDevelopment();
  if (sessionSecret.length < 32)
    throw new Error('A private session secret of at least 32 characters is required');
  const shellUrl = new URL(shellOrigin);
  if (!['localhost', '127.0.0.1'].includes(shellUrl.hostname) || shellUrl.protocol !== 'http:')
    throw new Error('Local shell origin must use loopback HTTP');
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    shellOrigin,
  ]);
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const routes = Object.entries(createRoutes(pool)).map(([key, handler]) => {
    const [method, path] = key.split(' ');
    const names: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
        names.push(name);
        return '([^/]+)';
      })}$`
    );
    return { method, names, pattern, handler };
  });
  const server = createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cache-control', 'no-store');
    const send = (status: number, body?: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    try {
      if (!allowedHosts.has(req.headers.host ?? ''))
        throw new HttpError(403, 'Loopback host required');
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, 'Origin not allowed');
      if (origin) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('access-control-allow-credentials', 'true');
        res.setHeader('vary', 'origin');
      }
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (req.method === 'OPTIONS') {
        res.setHeader('access-control-allow-headers', 'authorization, content-type');
        res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        return send(204);
      }
      if (url.pathname === '/healthz' && req.method === 'GET') {
        await pool.query('SELECT 1');
        return send(200, { name: 'flightdeck', ok: true, mode: 'local-development' });
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/v1/dev/operators' && req.method === 'GET') {
          return send(200, {
            items: localOperators.map(({ kind: _kind, ...operator }) => operator),
          });
        }
        if (url.pathname === '/api/v1/dev/session' && req.method === 'GET') {
          const operator = readOperator(req, sessionSecret);
          return send(200, {
            session: operator ? sessionSchema.parse({ mode: 'local-development', operator }) : null,
          });
        }
        if (url.pathname === '/api/v1/dev/session' && req.method === 'POST') {
          const { operatorId } = z
            .strictObject({ operatorId: z.string() })
            .parse(await readJson(req));
          const operator = localOperators.find((item) => item.id === operatorId);
          if (!operator) throw new HttpError(400, 'Unknown development operator');
          res.setHeader('set-cookie', sessionCookie(signSession(operator.id, sessionSecret)));
          return send(200, sessionSchema.parse({ mode: 'local-development', operator }));
        }
        if (url.pathname === '/api/v1/session') {
          if (req.method === 'DELETE') {
            res.setHeader('set-cookie', clearSessionCookie());
            return send(204);
          }
          if (req.method === 'GET') {
            const operator = readOperator(req, sessionSecret);
            if (!operator) throw new HttpError(401, 'Local development session required');
            return send(200, sessionSchema.parse({ mode: 'local-development', operator }));
          }
        }
        const principal = await authenticate(req, pool, sessionSecret);
        if (!principal) throw new HttpError(401, 'Authentication required');
        for (const route of routes) {
          if (route.method !== req.method) continue;
          const match = url.pathname.match(route.pattern);
          if (!match) continue;
          const params = Object.fromEntries(
            route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])])
          );
          const body = ['POST', 'PATCH'].includes(req.method ?? '')
            ? await readJson(req)
            : undefined;
          const result = await route.handler({ principal, params, query: url.searchParams, body });
          return send(result === undefined ? 204 : 200, result);
        }
        throw new HttpError(404, 'Not found');
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) throw new HttpError(404, 'Not found');
      await serveStatic(url.pathname, req.method === 'HEAD', res);
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof ZodError || error instanceof URIError
            ? 400
            : 500;
      if (status === 500)
        console.error(
          'Flightdeck request failed',
          error instanceof Error ? error.name : 'Unknown error'
        );
      send(status, {
        error:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? 'Invalid request'
              : 'Internal error',
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

async function serveStatic(pathname: string, head: boolean, res: ServerResponse) {
  if (pathname === '/remoteEntry.js') {
    res.writeHead(302, { location: '/remote/remoteEntry.js', 'access-control-allow-origin': '*' });
    res.end();
    return;
  }
  const remoteAsset = pathname.startsWith('/remote/');
  const remote = remoteAsset || pathname === '/atlas-app.json';
  const directory = resolve(root, remote ? 'dist/remote' : 'dist/web');
  const relative = decodeURIComponent(
    remoteAsset ? pathname.slice('/remote/'.length) : pathname.slice(1)
  );
  let file = resolve(directory, relative || 'index.html');
  if (!file.startsWith(directory + sep)) throw new HttpError(403, 'Forbidden');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    if (remote || extname(relative)) throw new HttpError(404, 'Asset not found');
    file = resolve(directory, 'index.html');
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    throw new HttpError(404, 'Build Flightdeck with pnpm build before starting');
  }
  res.setHeader('content-type', contentTypes[extname(file)] ?? 'application/octet-stream');
  res.setHeader('access-control-allow-origin', '*');
  res.removeHeader('access-control-allow-credentials');
  res.statusCode = 200;
  res.end(head ? undefined : bytes);
}
