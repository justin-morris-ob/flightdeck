import type { ObjectRef } from '@onebrief/atlas-sdk';

import { z } from 'zod';

import { flagKeySchema } from '../shared/contracts.ts';

const locationSchema = z
  .object({
    projectId: z.uuid().optional(),
    flagKey: flagKeySchema.optional(),
    environmentId: z.uuid().optional(),
    view: z.enum(['flags', 'segments', 'audit']).default('flags'),
  })
  .superRefine((value, context) => {
    if ((value.flagKey || value.environmentId) && !value.projectId)
      context.addIssue({ code: 'custom', message: 'Project is required for this location' });
    if (value.view !== 'flags' && value.flagKey)
      context.addIssue({ code: 'custom', message: 'A flag belongs to the flags view' });
    if (value.environmentId && value.view !== 'flags')
      context.addIssue({ code: 'custom', message: 'This section is project-wide' });
    if (value.environmentId && value.view === 'flags' && !value.flagKey)
      context.addIssue({ code: 'custom', message: 'Choose a flag before its environment' });
  });

export interface FlightdeckLocation {
  projectId: string;
  flagKey: string | null;
  environmentId: string;
  view: 'flags' | 'segments' | 'audit';
}
export interface LocationResult {
  location: FlightdeckLocation | null;
  error: string;
}
export const emptyLocation: FlightdeckLocation = {
  projectId: '',
  flagKey: null,
  environmentId: '',
  view: 'flags',
};

function parseLocation(input: unknown): LocationResult {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success)
    return { location: null, error: 'Invalid Flightdeck location. Choose a project to continue.' };
  return {
    location: {
      projectId: parsed.data.projectId ?? '',
      flagKey: parsed.data.flagKey ?? null,
      environmentId: parsed.data.environmentId ?? '',
      view: parsed.data.view,
    },
    error: '',
  };
}

export function readLocation(search: string): LocationResult {
  const query = new URLSearchParams(search);
  const input: Record<string, string> = {};
  for (const key of ['projectId', 'flagKey', 'environmentId', 'view']) {
    const values = query.getAll(key);
    if (values.length > 1)
      return { location: null, error: 'Repeated Flightdeck location parameter.' };
    if (values[0] !== undefined) input[key] = values[0];
  }
  return parseLocation(input);
}

export function locationSearch(location: FlightdeckLocation): string {
  const query = new URLSearchParams();
  if (location.projectId) query.set('projectId', location.projectId);
  if (location.flagKey) query.set('flagKey', location.flagKey);
  if (location.environmentId) query.set('environmentId', location.environmentId);
  if (location.view !== 'flags') query.set('view', location.view);
  const value = query.toString();
  return value ? `?${value}` : '';
}

export function locationRef(location: FlightdeckLocation): ObjectRef {
  const { projectId, flagKey, environmentId, view } = location;
  if (view !== 'flags')
    return { appId: 'flightdeck', entityType: view, entityId: projectId || 'all' };
  if (!flagKey) return { appId: 'flightdeck', entityType: 'flags', entityId: projectId || 'all' };
  return {
    appId: 'flightdeck',
    entityType: environmentId ? 'configuration' : 'flag',
    entityId: [projectId, flagKey, ...(environmentId ? [environmentId] : [])].join('/'),
  };
}

export function locationFromRef(ref: ObjectRef): LocationResult {
  const parts = ref.entityId.split('/');
  if (ref.appId !== 'flightdeck')
    return { location: null, error: 'This reference does not belong to Flightdeck.' };
  if (ref.entityType === 'flags' && parts.length === 1)
    return parseLocation(ref.entityId === 'all' ? {} : { projectId: ref.entityId });
  if (ref.entityType === 'flag' && parts.length === 2)
    return parseLocation({ projectId: parts[0], flagKey: parts[1] });
  if (ref.entityType === 'configuration' && parts.length === 3)
    return parseLocation({ projectId: parts[0], flagKey: parts[1], environmentId: parts[2] });
  if (['segments', 'audit'].includes(ref.entityType) && parts.length === 1)
    return parseLocation({
      ...(ref.entityId === 'all' ? {} : { projectId: ref.entityId }),
      view: ref.entityType,
    });
  return { location: null, error: 'Unknown Flightdeck reference.' };
}
