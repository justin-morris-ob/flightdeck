import type { ConfigurationInput, Rule, Segment } from './targeting.ts';

import {
  directoryAudienceSchema,
  directoryConditions,
  type DirectoryAudience,
} from './directory.ts';

export type SimpleAudience = {
  mode: 'everyone' | 'selected';
  segmentIds: string[];
  directoryTargets: DirectoryAudience[];
};

function targetKey(target: DirectoryAudience): string {
  return JSON.stringify([target.kind, target.sourceId, target.tenantId]);
}

function readDirectoryRule(rule: Rule): DirectoryAudience | null {
  if (rule.segmentIds.length !== 0 || rule.conditions.length !== 3) return null;
  const tenant = rule.conditions.find((condition) => condition.attribute === 'tenantId');
  const source = rule.conditions.find((condition) => condition.attribute === 'sourceId');
  const selected = rule.conditions.find((condition) =>
    ['subjectId', 'organizationIds', 'groupIds'].includes(condition.attribute)
  );
  if (
    !tenant ||
    tenant.operator !== 'eq' ||
    tenant.values.length !== 1 ||
    !source ||
    source.operator !== 'eq' ||
    source.values.length !== 1 ||
    !selected ||
    selected.operator !== (selected.attribute === 'subjectId' ? 'in' : 'contains_any')
  )
    return null;
  const parsed = directoryAudienceSchema.safeParse({
    sourceId: source.values[0],
    tenantId: tenant.values[0],
    kind:
      selected.attribute === 'subjectId'
        ? 'people'
        : selected.attribute === 'organizationIds'
          ? 'organizations'
          : 'groups',
    ids: selected.values,
  });
  return parsed.success ? parsed.data : null;
}

export function readSimpleAudience(configuration: ConfigurationInput): SimpleAudience | null {
  if (
    configuration.offValue.type !== 'boolean' ||
    configuration.offValue.value !== false ||
    configuration.variants.length !== 0 ||
    configuration.defaultOutcome.kind !== 'value' ||
    configuration.defaultOutcome.value.type !== 'boolean' ||
    configuration.rules.length > 20
  )
    return null;
  if (configuration.defaultOutcome.value.value === true)
    return configuration.rules.length === 0
      ? { mode: 'everyone', segmentIds: [], directoryTargets: [] }
      : null;

  const audience: SimpleAudience = { mode: 'selected', segmentIds: [], directoryTargets: [] };
  const ruleIds = new Set<string>();
  const targets = new Set<string>();
  for (const rule of configuration.rules) {
    if (
      rule.rolloutBasisPoints !== 10000 ||
      ruleIds.has(rule.id) ||
      rule.outcome.kind !== 'value' ||
      rule.outcome.value.type !== 'boolean' ||
      rule.outcome.value.value !== true
    )
      return null;
    ruleIds.add(rule.id);
    if (rule.conditions.length === 0 && rule.segmentIds.length === 1) {
      const id = rule.segmentIds[0]!;
      if (audience.segmentIds.includes(id)) return null;
      audience.segmentIds.push(id);
      continue;
    }
    const target = readDirectoryRule(rule);
    if (!target || targets.has(targetKey(target))) return null;
    targets.add(targetKey(target));
    audience.directoryTargets.push(target);
  }
  return audience;
}

export function setSimpleAudience(
  configuration: ConfigurationInput,
  audience: SimpleAudience,
  segments: Segment[],
  createId: () => string
): ConfigurationInput {
  if (!readSimpleAudience(configuration))
    throw new Error('Advanced configuration is preserved. Use advanced controls to edit it.');
  if (
    audience.segmentIds.length + audience.directoryTargets.length > 20 ||
    new Set(audience.segmentIds).size !== audience.segmentIds.length ||
    (audience.mode === 'everyone' &&
      (audience.segmentIds.length !== 0 || audience.directoryTargets.length !== 0))
  )
    throw new Error('Select at most 20 unique audience branches, or Everyone without selections.');

  const directoryTargets = audience.directoryTargets.map((target) =>
    directoryAudienceSchema.parse(target)
  );
  if (new Set(directoryTargets.map(targetKey)).size !== directoryTargets.length)
    throw new Error('Directory audience kinds must be unique within a source and tenant.');
  const rules: Rule[] = [];
  if (audience.mode === 'selected') {
    for (const segmentId of audience.segmentIds) {
      const retained = configuration.rules.find((rule) => rule.segmentIds[0] === segmentId);
      if (retained) {
        rules.push(retained);
        continue;
      }
      const segment = segments.find((item) => item.id === segmentId);
      if (!segment) throw new Error('A newly selected segment must exist in the supplied catalog.');
      rules.push({
        id: createId(),
        name: segment.name,
        conditions: [],
        segmentIds: [segmentId],
        rolloutBasisPoints: 10000,
        outcome: { kind: 'value', value: { type: 'boolean', value: true } },
      });
    }
    for (const target of directoryTargets) {
      const retained = configuration.rules.find((rule) => {
        const existing = readDirectoryRule(rule);
        return existing && targetKey(existing) === targetKey(target);
      });
      rules.push({
        id: retained?.id ?? createId(),
        name: retained?.name ?? `BC ${target.kind} · ${target.sourceId}`.slice(0, 120),
        conditions: directoryConditions(target),
        segmentIds: [],
        rolloutBasisPoints: 10000,
        outcome: { kind: 'value', value: { type: 'boolean', value: true } },
      });
    }
  }
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length)
    throw new Error('Audience rules require unique IDs.');
  return {
    ...configuration,
    offValue: { type: 'boolean', value: false },
    defaultOutcome: {
      kind: 'value',
      value: { type: 'boolean', value: audience.mode === 'everyone' },
    },
    variants: [],
    rules,
  };
}
