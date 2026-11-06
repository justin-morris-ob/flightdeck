import { ErrorCode, StandardResolutionReasons } from '@openfeature/server-sdk';
import { z } from 'zod';
export class FlightdeckAuthorizationError extends Error {
    status;
    constructor(status) {
        super('Flightdeck authorization failed; fallback is not permitted.');
        this.name = 'FlightdeckAuthorizationError';
        this.status = status;
    }
}
export class FlightdeckContractError extends Error {
    constructor() {
        super('Flightdeck rejected the evaluation contract; fallback is not permitted.');
        this.name = 'FlightdeckContractError';
    }
}
export function enforceFlightdeckPolicy(details) {
    const category = details.flagMetadata.flightdeckErrorCategory;
    if (category === 'authorization') {
        throw new FlightdeckAuthorizationError(details.flagMetadata.httpStatus === 401 ? 401 : 403);
    }
    if (category === 'invalid-context' ||
        category === 'rejected' ||
        details.errorCode === ErrorCode.INVALID_CONTEXT ||
        details.errorCode === ErrorCode.TARGETING_KEY_MISSING) {
        throw new FlightdeckContractError();
    }
    return details;
}
const encoder = new TextEncoder();
const maxResponseBytes = 256 * 1024;
const maxContextBytes = 32 * 1024;
const flagKey = z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_-]*$/);
const attributeKey = z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .refine((key) => !['tenantId', 'subjectId', '__proto__', 'constructor', 'prototype'].includes(key));
const contextValue = z.union([
    z.string().max(500),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(500)).max(100),
]);
const mappedContext = z.strictObject({
    tenantId: z
        .string()
        .min(1)
        .max(200)
        .refine((value) => value === value.trim()),
    subjectId: z.string().min(1).max(200).optional(),
    attributes: z
        .record(attributeKey, contextValue)
        .refine((attributes) => Object.keys(attributes).length <= 32),
});
const taggedValue = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
    z.strictObject({ type: z.literal('string'), value: z.string().max(2000) }),
    z.strictObject({ type: z.literal('number'), value: z.number().finite() }),
    z.strictObject({
        type: z.literal('json'),
        value: z.json().refine((value) => encoder.encode(JSON.stringify(value)).length <= 4096),
    }),
]);
const decisionSchema = z.object({
    key: flagKey,
    projectId: z.uuid(),
    environmentId: z.uuid(),
    value: taggedValue,
    enabled: z.boolean(),
    reason: z.enum(['disabled', 'archived', 'override', 'rule', 'default', 'missing_subject']),
    revision: z.number().int().positive(),
    catalogRevision: z.number().int().positive(),
    variantId: z.string().max(100).nullable(),
    matchedRuleId: z.string().max(100).nullable(),
    matchedOverrideId: z.string().max(100).nullable(),
    trace: z
        .array(z.object({
        source: z.enum([
            'gate',
            'override',
            'rule',
            'segment',
            'condition',
            'rollout',
            'variant',
            'default',
        ]),
        id: z.string().nullable(),
        code: z.enum([
            'archived',
            'disabled',
            'override',
            'override_expired',
            'condition_matched',
            'condition_failed',
            'missing_attribute',
            'wrong_type',
            'segment_matched',
            'segment_failed',
            'rollout_matched',
            'rollout_excluded',
            'missing_subject',
            'rule_matched',
            'rule_skipped',
            'default',
            'variant_selected',
        ]),
        attribute: z.string().optional(),
        bucket: z.number().int().min(0).max(9999).optional(),
    }))
        .max(2000),
});
function mapContext(context) {
    if (Object.hasOwn(context, 'subjectId') || Object.hasOwn(context, 'attributes')) {
        throw new FlightdeckContractError();
    }
    const { targetingKey, tenantId, ...attributes } = context;
    const parsed = mappedContext.parse({ tenantId, subjectId: targetingKey, attributes });
    if (encoder.encode(JSON.stringify(parsed)).length > maxContextBytes) {
        throw new FlightdeckContractError();
    }
    return parsed;
}
function fallback(value, category, errorCode, httpStatus) {
    return {
        value,
        reason: StandardResolutionReasons.ERROR,
        errorCode,
        errorMessage: `Flightdeck evaluation failed (${category}).`,
        flagMetadata: {
            flightdeckSource: 'fallback',
            flightdeckReason: category,
            flightdeckErrorCategory: category,
            ...(httpStatus === undefined ? {} : { httpStatus }),
        },
    };
}
async function readResponse(response) {
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes)) {
        await response.body?.cancel();
        throw new Error('Invalid response size.');
    }
    if (!response.body)
        throw new Error('Missing response body.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let text = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > maxResponseBytes)
                throw new Error('Response exceeds size limit.');
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return JSON.parse(text);
    }
    finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
export class FlightdeckProvider {
    metadata = { name: 'Flightdeck' };
    runsOn = 'server';
    #baseUrl;
    #token;
    #projectId;
    #environmentId;
    #timeoutMs;
    constructor(options) {
        let baseUrl;
        try {
            baseUrl = new URL(options.baseUrl);
        }
        catch {
            throw new FlightdeckContractError();
        }
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname);
        if ((baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && loopback)) ||
            baseUrl.username ||
            baseUrl.password ||
            baseUrl.href.includes('?') ||
            baseUrl.href.includes('#') ||
            !z.uuid().safeParse(options.projectId).success ||
            !z.uuid().safeParse(options.environmentId).success ||
            typeof options.token !== 'string' ||
            !options.token ||
            /[^\x21-\x7e]/.test(options.token)) {
            throw new FlightdeckContractError();
        }
        const timeoutMs = options.timeoutMs ?? 1000;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) {
            throw new FlightdeckContractError();
        }
        baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/`;
        this.#baseUrl = baseUrl;
        this.#token = options.token;
        this.#projectId = options.projectId;
        this.#environmentId = options.environmentId;
        this.#timeoutMs = timeoutMs;
    }
    resolveBooleanEvaluation(key, defaultValue, context) {
        return this.evaluate(key, defaultValue, context, 'boolean');
    }
    resolveStringEvaluation(key, defaultValue, context) {
        return this.evaluate(key, defaultValue, context, 'string');
    }
    resolveNumberEvaluation(key, defaultValue, context) {
        return this.evaluate(key, defaultValue, context, 'number');
    }
    resolveObjectEvaluation(key, defaultValue, context) {
        return this.evaluate(key, defaultValue, context, 'json');
    }
    async evaluate(key, defaultValue, context, type) {
        if (!flagKey.safeParse(key).success) {
            return fallback(defaultValue, 'rejected', ErrorCode.GENERAL);
        }
        let body;
        try {
            body = JSON.stringify({ context: mapContext(context) });
        }
        catch {
            return fallback(defaultValue, 'invalid-context', ErrorCode.INVALID_CONTEXT);
        }
        const endpoint = new URL(`api/v1/projects/${this.#projectId}/environments/${this.#environmentId}/evaluate/${key}`, this.#baseUrl);
        const signal = AbortSignal.timeout(this.#timeoutMs);
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${this.#token}`,
                    accept: 'application/json',
                    'content-type': 'application/json',
                },
                body,
                redirect: 'error',
                signal,
            });
        }
        catch {
            return fallback(defaultValue, 'unavailable', ErrorCode.GENERAL);
        }
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            const status = response.status;
            if (status === 401 || status === 403) {
                return fallback(defaultValue, 'authorization', ErrorCode.GENERAL, status);
            }
            if (status === 404) {
                return fallback(defaultValue, 'not-found', ErrorCode.FLAG_NOT_FOUND, status);
            }
            if (status >= 500 || status === 408 || status === 429) {
                return fallback(defaultValue, 'unavailable', ErrorCode.GENERAL, status);
            }
            return fallback(defaultValue, status === 400 || status === 422 ? 'invalid-context' : 'rejected', status === 400 || status === 422 ? ErrorCode.INVALID_CONTEXT : ErrorCode.GENERAL, status);
        }
        try {
            if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
                await response.body?.cancel().catch(() => undefined);
                return fallback(defaultValue, 'invalid-response', ErrorCode.PARSE_ERROR);
            }
            const decision = decisionSchema.parse(await readResponse(response));
            if (decision.key !== key ||
                decision.projectId !== this.#projectId ||
                decision.environmentId !== this.#environmentId) {
                return fallback(defaultValue, 'invalid-response', ErrorCode.PARSE_ERROR);
            }
            if (decision.value.type !== type) {
                return fallback(defaultValue, 'type-mismatch', ErrorCode.TYPE_MISMATCH);
            }
            const reason = decision.reason === 'disabled' || decision.reason === 'archived'
                ? StandardResolutionReasons.DISABLED
                : decision.reason === 'rule' || decision.reason === 'override'
                    ? StandardResolutionReasons.TARGETING_MATCH
                    : StandardResolutionReasons.DEFAULT;
            return {
                value: decision.value.value,
                reason,
                ...(decision.variantId === null ? {} : { variant: decision.variantId }),
                flagMetadata: {
                    flightdeckSource: 'decision',
                    flightdeckReason: decision.reason,
                    revision: decision.revision,
                    catalogRevision: decision.catalogRevision,
                    enabled: decision.enabled,
                },
            };
        }
        catch {
            return signal.aborted
                ? fallback(defaultValue, 'unavailable', ErrorCode.GENERAL)
                : fallback(defaultValue, 'invalid-response', ErrorCode.PARSE_ERROR);
        }
    }
}
