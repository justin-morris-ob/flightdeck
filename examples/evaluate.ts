import type { Evaluation } from '../shared/contracts.ts';
import type { EvaluationContext, TypedValue } from '../shared/targeting.ts';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluationSchema, flagKeySchema, scopePath } from '../shared/contracts.ts';
import { localEnvironments, localProjects } from '../shared/fixtures.ts';
import { contextSchema, valueSchema } from '../shared/targeting.ts';

export interface EvaluateFlagOptions {
  baseUrl: string;
  token: string;
  projectId: string;
  environmentId: string;
  key: string;
  fallback: TypedValue;
  context: EvaluationContext;
  timeoutMs?: number;
}

export type EvaluationResult =
  | (Evaluation & { source: 'decision' })
  | {
      source: 'fallback';
      value: TypedValue;
      reason: 'not-found' | 'unavailable' | 'invalid-response';
      revision: null;
    };

export class EvaluationAuthorizationError extends Error {
  status: number;

  constructor(status: number) {
    super(`Flightdeck authorization failed (${status}); fallback is not permitted.`);
    this.name = 'EvaluationAuthorizationError';
    this.status = status;
  }
}

export async function evaluateFlag(options: EvaluateFlagOptions): Promise<EvaluationResult> {
  const { baseUrl, token, projectId, environmentId } = options;
  const fallback = valueSchema.parse(options.fallback);
  const context = contextSchema.parse(options.context);
  const key = flagKeySchema.parse(options.key);
  const timeoutMs = options.timeoutMs ?? 3000;
  if (!token) throw new Error('A backend evaluation credential is required.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 4_294_967_295) {
    throw new Error('timeoutMs must be a positive finite integer no greater than 4294967295.');
  }
  const endpoint = new URL(
    `${scopePath(projectId, environmentId)}/evaluate/${encodeURIComponent(key)}`,
    baseUrl
  );
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('Flightdeck baseUrl must use HTTP or HTTPS.');
  }
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ context }),
      redirect: 'error',
      signal,
    });
  } catch {
    return { source: 'fallback', value: fallback, reason: 'unavailable', revision: null };
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new EvaluationAuthorizationError(response.status);
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return { source: 'fallback', value: fallback, reason: 'not-found', revision: null };
  }
  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    await response.body?.cancel();
    return { source: 'fallback', value: fallback, reason: 'unavailable', revision: null };
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Flightdeck rejected evaluation (${response.status}).`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      source: 'fallback',
      value: fallback,
      reason: signal.aborted ? 'unavailable' : 'invalid-response',
      revision: null,
    };
  }
  const parsed = evaluationSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.key !== key ||
    parsed.data.projectId !== projectId ||
    parsed.data.environmentId !== environmentId ||
    parsed.data.value.type !== fallback.type
  ) {
    return { source: 'fallback', value: fallback, reason: 'invalid-response', revision: null };
  }
  return { source: 'decision', ...parsed.data };
}

async function main(): Promise<void> {
  const [key, fallbackArgument, contextArgument, ...extra] = process.argv.slice(2);
  if (!key || !fallbackArgument || extra.length) {
    throw new Error('Usage: node examples/evaluate.ts <key> <tagged-fallback-json> [context-json]');
  }
  const fallback = valueSchema.parse(JSON.parse(fallbackArgument));
  const context = contextSchema.parse(
    contextArgument ? JSON.parse(contextArgument) : { tenantId: 'local-tenant', attributes: {} }
  );
  const token = process.env.FLIGHTDECK_EVALUATION_TOKEN;
  if (!token) throw new Error('Set FLIGHTDECK_EVALUATION_TOKEN in the backend environment.');
  const result = await evaluateFlag({
    baseUrl: process.env.FLIGHTDECK_BASE_URL ?? 'http://localhost:4721',
    token,
    projectId: localProjects[0].id,
    environmentId: localEnvironments[0].id,
    key,
    fallback,
    context,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Evaluation failed.');
    process.exitCode = 1;
  }
}
