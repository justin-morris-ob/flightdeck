import type { DemoConfig } from './contracts.ts';
import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import type { IncomingMessage } from 'node:http';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FlightdeckAuthorizationError,
  FlightdeckContractError,
  FlightdeckProvider,
  enforceFlightdeckPolicy,
} from '@flightdeck/openfeature-provider';
import { NOOP_PROVIDER, OpenFeature } from '@openfeature/server-sdk';
import { ZodError } from 'zod';

import {
  demoConfigSchema,
  demoFlags,
  demoPersonas,
  demoRequestSchema,
  demoResultSchema,
  demoScenarios,
} from './contracts.ts';

const root = resolve(fileURLToPath(new URL('../../dist/consumer-demo/', import.meta.url)));
const configFile = new URL('../../.local/consumer-demo/config.json', import.meta.url);
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ZodError([]);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new ZodError([]);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function createConsumerDemo(config: DemoConfig, port: number) {
  const fixture = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = req.url?.startsWith('/unavailable/') ? 503 : 200;
    res.end(JSON.stringify({ simulatedTransportFailure: true }));
  });
  await new Promise<void>((resolveReady, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolveReady);
  });
  const fixtureAddress = fixture.address();
  if (!fixtureAddress || typeof fixtureAddress === 'string')
    throw new Error('Demo transport fixture failed');
  const domains: string[] = [];
  async function client(baseUrl: string, token: string): Promise<Client> {
    const domain = `flightdeck-demo-${randomUUID()}`;
    domains.push(domain);
    await OpenFeature.setProviderAndWait(
      domain,
      new FlightdeckProvider({ ...config, baseUrl, token, timeoutMs: 1000 })
    );
    return OpenFeature.getClient(domain);
  }
  let clients: Record<string, Client>;
  try {
    clients = {
      live: await client(config.baseUrl, config.token),
      unauthorized: await client(config.baseUrl, `fd_${'0'.repeat(64)}`),
      unavailable: await client(
        `http://127.0.0.1:${fixtureAddress.port}/unavailable/`,
        'demo-fixture-token'
      ),
      malformed: await client(
        `http://127.0.0.1:${fixtureAddress.port}/malformed/`,
        'demo-fixture-token'
      ),
    };
  } catch (error) {
    fixture.close();
    for (const domain of domains) OpenFeature.setProvider(domain, NOOP_PROVIDER);
    throw error;
  }
  const server = createServer(async (req, res) => {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host ?? ''))
      return send(403, { error: 'Loopback host required' });
    if (
      req.headers.origin &&
      ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
    )
      return send(403, { error: 'Origin not allowed' });
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (req.method === 'GET' && url.pathname === '/healthz')
        return send(200, { ok: true, name: 'flightdeck-consumer-demo', mode: 'local-development' });
      if (req.method === 'GET' && url.pathname === '/api/demo')
        return send(200, {
          personas: demoPersonas,
          flags: demoFlags,
          scenarios: demoScenarios,
          scope: {
            projectId: config.projectId,
            environmentId: config.environmentId,
            tenantId: config.tenantId,
            sourceId: config.sourceId,
          },
        });
      if (req.method === 'POST' && url.pathname === '/api/demo/evaluate') {
        const input = demoRequestSchema.parse(await body(req));
        const persona = demoPersonas.find((item) => item.id === input.personaId)!;
        const flag = demoFlags.find((item) => item.key === input.flagKey)!;
        const context: EvaluationContext = {
          targetingKey: persona.subjectId,
          tenantId:
            input.scenario === 'wrong-tenant' ? 'denied-consumer-demo-tenant' : config.tenantId,
          sourceId: config.sourceId,
          organizationIds: [...persona.organizationIds],
          groupIds: [...persona.groupIds],
        };
        const selected = clients[input.scenario] ?? clients.live;
        const details =
          flag.type === 'boolean'
            ? await selected.getBooleanDetails(flag.key, flag.fallback, context)
            : flag.type === 'string'
              ? await selected.getStringDetails(flag.key, flag.fallback, context)
              : flag.type === 'number'
                ? await selected.getNumberDetails(flag.key, flag.fallback, context)
                : await selected.getObjectDetails(flag.key, flag.fallback, context);
        enforceFlightdeckPolicy(details);
        return send(
          200,
          demoResultSchema.parse({
            context,
            value: details.value,
            reason: details.reason ?? 'UNKNOWN',
            ...(details.errorCode ? { errorCode: details.errorCode } : {}),
            metadata: details.flagMetadata,
            scenario: input.scenario,
            flagKey: flag.key,
          })
        );
      }
      if (req.method !== 'GET' || url.pathname.startsWith('/api/'))
        return send(404, { error: 'Not found' });
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (!file.startsWith(`${root}${sep}`)) return send(404, { error: 'Not found' });
      const content = await readFile(file);
      res.writeHead(200, {
        'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
      });
      res.end(content);
    } catch (error) {
      if (error instanceof FlightdeckAuthorizationError)
        return send(502, {
          error:
            'Flightdeck denied this evaluation. Authorization errors are not a false decision or an accepted fallback.',
          category: 'authorization',
        });
      if (error instanceof FlightdeckContractError)
        return send(502, {
          error: 'The evaluation context or service contract was rejected.',
          category: 'contract',
        });
      if (error instanceof ZodError || error instanceof SyntaxError)
        return send(400, {
          error:
            'Choose a known demo persona, capability and scenario. Arbitrary evaluation context is not accepted.',
        });
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT')
        return send(404, { error: 'Demo asset not found; run pnpm build.' });
      return send(500, { error: 'Consumer demo failed; check backend configuration.' });
    }
  });
  async function close() {
    await new Promise<void>((done) => server.close(() => done()));
    await new Promise<void>((done) => fixture.close(() => done()));
    for (const domain of domains) OpenFeature.setProvider(domain, NOOP_PROVIDER);
  }
  return { server, close };
}

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.FLIGHTDECK_MODE !== 'local-development')
    throw new Error(
      'Consumer demo requires explicit local-development mode and refuses production.'
    );
  const port = Number(process.env.DEMO_PORT ?? 4722);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid DEMO_PORT');
  const config = demoConfigSchema.parse(JSON.parse(await readFile(configFile, 'utf8')));
  const app = await createConsumerDemo(config, port);
  app.server.listen(port, '127.0.0.1', () =>
    console.log(`Flightdeck consumer demo http://localhost:${port}`)
  );
  let closing = false;
  const stop = () => {
    if (!closing) {
      closing = true;
      void app.close();
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  app.server.on('error', () => {
    console.error('Consumer demo could not listen on the configured port.');
    stop();
    process.exitCode = 1;
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch {
    console.error(
      'Consumer demo startup failed. Run pnpm demo:seed and pnpm build; check local mode and port.'
    );
    process.exitCode = 1;
  }
}
