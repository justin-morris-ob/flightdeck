import {
  createServer,
  request,
  type ClientRequest,
  type IncomingMessage,
  type RequestListener,
} from 'node:http';

const maximumBytes = 64 * 1024;
const deadlineMs = 3000;
const allowedRoutes: Record<string, string> = {
  '/api/external/oauth/token': 'POST',
  '/api/external/flightdeck-directory/v1/search': 'GET',
  '/api/external/flightdeck-directory/v1/resolve': 'POST',
};

export function validateBCOrigin(value: string, port: 4740 | 4741): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BC demo requires a valid loopback HTTP origin.');
  }
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== String(port) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`BC demo requires a loopback HTTP origin on port ${port}.`);
  }
  return url.origin;
}

async function readBounded(message: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of message) {
    const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBytes) throw new Error('Relay body exceeds its byte limit.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export interface DirectoryRelay {
  origin: 'http://localhost:4743';
  /** Only path/method counts: never headers, query strings, bodies or credentials. */
  forwardedRequests: ReadonlyMap<string, number>;
  close: () => Promise<void>;
}

/** Actual HTTP forwarding only; stopping this listener creates a real authoring outage. */
export async function startDirectoryRelay(bcBackendOrigin: string): Promise<DirectoryRelay> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The local directory recording relay refuses production mode.');
  }
  const upstreamOrigin = validateBCOrigin(bcBackendOrigin, 4741);
  const forwardedRequests = new Map<string, number>();
  const handleRequest: RequestListener = async (incoming, outgoing) => {
    let upstream: ClientRequest | undefined;
    let upstreamResponse: IncomingMessage | undefined;
    const timer = setTimeout(() => {
      upstream?.destroy();
      upstreamResponse?.destroy();
      incoming.destroy();
      outgoing.destroy();
    }, deadlineMs);
    const abort = () => {
      upstream?.destroy();
      upstreamResponse?.destroy();
    };
    outgoing.once('close', abort);
    try {
      // Require origin-form targets; never accept a caller-selected upstream host.
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        outgoing.writeHead(400).end();
        return;
      }
      const url = new URL(incoming.url, 'http://localhost:4743');
      if (allowedRoutes[url.pathname] !== incoming.method) {
        outgoing.writeHead(404).end();
        return;
      }
      const body = await readBounded(incoming);
      const headers: Record<string, string> = { 'accept-encoding': 'identity' };
      for (const name of ['accept', 'content-type', 'authorization']) {
        const value = incoming.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      if (body.length) headers['content-length'] = String(body.length);
      const key = `${incoming.method} ${url.pathname}`;
      forwardedRequests.set(key, (forwardedRequests.get(key) ?? 0) + 1);
      const { promise, resolve, reject } = Promise.withResolvers<{
        status: number;
        contentType?: string;
        body: Buffer;
      }>();
      upstream = request(
        new URL(`${url.pathname}${url.search}`, upstreamOrigin),
        { method: incoming.method, headers, agent: false, maxHeaderSize: maximumBytes },
        (response) => {
          upstreamResponse = response;
          // Do not follow or return redirect locations to a credential-bearing caller.
          if ((response.statusCode ?? 502) >= 300 && (response.statusCode ?? 502) < 400) {
            response.destroy();
            reject(new Error('Relay redirects are denied.'));
            return;
          }
          void readBounded(response).then(
            (responseBody) =>
              resolve({
                status: response.statusCode ?? 502,
                contentType: response.headers['content-type'],
                body: responseBody,
              }),
            reject
          );
        }
      );
      upstream.once('error', reject);
      upstream.end(body);
      const result = await promise;
      outgoing.writeHead(result.status, {
        ...(result.contentType ? { 'content-type': result.contentType } : {}),
        'content-length': String(result.body.length),
        'cache-control': 'no-store',
      });
      outgoing.end(result.body);
    } catch {
      abort();
      // A failed transport is never replaced by invented BC JSON or a successful status.
      outgoing.destroy();
    } finally {
      clearTimeout(timer);
      outgoing.off('close', abort);
    }
  };
  // Own both loopback families: localhost must never resolve to an unrelated listener.
  const servers = ['127.0.0.1', '::1'].map((host) => {
    const server = createServer({ maxHeaderSize: maximumBytes }, handleRequest);
    server.requestTimeout = deadlineMs;
    server.headersTimeout = deadlineMs;
    server.setTimeout(deadlineMs, (socket) => socket.destroy());
    server.maxHeadersCount = 40;
    server.maxConnections = 20;
    return { host, server };
  });
  const close = async () => {
    await Promise.all(
      servers.map(async ({ server }) => {
        if (!server.listening) return;
        const closing = Promise.withResolvers<void>();
        server.close((error) => (error ? closing.reject(error) : closing.resolve()));
        server.closeAllConnections();
        await closing.promise;
      })
    );
  };
  try {
    for (const { host, server } of servers) {
      const listening = Promise.withResolvers<void>();
      server.once('error', listening.reject);
      server.listen({ port: 4743, host, ipv6Only: host === '::1' }, () => {
        server.off('error', listening.reject);
        listening.resolve();
      });
      await listening.promise;
    }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    origin: 'http://localhost:4743',
    forwardedRequests,
    close,
  };
}
