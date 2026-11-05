import type { ConfigurationInput, Rule, Segment } from './targeting.ts';

export type SimpleAudience = { mode: 'everyone' | 'selected'; segmentIds: string[] };

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
    return configuration.rules.length === 0 ? { mode: 'everyone', segmentIds: [] } : null;

  const segmentIds: string[] = [];
  const ruleIds = new Set<string>();
  for (const rule of configuration.rules) {
    const segmentId = rule.segmentIds[0];
    if (
      rule.rolloutBasisPoints !== 10000 ||
      rule.conditions.length !== 0 ||
      rule.segmentIds.length !== 1 ||
      segmentId === undefined ||
      segmentIds.includes(segmentId) ||
      ruleIds.has(rule.id) ||
      rule.outcome.kind !== 'value' ||
      rule.outcome.value.type !== 'boolean' ||
      rule.outcome.value.value !== true
    )
      return null;
    segmentIds.push(segmentId);
    ruleIds.add(rule.id);
  }
  return { mode: 'selected', segmentIds };
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
    audience.segmentIds.length > 20 ||
    new Set(audience.segmentIds).size !== audience.segmentIds.length ||
    (audience.mode === 'everyone' && audience.segmentIds.length !== 0)
  )
    throw new Error('Select at most 20 unique segments, or Everyone without segment selections.');

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
