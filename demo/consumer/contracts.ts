import { z } from 'zod';

export const demoFlags = [
  {
    key: 'bc-homepage-title-filter',
    name: 'Homepage title filter',
    type: 'boolean',
    fallback: false,
  },
  { key: 'demo-greeting', name: 'Welcome message', type: 'string', fallback: 'Local welcome' },
  { key: 'demo-page-limit', name: 'Page limit', type: 'number', fallback: 5 },
  {
    key: 'demo-layout',
    name: 'Layout configuration',
    type: 'json',
    fallback: { density: 'comfortable' },
  },
] as const;
export const demoPersonas = [
  {
    id: 'pilot',
    name: 'Mira · Alpha pilots',
    subjectId: '00000000-0000-4000-8000-000000000101',
    organizationIds: ['101'],
    groupIds: ['501'],
  },
  {
    id: 'standard',
    name: 'Kai · Standard member',
    subjectId: '00000000-0000-4000-8000-000000000102',
    organizationIds: ['102'],
    groupIds: ['502'],
  },
  {
    id: 'multi',
    name: 'Rowan · Multiple memberships',
    subjectId: '00000000-0000-4000-8000-000000000103',
    organizationIds: ['101', '102'],
    groupIds: ['502', '501'],
  },
] as const;
export const demoScenarios = [
  { id: 'live', name: 'Live Flightdeck' },
  { id: 'wrong-tenant', name: 'Live · denied tenant' },
  { id: 'unauthorized', name: 'Live · invalid credential' },
  { id: 'unavailable', name: 'Simulated transport · unavailable' },
  { id: 'malformed', name: 'Simulated transport · malformed response' },
] as const;
export const demoRequestSchema = z.strictObject({
  personaId: z.enum(['pilot', 'standard', 'multi']),
  flagKey: z.enum(['bc-homepage-title-filter', 'demo-greeting', 'demo-page-limit', 'demo-layout']),
  scenario: z.enum(['live', 'wrong-tenant', 'unauthorized', 'unavailable', 'malformed']),
});
export type DemoRequest = z.infer<typeof demoRequestSchema>;
export const demoConfigSchema = z.strictObject({
  baseUrl: z.url(),
  token: z.string().regex(/^fd_[a-f0-9]{64}$/),
  credentialId: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  tenantId: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(100),
});
export type DemoConfig = z.infer<typeof demoConfigSchema>;
export const demoResultSchema = z.object({
  context: z.object({
    targetingKey: z.string(),
    tenantId: z.string(),
    sourceId: z.string(),
    organizationIds: z.array(z.string()),
    groupIds: z.array(z.string()),
  }),
  value: z.json(),
  reason: z.string(),
  errorCode: z.string().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  scenario: demoRequestSchema.shape.scenario,
  flagKey: demoRequestSchema.shape.flagKey,
});
export type DemoResult = z.infer<typeof demoResultSchema>;
