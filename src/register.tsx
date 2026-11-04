import type { Request } from './api.ts';
import type { ObjectRef, PageProps, RegisterApp } from '@onebrief/atlas-sdk';

import { useEffect } from 'react';

import { FlightdeckApp } from './App.tsx';

const inventoryRef: ObjectRef = { appId: 'flightdeck', entityType: 'flags', entityId: 'all' };

const register: RegisterApp = (registrar, platform) => {
  const request: Request = (path, init) =>
    platform.api('flightdeck', path.slice('/api'.length), { ...init, credentials: 'include' });
  function FlagsPage({ objectRef, instanceId }: PageProps) {
    useEffect(() => {
      platform.setTitle(instanceId, 'Feature flags');
    }, [instanceId]);
    return (
      <FlightdeckApp
        request={request}
        embedded
        initialProjectId={objectRef.entityId === 'all' ? undefined : objectRef.entityId}
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
  registrar.page({
    entityType: 'flags',
    component: FlagsPage,
  });
};

export default register;
