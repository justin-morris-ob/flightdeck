import { z } from 'zod';

import {
  configurationSchema,
  overrideSchema,
  tenantIdSchema,
  traceSchema,
  valueSchema,
} from './targeting.ts';

export const roleSchema = z.enum(['viewer', 'editor', 'administrator']);
export type Role = z.infer<typeof roleSchema>;
export interface OperatorPrincipal {
  kind: 'operator';
  id: string;
  name: string;
  role: Role;
  organizationId: string;
}
export interface ServicePrincipal {
  kind: 'service';
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  allowedTenantIds: string[];
}
export type Principal = OperatorPrincipal | ServicePrincipal;
export interface RouteContext {
  principal: Principal;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}
export type Routes = Record<string, (context: RouteContext) => Promise<unknown>>;

export const operatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  organizationId: z.string(),
});
export const sessionSchema = z.object({
  mode: z.literal('local-development'),
  operator: operatorSchema,
});
export const environmentSchema = z.object({ id: z.uuid(), key: z.string(), name: z.string() });
export const projectSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  organizationId: z.uuid(),
  environments: z.array(environmentSchema),
});
export const projectsSchema = z.object({ items: z.array(projectSchema) });
export type Project = z.infer<typeof projectSchema>;
export const flagKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);
export const createFlagSchema = z.strictObject({
  key: flagKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  owner: z.string().trim().min(1).max(120),
});
export const updateFlagSchema = z
  .strictObject({
    expectedRevision: z.number().int().positive(),
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    owner: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one change is required',
  });
export const flagSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  key: flagKeySchema,
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  configuration: configurationSchema,
  updatedAt: z.iso.datetime(),
});
export type Flag = z.infer<typeof flagSchema>;
export const flagsSchema = z.object({
  items: z.array(flagSchema),
  nextCursor: z.string().nullable(),
});
export const evaluationSchema = z.object({
  key: flagKeySchema,
  projectId: z.uuid(),
  environmentId: z.uuid(),
  value: valueSchema,
  enabled: z.boolean(),
  reason: z.enum(['disabled', 'archived', 'override', 'rule', 'default', 'missing_subject']),
  revision: z.number().int().positive(),
  catalogRevision: z.number().int().positive(),
  variantId: z.string().nullable(),
  matchedRuleId: z.string().nullable(),
  matchedOverrideId: z.string().nullable(),
  trace: z.array(traceSchema).max(2000),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export const previewSchema = z.object({
  current: evaluationSchema,
  proposed: evaluationSchema.nullable(),
  warnings: z.array(z.string()),
  allocationChanged: z.boolean(),
});
export const snapshotSchema = z.object({
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  archived: z.boolean(),
  enabled: z.boolean(),
  configuration: configurationSchema.optional(),
  override: overrideSchema.nullable().optional(),
});
export const auditSchema = z.object({
  id: z.uuid(),
  flagId: z.uuid(),
  environmentId: z.uuid(),
  actorId: z.string(),
  actorName: z.string(),
  action: z.enum([
    'created',
    'updated',
    'enabled',
    'disabled',
    'archived',
    'restored',
    'configuration',
    'override_created',
    'override_revoked',
  ]),
  revision: z.number().int().positive(),
  previous: snapshotSchema.nullable(),
  next: snapshotSchema,
  createdAt: z.iso.datetime(),
});
export const activitySchema = z.object({
  items: z.array(auditSchema),
  nextCursor: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditSchema>;
export const createCredentialSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  allowedTenantIds: z
    .array(tenantIdSchema)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Tenant grants must be unique'),
});
export const credentialSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  allowedTenantIds: z.array(tenantIdSchema).min(1).max(20),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export const credentialsSchema = z.object({ items: z.array(credentialSchema) });
export const issuedCredentialSchema = z.object({ credential: credentialSchema, token: z.string() });
export const apiErrorSchema = z.object({ error: z.string() });
export const scopePath = (projectId: string, environmentId: string) =>
  `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}`;
