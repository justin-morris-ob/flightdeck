import { z } from 'zod';

const encoder = new TextEncoder();
export const byteLength = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/);
export const tenantIdSchema = z.string().trim().min(1).max(200);
const jsonValueSchema = z
  .json()
  .refine((value) => byteLength(value) <= 4096, 'JSON values must fit within 4 KiB');
export const valueSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ type: z.literal('string'), value: z.string().max(2000) }),
  z.strictObject({ type: z.literal('number'), value: z.number().finite() }),
  z.strictObject({ type: z.literal('json'), value: jsonValueSchema }),
]);
export type TypedValue = z.infer<typeof valueSchema>;
export const scalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
export const stringListSchema = z.array(z.string().max(500)).max(100);
export const attributeTypeSchema = z.enum(['string', 'number', 'boolean', 'string_list']);
const attributeKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
  .refine(
    (key) => !['tenantId', 'subjectId', '__proto__', 'constructor', 'prototype'].includes(key),
    'Reserved attribute key'
  );
export const attributeDefinitionSchema = z.strictObject({
  key: attributeKeySchema,
  type: attributeTypeSchema,
  description: z.string().max(300),
});
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;
export const conditionSchema = z
  .strictObject({
    attribute: z.string().min(1).max(64),
    operator: z.enum([
      'eq',
      'not_eq',
      'in',
      'not_in',
      'gt',
      'gte',
      'lt',
      'lte',
      'ends_with',
      'contains_any',
      'contains_all',
      'present',
      'absent',
    ]),
    values: z.array(scalarSchema).max(20),
  })
  .superRefine((condition, context) => {
    const count = condition.values.length;
    if (
      ['present', 'absent'].includes(condition.operator)
        ? count !== 0
        : ['in', 'not_in', 'contains_any', 'contains_all'].includes(condition.operator)
          ? count === 0
          : count !== 1
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Operator has an invalid number of values',
        path: ['values'],
      });
    }
    if (
      ['gt', 'gte', 'lt', 'lte'].includes(condition.operator) &&
      condition.values.some((value) => typeof value !== 'number')
    )
      context.addIssue({
        code: 'custom',
        message: 'Ordered comparison requires a number',
        path: ['values'],
      });
    if (
      condition.operator === 'ends_with' &&
      condition.values.some((value) => typeof value !== 'string')
    )
      context.addIssue({
        code: 'custom',
        message: 'Text suffix requires a string',
        path: ['values'],
      });
    if (
      ['contains_any', 'contains_all'].includes(condition.operator) &&
      condition.values.some((value) => typeof value !== 'string')
    )
      context.addIssue({
        code: 'custom',
        message: 'List membership requires string operands',
        path: ['values'],
      });
  });
export type Condition = z.infer<typeof conditionSchema>;
export const segmentSchema = z.strictObject({
  id: z.uuid(),
  key: identifier,
  name: z.string().trim().min(1).max(120),
  revision: z.number().int().positive(),
  contextDefinitions: z.array(attributeDefinitionSchema).max(32),
  blocks: z
    .array(z.strictObject({ conditions: z.array(conditionSchema).min(1).max(10) }))
    .min(1)
    .max(20),
});
export type Segment = z.infer<typeof segmentSchema>;
export const catalogInputSchema = z
  .strictObject({
    attributes: z.array(attributeDefinitionSchema).max(32),
  })
  .superRefine((catalog, context) => {
    if (
      new Set(catalog.attributes.map((attribute) => attribute.key)).size !==
      catalog.attributes.length
    )
      context.addIssue({ code: 'custom', message: 'Attribute keys must be unique' });
    if (byteLength(catalog) > 24576)
      context.addIssue({ code: 'custom', message: 'Environment catalog exceeds 24 KiB' });
  });
export const catalogSchema = z.object({
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  attributes: z.array(attributeDefinitionSchema).max(32),
  segments: z.array(segmentSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;
export const catalogUpdateSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  catalog: catalogInputSchema,
});
export const outcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: valueSchema }),
  z.strictObject({ kind: z.literal('variant'), variantId: identifier }),
  z.strictObject({ kind: z.literal('weighted') }),
]);
export const overrideOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: valueSchema }),
  z.strictObject({ kind: z.literal('variant'), variantId: identifier }),
]);
export type Outcome = z.infer<typeof outcomeSchema>;
export const variantSchema = z.strictObject({
  id: identifier,
  name: z.string().trim().min(1).max(120),
  weightBasisPoints: z.number().int().min(0).max(10000),
  value: valueSchema,
});
export const ruleSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  conditions: z.array(conditionSchema).max(10),
  segmentIds: z.array(z.uuid()).max(5),
  rolloutBasisPoints: z.number().int().min(0).max(10000),
  outcome: outcomeSchema,
});
export type Rule = z.infer<typeof ruleSchema>;
const configurationFields = {
  allocationNamespace: z.string().min(1).max(100),
  hashVersion: z.literal('sha256-v1'),
  offValue: valueSchema,
  defaultOutcome: outcomeSchema,
  variants: z.array(variantSchema).max(10),
  rules: z.array(ruleSchema).max(20),
};
function validateConfiguration(
  configuration: z.infer<z.ZodObject<typeof configurationFields>>,
  context: z.RefinementCtx
) {
  const type = configuration.offValue.type;
  if (new Set(configuration.rules.map((rule) => rule.id)).size !== configuration.rules.length)
    context.addIssue({ code: 'custom', message: 'Rule IDs must be unique' });
  if (
    new Set(configuration.variants.map((variant) => variant.id)).size !==
    configuration.variants.length
  )
    context.addIssue({ code: 'custom', message: 'Variant IDs must be unique' });
  if (
    configuration.variants.length &&
    configuration.variants.reduce((sum, variant) => sum + variant.weightBasisPoints, 0) !== 10000
  )
    context.addIssue({
      code: 'custom',
      message: 'Variant weights must total exactly 10000 basis points',
    });
  for (const variant of configuration.variants)
    if (variant.value.type !== type)
      context.addIssue({
        code: 'custom',
        message: 'All variant values must match the off-value type',
      });
  for (const outcome of [
    configuration.defaultOutcome,
    ...configuration.rules.map((rule) => rule.outcome),
  ]) {
    if (outcome.kind === 'value' && outcome.value.type !== type)
      context.addIssue({ code: 'custom', message: 'All outcomes must match the off-value type' });
    if (
      outcome.kind === 'variant' &&
      !configuration.variants.some((variant) => variant.id === outcome.variantId)
    )
      context.addIssue({ code: 'custom', message: 'Outcome references an unknown variant' });
    if (outcome.kind === 'weighted' && !configuration.variants.length)
      context.addIssue({ code: 'custom', message: 'Weighted outcome requires variants' });
  }
}
export const configurationInputSchema = z
  .strictObject(configurationFields)
  .superRefine((configuration, context) => {
    validateConfiguration(configuration, context);
    if (byteLength(configuration) > 24576)
      context.addIssue({ code: 'custom', message: 'Configuration input exceeds 24 KiB' });
  });
export type ConfigurationInput = z.infer<typeof configurationInputSchema>;
function configurationTraceBudget(configuration: { rules: Rule[]; segments: Segment[] }) {
  let entries = 0;
  let bytes = 2;
  const add = (entry: {
    source: string;
    id: string | null;
    code: string;
    attribute?: string;
    bucket?: number;
  }) => {
    entries++;
    bytes += byteLength(entry) + 1;
  };
  const visited = new Set<string>();
  for (const rule of configuration.rules) {
    for (const condition of rule.conditions)
      add({
        source: 'condition',
        id: rule.id,
        code: 'condition_matched',
        attribute: condition.attribute,
      });
    for (const id of rule.segmentIds) {
      if (!visited.has(id)) {
        visited.add(id);
        const segment = configuration.segments.find((item) => item.id === id);
        for (const block of segment?.blocks ?? [])
          for (const condition of block.conditions)
            add({
              source: 'condition',
              id,
              code: 'condition_matched',
              attribute: condition.attribute,
            });
      }
      add({ source: 'segment', id, code: 'segment_matched' });
    }
    add({ source: 'rollout', id: rule.id, code: 'rollout_excluded', bucket: 9999 });
    add({ source: 'rule', id: rule.id, code: 'rule_matched' });
  }
  add({ source: 'default', id: null, code: 'default' });
  add({ source: 'variant', id: 'x'.repeat(100), code: 'variant_selected', bucket: 9999 });
  return { entries, bytes };
}

export const configurationSchema = z
  .object({
    ...configurationFields,
    catalogRevision: z.number().int().positive(),
    contextDefinitions: z.array(attributeDefinitionSchema).max(32),
    segments: z.array(segmentSchema).max(50),
  })
  .superRefine((configuration, context) => {
    validateConfiguration(configuration, context);
    // Followed segments own their storage; their complete captured definitions must survive reads.
    if (byteLength({ ...configuration, segments: [] }) > 65536)
      context.addIssue({ code: 'custom', message: 'Flag-owned configuration exceeds 64 KiB' });
    // Bound evaluator output independently of operand/description size, with response headroom.
    const trace = configurationTraceBudget(configuration);
    if (trace.entries > 1500 || trace.bytes > 192 * 1024)
      context.addIssue({
        code: 'custom',
        message: 'Configuration exceeds the evaluation trace budget (1500 entries / 192 KiB)',
      });
  });
export type Configuration = z.infer<typeof configurationSchema>;
export const publishConfigurationSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  expectedCatalogRevision: z.number().int().positive(),
  configuration: configurationInputSchema,
});
export const contextSchema = z
  .strictObject({
    tenantId: tenantIdSchema.optional(),
    subjectId: z.string().min(1).max(200).optional(),
    attributes: z
      .record(attributeKeySchema, z.union([scalarSchema, stringListSchema]))
      .refine(
        (attributes) => Object.keys(attributes).length <= 32,
        'At most 32 context attributes'
      ),
  })
  .refine((context) => byteLength(context) <= 32768, 'Evaluation context exceeds 32 KiB');
export type EvaluationContext = z.infer<typeof contextSchema>;
export const evaluationRequestSchema = z.strictObject({ context: contextSchema });
export const previewRequestSchema = z.strictObject({
  context: contextSchema,
  proposedConfiguration: configurationInputSchema.optional(),
  expectedRevision: z.number().int().positive(),
  expectedCatalogRevision: z.number().int().positive().optional(),
});
export const overrideInputSchema = z.strictObject({
  tenantId: tenantIdSchema,
  subjectId: z.string().min(1).max(200),
  owner: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.iso.datetime(),
  outcome: overrideOutcomeSchema,
});
export const createOverrideSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  override: overrideInputSchema,
});
export const revokeOverrideSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});
export const overrideSchema = overrideInputSchema.extend({
  id: z.uuid(),
  flagId: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type SubjectOverride = z.infer<typeof overrideSchema>;
export const overridesSchema = z.object({
  items: z.array(overrideSchema),
  nextCursor: z.string().nullable(),
});
export const catalogAuditSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  actorId: z.string(),
  actorName: z.string(),
  previous: z.unknown().nullable(),
  next: z.unknown(),
  createdAt: z.iso.datetime(),
});
export const catalogActivitySchema = z.object({
  items: z.array(catalogAuditSchema),
  nextCursor: z.string().nullable(),
});
export const traceSchema = z.object({
  source: z.enum([
    'gate',
    'override',
    'rule',
    'segment',
    'condition',
    'rollout',
    'variant',
    'default',
  ]),
  id: z.string().nullable(),
  code: z.enum([
    'archived',
    'disabled',
    'override',
    'override_expired',
    'condition_matched',
    'condition_failed',
    'missing_attribute',
    'wrong_type',
    'segment_matched',
    'segment_failed',
    'rollout_matched',
    'rollout_excluded',
    'missing_subject',
    'rule_matched',
    'rule_skipped',
    'default',
    'variant_selected',
  ]),
  attribute: z.string().optional(),
  bucket: z.number().int().min(0).max(9999).optional(),
});
export type EvaluationTrace = z.infer<typeof traceSchema>;
export function defaultConfiguration(allocationNamespace: string): Configuration {
  return {
    allocationNamespace,
    hashVersion: 'sha256-v1',
    offValue: { type: 'boolean', value: false },
    defaultOutcome: { kind: 'value', value: { type: 'boolean', value: true } },
    variants: [],
    rules: [],
    catalogRevision: 1,
    contextDefinitions: [],
    segments: [],
  };
}
export function configurationInput(configuration: Configuration): ConfigurationInput {
  const {
    catalogRevision: _catalogRevision,
    contextDefinitions: _contextDefinitions,
    segments: _segments,
    ...input
  } = configuration;
  return input;
}
