import { z } from 'zod';

import { byteLength, conditionSchema } from './targeting.ts';

const keySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);
const dashboardUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }, 'Dashboard links require HTTPS, or loopback HTTP, without credentials');
export const deploymentSchema = z.strictObject({
  mode: z.enum(['local', 'master']),
  environmentKey: keySchema,
  environmentName: z.string().trim().min(1).max(120),
  dashboards: z
    .record(keySchema, dashboardUrlSchema)
    .refine(
      (links) => Object.keys(links).length <= 20,
      'At most 20 dashboard destinations are permitted'
    ),
});
export type Deployment = z.infer<typeof deploymentSchema>;
export const lifecycleSchema = z.enum(['development', 'release', 'system', 'permissions']);
export type Lifecycle = z.infer<typeof lifecycleSchema>;
export const segmentBlockSchema = z.strictObject({
  conditions: z.array(conditionSchema).min(1).max(10),
});
const definitionFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  blocks: z.array(segmentBlockSchema).min(1).max(20),
};
export const segmentDefinitionSchema = z.strictObject({
  version: z.number().int().positive(),
  ...definitionFields,
});
export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;
export const segmentUsageSchema = z.strictObject({
  flagId: z.uuid(),
  flagKey: keySchema,
  flagName: z.string(),
  enabled: z.boolean(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
});
export type SegmentUsage = z.infer<typeof segmentUsageSchema>;
export const segmentRecordSchema = z.strictObject({
  id: z.uuid(),
  key: keySchema,
  name: z.string(),
  description: z.string(),
  revision: z.number().int().positive(),
  published: segmentDefinitionSchema.nullable(),
  draft: segmentDefinitionSchema.nullable(),
  history: z.array(segmentDefinitionSchema).max(20),
  historyNextCursor: z.number().int().positive().nullable(),
  usage: z.array(segmentUsageSchema),
});
export type SegmentRecord = z.infer<typeof segmentRecordSchema>;
export const segmentLibrarySchema = z.object({ items: z.array(segmentRecordSchema) });
export const segmentHistorySchema = z.object({
  items: z.array(segmentDefinitionSchema).max(100),
  nextCursor: z.number().int().positive().nullable(),
});
export type SegmentHistory = z.infer<typeof segmentHistorySchema>;
export const createSegmentSchema = z
  .strictObject({ key: keySchema, ...definitionFields })
  .refine((value) => byteLength(value) <= 24576, 'Segment draft exceeds 24 KiB');
export const updateSegmentDraftSchema = z
  .strictObject({
    expectedRevision: z.number().int().positive(),
    ...definitionFields,
  })
  .refine((value) => byteLength(value) <= 24576, 'Segment draft exceeds 24 KiB');
export const publishSegmentSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});
export const restoreSegmentSchema = publishSegmentSchema.extend({
  version: z.number().int().positive(),
});
export const auditEventSchema = z.object({
  id: z.uuid(),
  objectType: z.enum(['flag', 'segment']),
  objectId: z.uuid(),
  objectKey: z.string(),
  objectName: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  action: z.string(),
  createdAt: z.iso.datetime(),
  environmentId: z.uuid(),
  previous: z.unknown().nullable(),
  next: z.unknown(),
  affectedReferences: z.array(segmentUsageSchema).optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditTrailSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
});
