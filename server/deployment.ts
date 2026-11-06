import { deploymentSchema, type Deployment } from '../shared/unified.ts';

export const defaultDeployment: Deployment = deploymentSchema.parse({
  mode: 'local',
  environmentKey: 'development',
  environmentName: 'Development',
  dashboards: {},
});

/** Deployment authority comes only from server startup configuration, never requests. */
export function loadDeployment(env: NodeJS.ProcessEnv = process.env): Deployment {
  let dashboards: unknown = {};
  if (env.FLIGHTDECK_DASHBOARD_LINKS !== undefined) {
    try {
      dashboards = JSON.parse(env.FLIGHTDECK_DASHBOARD_LINKS);
    } catch {
      throw new Error(
        'FLIGHTDECK_DASHBOARD_LINKS must be a JSON object of environment dashboard URLs'
      );
    }
  }
  const parsed = deploymentSchema.safeParse({
    mode: env.FLIGHTDECK_DASHBOARD_MODE ?? defaultDeployment.mode,
    environmentKey: env.FLIGHTDECK_ENVIRONMENT_KEY ?? defaultDeployment.environmentKey,
    environmentName: env.FLIGHTDECK_ENVIRONMENT_NAME ?? defaultDeployment.environmentName,
    dashboards,
  });
  if (!parsed.success) {
    throw new Error(`Invalid Flightdeck deployment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
