import type { OperatorPrincipal, Principal } from '../shared/contracts.ts';
import type { IncomingMessage } from 'node:http';
import type { Pool } from 'pg';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { localOperators } from '../shared/fixtures.ts';

const cookieName = 'fd_local_session';
const sessionSeconds = 8 * 60 * 60;

export function assertLocalDevelopment() {
  if (
    process.env.FLIGHTDECK_MODE !== 'local-development' ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'Stage 1 requires explicit local-development mode and refuses production startup.'
    );
  }
}

export function signSession(operatorId: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ id: operatorId, exp: Date.now() + sessionSeconds * 1000 })
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function sessionCookie(token: string): string {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionSeconds}`;
}

export function clearSessionCookie(): string {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function readOperator(req: IncomingMessage, secret: string): OperatorPrincipal | null {
  const token = req.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token || token.length > 2048) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof claims !== 'object' ||
      claims === null ||
      !('id' in claims) ||
      !('exp' in claims) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now()
    )
      return null;
    return localOperators.find((operator) => operator.id === claims.id) ?? null;
  } catch {
    return null;
  }
}

export async function authenticate(
  req: IncomingMessage,
  pool: Pool,
  secret: string
): Promise<Principal | null> {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer fd_')) {
    const tokenHash = createHash('sha256').update(authorization.slice(7)).digest('hex');
    const { rows } = await pool.query<{
      id: string;
      organization_id: string;
      project_id: string;
      environment_id: string;
    }>(
      `SELECT c.id, c.organization_id, c.project_id, c.environment_id
       FROM flightdeck.credentials c
       JOIN flightdeck.projects p ON p.id = c.project_id AND p.organization_id = c.organization_id
       JOIN flightdeck.environments e ON e.id = c.environment_id AND e.project_id = c.project_id
       WHERE c.token_hash = $1 AND c.revoked_at IS NULL`,
      [tokenHash]
    );
    const credential = rows[0];
    return credential
      ? {
          kind: 'service',
          id: credential.id,
          organizationId: credential.organization_id,
          projectId: credential.project_id,
          environmentId: credential.environment_id,
        }
      : null;
  }
  return readOperator(req, secret);
}
