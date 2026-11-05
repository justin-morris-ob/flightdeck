import type { Condition } from './targeting.ts';

import { z } from 'zod';

export const directoryKindSchema = z.enum(['people', 'organizations', 'groups']);
export type DirectoryKind = z.infer<typeof directoryKindSchema>;
export const directoryBindingSchema = z.strictObject({
  sourceId: z.string().min(1).max(128),
  tenantId: z
    .guid()
    .refine((value) => value === value.toLowerCase(), 'Use a canonical lowercase tenant ID'),
});
export type DirectoryBinding = z.infer<typeof directoryBindingSchema>;
export const directoryIdSchema = z.string().min(1).max(100);
export function validDirectoryId(kind: DirectoryKind, id: string): boolean {
  return kind === 'people'
    ? id === id.toLowerCase() && z.uuid().safeParse(id).success
    : /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
}
export const directoryAudienceSchema = directoryBindingSchema
  .extend({
    kind: directoryKindSchema,
    ids: z.array(directoryIdSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    if (new Set(value.ids).size !== value.ids.length)
      context.addIssue({ code: 'custom', message: 'Directory IDs must be unique', path: ['ids'] });
    for (const id of value.ids)
      if (!validDirectoryId(value.kind, id))
        context.addIssue({ code: 'custom', message: 'Invalid directory ID', path: ['ids'] });
  });
export type DirectoryAudience = z.infer<typeof directoryAudienceSchema>;
export const directoryItemSchema = z.strictObject({
  id: directoryIdSchema,
  label: z.string().min(1).max(200),
  email: z.email().max(254).nullable(),
});
export type DirectoryItem = z.infer<typeof directoryItemSchema>;
export const directoryStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('disconnected') }),
  z.strictObject({
    status: z.literal('configured'),
    label: z.string().min(1).max(120),
    binding: directoryBindingSchema,
  }),
]);
export type DirectoryStatus = z.infer<typeof directoryStatusSchema>;
export const directorySearchSchema = directoryBindingSchema.extend({
  kind: directoryKindSchema,
  items: z.array(directoryItemSchema).max(20),
  nextOffset: z.number().int().min(0).max(10000).nullable(),
});
export const directoryResolveSchema = directoryBindingSchema.extend({
  kind: directoryKindSchema,
  items: z.array(directoryItemSchema).max(20),
  missingIds: z.array(directoryIdSchema).max(20),
});
export const directoryAttributes = [
  { key: 'sourceId', type: 'string' as const, description: 'Trusted BC deployment/source binding' },
  {
    key: 'organizationIds',
    type: 'string_list' as const,
    description: 'Effective organization memberships',
  },
  { key: 'groupIds', type: 'string_list' as const, description: 'Effective group memberships' },
];

export function directoryConditions(target: DirectoryAudience): Condition[] {
  const value = directoryAudienceSchema.parse(target);
  return [
    { attribute: 'tenantId', operator: 'eq', values: [value.tenantId] },
    { attribute: 'sourceId', operator: 'eq', values: [value.sourceId] },
    {
      attribute:
        value.kind === 'people'
          ? 'subjectId'
          : value.kind === 'organizations'
            ? 'organizationIds'
            : 'groupIds',
      operator: value.kind === 'people' ? 'in' : 'contains_any',
      values: value.ids,
    },
  ];
}
