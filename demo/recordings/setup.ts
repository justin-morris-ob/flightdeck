import { deploymentSchema } from '../../shared/unified.ts';

export default async function setup(): Promise<void> {
  for (const [origin, name] of [
    ['http://localhost:4721', 'flightdeck'],
    ['http://localhost:4722', 'flightdeck-consumer-demo'],
  ]) {
    const response = await fetch(`${origin}/healthz`, {
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    const health: unknown = await response.json();
    if (
      !response.ok ||
      !health ||
      typeof health !== 'object' ||
      !('name' in health) ||
      health.name !== name ||
      !('mode' in health) ||
      health.mode !== 'local-development' ||
      !('ok' in health) ||
      health.ok !== true
    )
      throw new Error(`Expected the local ${name} service at ${origin}; refusing to record.`);
  }
  const session = await fetch('http://localhost:4721/api/v1/dev/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operatorId: 'local-viewer' }),
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  if (!session.ok || !cookie)
    throw new Error('The recording preflight could not open its local read-only session.');
  const response = await fetch('http://localhost:4721/api/v1/deployment', {
    headers: { cookie },
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('The local recording deployment could not be read.');
  const deployment = deploymentSchema.parse(await response.json());
  if (deployment.mode !== 'local' || deployment.environmentKey !== 'development')
    throw new Error(
      'Recordings require local Development. A reused master or other deployment is read only to this harness.'
    );
}
