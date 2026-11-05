import { describe, expect, it } from 'vitest';

import { locationFromRef, readLocation } from './navigation.ts';

const projectId = '20000000-0000-4000-8000-000000000001';
const environmentId = '30000000-0000-4000-8000-000000000001';

describe('Flightdeck scope locations', () => {
  it('distinguishes a project flag overview from an exact environment configuration', () => {
    const overview = readLocation(`?projectId=${projectId}&flagKey=workspace_navigation`);
    expect(overview.location).toMatchObject({ environmentId: '', flagKey: 'workspace_navigation' });

    const configuration = readLocation(
      `?projectId=${projectId}&flagKey=workspace_navigation&environmentId=${environmentId}`
    );
    expect(configuration.location).toMatchObject({ environmentId });
  });

  it.each([
    '?flagKey=workspace_navigation',
    `?environmentId=${environmentId}`,
    `?projectId=${projectId}&environmentId=${environmentId}`,
    `?projectId=${projectId}&view=segments&environmentId=${environmentId}`,
    `?projectId=${projectId}&view=audit&flagKey=workspace_navigation`,
    `?projectId=${projectId}&view=credentials`,
    `?projectId=${projectId}&view=catalog`,
    '?projectId=not-a-project',
    `?projectId=${projectId}&flagKey=bad/key`,
    `?projectId=${projectId}&view=unknown`,
  ])(
    'rejects invalid or ambiguous scope instead of opening a default environment: %s',
    (search) => {
      expect(readLocation(search).location).toBeNull();
    }
  );

  it('rejects duplicate scope parameters instead of choosing a caller-dependent interpretation', () => {
    expect(readLocation(`?projectId=${projectId}&projectId=${projectId}`).location).toBeNull();
  });

  it.each(['segments', 'audit'] as const)(
    'opens project-wide %s without an environment',
    (view) => {
      const result = readLocation(`?projectId=${projectId}&view=${view}`);
      expect(result.location).toEqual({ projectId, view, environmentId: '', flagKey: null });
      expect(
        locationFromRef({ appId: 'flightdeck', entityType: view, entityId: projectId }).location
      ).toEqual(result.location);
    }
  );

  it.each([
    { appId: 'another-app', entityType: 'flag', entityId: `${projectId}/workspace_navigation` },
    {
      appId: 'flightdeck',
      entityType: 'flag',
      entityId: `${projectId}/workspace_navigation/extra`,
    },
    {
      appId: 'flightdeck',
      entityType: 'configuration',
      entityId: `${projectId}/workspace_navigation`,
    },
    {
      appId: 'flightdeck',
      entityType: 'configuration',
      entityId: `${projectId}/workspace_navigation/bad-env`,
    },
    { appId: 'flightdeck', entityType: 'unregistered', entityId: projectId },
  ])('rejects malformed or foreign shell references: $entityType / $entityId', (ref) => {
    expect(locationFromRef(ref).location).toBeNull();
  });
});
