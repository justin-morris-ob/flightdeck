import type { Request } from './api.ts';
import type { ObjectRef, PageProps, RegisterApp } from '@onebrief/atlas-sdk';

import { useCallback, useEffect } from 'react';

import { FlightdeckApp } from './App.tsx';
import { locationFromRef, locationRef, type FlightdeckLocation } from './navigation.ts';

const inventoryRef: ObjectRef = { appId: 'flightdeck', entityType: 'flags', entityId: 'all' };

const register: RegisterApp = (registrar, platform) => {
  const inventoryOrigins = new Map<string, ObjectRef>();
  const request: Request = (path, init) =>
    platform.api('flightdeck', path.slice('/api'.length), { ...init, credentials: 'include' });
  function FlagsPage({ objectRef, instanceId, visible }: PageProps) {
    const initialLocation = locationFromRef(objectRef);
    const onNavigate = useCallback(
      (location: FlightdeckLocation) => {
        if (objectRef.entityType === 'flags' && (location.flagKey || location.view !== 'flags'))
          inventoryOrigins.set(location.projectId, objectRef);
        const target =
          !location.flagKey && location.view === 'flags'
            ? (inventoryOrigins.get(location.projectId) ?? locationRef(location))
            : locationRef(location);
        platform.open(target);
      },
      [objectRef.entityType, objectRef.entityId]
    );
    useEffect(() => {
      const { flagKey, environmentId, view } = initialLocation.location ?? {};
      platform.setTitle(
        instanceId,
        flagKey
          ? `${flagKey} · ${environmentId ? 'Configuration' : 'Overview'}`
          : view === 'catalog'
            ? 'Targeting catalog'
            : view === 'credentials'
              ? 'Evaluation credentials'
              : 'Feature flags'
      );
    }, [instanceId, objectRef.entityType, objectRef.entityId]);
    return (
      <FlightdeckApp
        request={request}
        embedded
        visible={visible}
        initialLocation={initialLocation}
        onNavigate={onNavigate}
      />
    );
  }
  registrar.app({
    id: 'flightdeck',
    menu: async () => ({
      views: [{ id: 'flags', label: 'Feature flags', icon: 'flag', ref: inventoryRef }],
      collections: [],
    }),
  });
  for (const entityType of ['flags', 'flag', 'configuration', 'catalog', 'credentials']) {
    registrar.page({ entityType, component: FlagsPage });
  }
};

export default register;
