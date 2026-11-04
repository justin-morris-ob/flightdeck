import type { IncomingMessage } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertLocalDevelopment, readOperator, signSession } from './auth.ts';

const secret = 'fixed-local-test-secret-at-least-32-characters';
const request = (token: string) =>
  ({ headers: { cookie: `fd_local_session=${token}` } }) as IncomingMessage;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('local development identity', () => {
  it('does not allow a viewer to change its signed identity into an administrator', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    const token = signSession('local-viewer', secret);
    expect(readOperator(request(token), secret)?.role).toBe('viewer');
    const [payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id: string;
      exp: number;
    };
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, id: 'local-admin' })).toString(
      'base64url'
    );
    expect(readOperator(request(`${forgedPayload}.${signature}`), secret)).toBeNull();
  });

  it('expires a signed session at its expiry boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    const token = signSession('local-editor', secret);
    vi.setSystemTime(new Date('2026-11-04T19:59:59Z'));
    expect(readOperator(request(token), secret)?.role).toBe('editor');
    vi.setSystemTime(new Date('2026-11-04T20:00:00Z'));
    expect(readOperator(request(token), secret)).toBeNull();
  });

  it('refuses production and implicit development authentication modes', () => {
    vi.stubEnv('FLIGHTDECK_MODE', 'local-development');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertLocalDevelopment()).toThrow('refuses production');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FLIGHTDECK_MODE', '');
    expect(() => assertLocalDevelopment()).toThrow('explicit local-development');
  });
});
