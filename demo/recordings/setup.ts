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
}
