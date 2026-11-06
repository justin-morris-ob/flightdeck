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
          : objectRef.entityType === 'settings'
            ? 'settings'
            : 'flags';
    useEffect(() => {
      platform.setTitle(
        instanceId,
        initialView === 'flags'
          ? 'Flags'
          : initialView === 'segments'
            ? 'Segments'
            : initialView === 'audit'
              ? 'Audit trail'
              : 'Flightdeck settings'
      );
    }, [instanceId, initialView]);
    return (
      <FlightdeckApp
        request={request}
        embedded
        initialView={initialView}
        initialProjectId={objectRef.entityId === 'all' ? undefined : objectRef.entityId}
        onNavigate={(view, projectId) =>
          platform.open({ appId: 'flightdeck', entityType: view, entityId: projectId || 'all' })
        }
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
  for (const entityType of ['flags', 'segments', 'audit', 'settings'])
    registrar.page({ entityType, component: FlightdeckPage });
};

export default register;
