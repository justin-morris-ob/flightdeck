import type { FileHandle } from 'node:fs/promises';

import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

import { z } from 'zod';

import { HttpError } from '@onebrief/atlas-bff-kit';

import {
  directoryBindingSchema,
  directoryIdSchema,
  directoryKindSchema,
  directoryResolveSchema,
  directorySearchSchema,
  validDirectoryId,
  type DirectoryKind,
  type DirectoryStatus,
} from '../shared/directory.ts';

const maxResponseBytes = 65536;
const defaultTimeoutMs = 3000;

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
      !url.username &&
      !url.password &&
      !value.includes('?') &&
      !value.includes('#')
    );
  } catch {
    return false;
  }
}

const connectionSchema = directoryBindingSchema.extend({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  label: z.string().trim().min(1).max(120),
  baseUrl: z.string().max(2048).refine(validBaseUrl),
  tenantId: z.guid().toLowerCase(),
  clientId: z.string().min(1).max(1024),
  clientSecret: z.string().min(1).max(4096),
});
const connectionsSchema = z
  .array(connectionSchema)
  .max(20)
  .superRefine((values, context) => {
    const scopes = new Set<string>();
    for (const connection of values) {
      const scope = `${connection.projectId}/${connection.environmentId}`;
      if (scopes.has(scope))
        context.addIssue({ code: 'custom', message: 'Duplicate directory scope' });
      scopes.add(scope);
    }
  });

export type DirectoryConnection = z.infer<typeof connectionSchema>;
export type DirectoryScope = Pick<DirectoryConnection, 'projectId' | 'environmentId'>;

/** Only the absence of a configured path means disconnected; an enabled bad file fails startup. */
export async function loadDirectoryConnections(path?: string): Promise<DirectoryConnection[]> {
  if (path === undefined) return [];
  let file: FileHandle | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o7777) !== 0o600 || info.size > maxResponseBytes)
      throw new Error('Invalid private file');
    const buffer = Buffer.alloc(maxResponseBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maxResponseBytes) throw new Error('Oversized private file');
    const value: unknown = JSON.parse(buffer.subarray(0, length).toString('utf8'));
    return z.strictObject({ connections: connectionsSchema }).parse(value).connections;
  } catch {
    // Never include a file path, parser input or credential value in startup errors.
    throw new Error('Invalid BC directory configuration; require a private mode-0600 JSON file');
  } finally {
    await file?.close();
  }
}

export const directorySearchQuerySchema = z.strictObject({
  kind: directoryKindSchema,
  q: z.string().trim().min(2).max(128),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const directoryResolveRequestSchema = z
  .strictObject({
    kind: directoryKindSchema,
    ids: z.array(directoryIdSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    if (new Set(value.ids).size !== value.ids.length)
      context.addIssue({ code: 'custom', message: 'Directory IDs must be unique', path: ['ids'] });
    if (value.ids.some((id) => !validDirectoryId(value.kind, id)))
      context.addIssue({ code: 'custom', message: 'Invalid directory ID', path: ['ids'] });
  });
export type DirectorySearchQuery = z.input<typeof directorySearchQuerySchema>;
export type DirectoryResolveRequest = z.infer<typeof directoryResolveRequestSchema>;
export type DirectorySearchResult = z.infer<typeof directorySearchSchema>;
export type DirectoryResolveResult = z.infer<typeof directoryResolveSchema>;

const tokenSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(8192)
    .regex(/^[\x21-\x7e]+$/),
  token_type: z.string().regex(/^Bearer$/i),
  expires_in: z.number().int().positive().finite(),
});

function invalidContract(): HttpError {
  return new HttpError(502, 'BC directory returned an invalid response');
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) throw new HttpError(502, 'BC directory credential was rejected');
    if (response.status === 403)
      throw new HttpError(502, 'BC directory credential scope was rejected');
    if (response.status >= 500 || response.status === 429)
      throw new HttpError(503, 'BC directory is unavailable');
    throw invalidContract();
  }
  if (
    response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
    'application/json'
  ) {
    await response.body?.cancel();
    throw invalidContract();
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > maxResponseBytes) {
    await response.body?.cancel();
    throw invalidContract();
  }
  if (!response.body) throw invalidContract();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxResponseBytes) {
        await reader.cancel();
        throw invalidContract();
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks, length).toString('utf8')) as unknown;
    } catch {
      throw invalidContract();
    }
  } finally {
    reader.releaseLock();
  }
}

function validateItems(
  connection: DirectoryConnection,
  kind: DirectoryKind,
  result: DirectorySearchResult | DirectoryResolveResult
): void {
  if (
    result.sourceId !== connection.sourceId ||
    result.tenantId !== connection.tenantId ||
    result.kind !== kind ||
    new Set(result.items.map((item) => item.id)).size !== result.items.length ||
    result.items.some((item) => !validDirectoryId(kind, item.id))
  )
    throw invalidContract();
}

function directoryUrl(connection: DirectoryConnection, path: string): URL {
  const url = new URL(connection.baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${path}`;
  return url;
}

/** Authoring-only transport. The route must authorize its operator and scope before calling. */
export class DirectoryClient {
  #connections: DirectoryConnection[];
  #timeoutMs: number;

  constructor(connections: readonly DirectoryConnection[], options: { timeoutMs?: number } = {}) {
    this.#connections = connectionsSchema.parse(connections);
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > defaultTimeoutMs)
      throw new Error('Directory timeout must be finite, positive and at most 3000 ms');
    this.#timeoutMs = timeoutMs;
  }

  publicStatus(projectId: string, environmentId: string): DirectoryStatus {
    const connection = this.#find({ projectId, environmentId });
    return connection
      ? {
          status: 'configured',
          label: connection.label,
          binding: { sourceId: connection.sourceId, tenantId: connection.tenantId },
        }
      : { status: 'disconnected' };
  }

  async search(scope: DirectoryScope, input: DirectorySearchQuery): Promise<DirectorySearchResult> {
    const query = directorySearchQuerySchema.parse(input);
    return this.#request(scope, async (connection, token, signal) => {
      const url = directoryUrl(connection, '/api/external/flightdeck-directory/v1/search');
      url.search = new URLSearchParams({
        ...query,
        offset: String(query.offset),
        limit: '20',
      }).toString();
      const response = await this.#fetch(url, { method: 'GET' }, token, signal);
      const parsed = directorySearchSchema.safeParse(await readResponse(response));
      if (!parsed.success) throw invalidContract();
      validateItems(connection, query.kind, parsed.data);
      if (parsed.data.nextOffset !== null && parsed.data.nextOffset <= query.offset)
        throw invalidContract();
      return parsed.data;
    });
  }

  async resolve(
    scope: DirectoryScope,
    input: DirectoryResolveRequest
  ): Promise<DirectoryResolveResult> {
    const request = directoryResolveRequestSchema.parse(input);
    return this.#request(scope, async (connection, token, signal) => {
      const response = await this.#fetch(
        directoryUrl(connection, '/api/external/flightdeck-directory/v1/resolve'),
        { method: 'POST', body: JSON.stringify(request) },
        token,
        signal
      );
      const parsed = directoryResolveSchema.safeParse(await readResponse(response));
      if (!parsed.success) throw invalidContract();
      const result = parsed.data;
      validateItems(connection, request.kind, result);
      const returned = [...result.items.map((item) => item.id), ...result.missingIds];
      const requested = new Set(request.ids);
      if (
        new Set(returned).size !== returned.length ||
        returned.length !== requested.size ||
        returned.some((id) => !requested.has(id))
      )
        throw invalidContract();
      return result;
    });
  }

  #find(scope: DirectoryScope): DirectoryConnection | undefined {
    return this.#connections.find(
      (connection) =>
        connection.projectId === scope.projectId && connection.environmentId === scope.environmentId
    );
  }

  #fetch(url: URL, init: RequestInit, token: string | undefined, signal: AbortSignal) {
    return fetch(url, {
      ...init,
      signal,
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  async #request<T>(
    scope: DirectoryScope,
    operation: (connection: DirectoryConnection, token: string, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const connection = this.#find(scope);
    if (!connection) throw new HttpError(503, 'BC directory is disconnected');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(
        directoryUrl(connection, '/api/external/oauth/token'),
        {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: connection.clientId,
            client_secret: connection.clientSecret,
          }),
        },
        undefined,
        controller.signal
      );
      const parsed = tokenSchema.safeParse(await readResponse(response));
      if (!parsed.success) throw invalidContract();
      return await operation(connection, parsed.data.access_token, controller.signal);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'BC directory is unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}
