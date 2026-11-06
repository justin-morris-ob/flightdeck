import type { Request } from './api.ts';
import type { ObjectRef, PageProps, RegisterApp } from '@onebrief/atlas-sdk';

import { useEffect } from 'react';

import { FlightdeckApp } from './App.tsx';

const register: RegisterApp = (registrar, platform) => {
  const request: Request = (path, init) =>
    platform.api('flightdeck', path.slice('/api'.length), { ...init, credentials: 'include' });
  function FlightdeckPage({ objectRef, instanceId }: PageProps) {
    const initialView =
      objectRef.entityType === 'segments'
        ? 'segments'
        : objectRef.entityType === 'audit'
          ? 'audit'
          : 'flags';
    useEffect(() => {
      platform.setTitle(
        instanceId,
        initialView === 'flags' ? 'Flags' : initialView === 'segments' ? 'Segments' : 'Audit trail'
      );
    }, [instanceId, initialView]);
    return (
      <FlightdeckApp
        request={request}
        embedded
        initialView={initialView}
        initialProjectId={objectRef.entityId === 'all' ? undefined : objectRef.entityId}
      />
    );
  }
  registrar.app({
    id: 'flightdeck',
    menu: async () => ({
      views: [
        {
          id: 'flags',
          label: 'Flags',
          icon: 'flag',
          ref: { appId: 'flightdeck', entityType: 'flags', entityId: 'all' } satisfies ObjectRef,
        },
        {
          id: 'segments',
          label: 'Segments',
          icon: 'users',
          ref: { appId: 'flightdeck', entityType: 'segments', entityId: 'all' } satisfies ObjectRef,
        },
        {
          id: 'audit',
          label: 'Audit trail',
          icon: 'clock',
          ref: { appId: 'flightdeck', entityType: 'audit', entityId: 'all' } satisfies ObjectRef,
        },
      ],
      collections: [],
    }),
  });
  for (const entityType of ['flags', 'segments', 'audit'])
    registrar.page({ entityType, component: FlightdeckPage });
};

export default register;
