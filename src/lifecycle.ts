import type { Flag } from '../shared/contracts.ts';

export const lifecycleLabels: Record<Flag['lifecycle'], string> = {
  development: 'Development',
  release: 'Release',
  system: 'System',
  permissions: 'Permissions',
};
export const lifecycleDescription: Record<Flag['lifecycle'], string> = {
  development: 'Temporary · Building and testing',
  release: 'Temporary · Rollout and cleanup',
  system: 'Long-lived · Operational control',
  permissions: 'Long-lived · Feature eligibility',
};
