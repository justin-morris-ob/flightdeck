import type { Evaluation, Flag } from '../shared/contracts.ts';
import type {
  Condition,
  Configuration,
  EvaluationContext,
  EvaluationTrace,
  Outcome,
  SubjectOverride,
} from '../shared/targeting.ts';

import { createHash } from 'node:crypto';

export class UnknownFlagError extends Error {
  readonly code = 'unknown_flag';
  constructor() {
    super('Unknown flag');
    this.name = 'UnknownFlagError';
  }
}

export function allocationBucket(
  namespace: string,
  purpose: 'rollout' | 'variant',
  subject: { tenantId: string; subjectId: string },
  ruleId = ''
): number {
  const hash = createHash('sha256');
  for (const field of [
    'flightdeck',
    'sha256-v1',
    purpose,
    namespace,
    purpose === 'rollout' ? ruleId : '',
    subject.tenantId,
    subject.subjectId,
  ]) {
    const bytes = Buffer.from(field, 'utf8');
    hash.update(`${bytes.length}:`);
    hash.update(bytes);
  }
  return Math.floor((hash.digest().readUInt32BE(0) * 10000) / 4294967296);
}

type EvaluationInput = {
  flag: Pick<
    Flag,
    | 'id'
    | 'key'
    | 'projectId'
    | 'environmentId'
    | 'enabled'
    | 'archived'
    | 'revision'
    | 'configuration'
  > | null;
  context: EvaluationContext;
  overrides: SubjectOverride[];
  now: string;
};

export function evaluate({ flag, context, overrides, now }: EvaluationInput): Evaluation {
  if (!flag) throw new UnknownFlagError();
  const configuration = flag.configuration;
  const trace: EvaluationTrace[] = [];
  const result: Evaluation = {
    key: flag.key,
    projectId: flag.projectId,
    environmentId: flag.environmentId,
    value: configuration.offValue,
    enabled: !flag.archived && flag.enabled,
    reason: 'default',
    revision: flag.revision,
    catalogRevision: configuration.catalogRevision,
    variantId: null,
    matchedRuleId: null,
    matchedOverrideId: null,
    trace,
  };
  if (flag.archived || !flag.enabled) {
    result.reason = flag.archived ? 'archived' : 'disabled';
    trace.push({ source: 'gate', id: null, code: result.reason });
    return result;
  }
  const subject =
    context.tenantId && context.subjectId
      ? { tenantId: context.tenantId, subjectId: context.subjectId }
      : null;
  function outcome(selected: Outcome): Evaluation {
    if (selected.kind === 'value') {
      result.value = selected.value;
      return result;
    }
    if (!subject) {
      result.reason = 'missing_subject';
      trace.push({ source: 'variant', id: null, code: 'missing_subject' });
      return result;
    }
    let variant;
    if (selected.kind === 'variant')
      variant = configuration.variants.find((item) => item.id === selected.variantId);
    else {
      const bucket = allocationBucket(configuration.allocationNamespace, 'variant', subject);
      let upper = 0;
      variant = configuration.variants.find((item) => {
        upper += item.weightBasisPoints;
        return bucket < upper;
      });
      if (variant)
        trace.push({ source: 'variant', id: variant.id, code: 'variant_selected', bucket });
    }
    if (!variant) throw new Error('Invalid published variant outcome');
    if (selected.kind === 'variant')
      trace.push({ source: 'variant', id: variant.id, code: 'variant_selected' });
    result.variantId = variant.id;
    result.value = variant.value;
    return result;
  }
  function conditionMatches(condition: Condition, id: string): boolean {
    const builtin =
      condition.attribute === 'tenantId' || condition.attribute === 'subjectId'
        ? condition.attribute
        : null;
    const value = builtin ? context[builtin] : context.attributes[condition.attribute];
    const present = builtin
      ? Object.hasOwn(context, builtin) && value !== undefined
      : Object.hasOwn(context.attributes, condition.attribute);
    const declaredType = builtin
      ? 'string'
      : configuration.contextDefinitions.find((item) => item.key === condition.attribute)?.type;
    const typed =
      present &&
      declaredType !== undefined &&
      (declaredType === 'string_list'
        ? Array.isArray(value) &&
          value.length <= 100 &&
          value.every((item) => typeof item === 'string' && item.length <= 500)
        : typeof value === declaredType);
    let matches = false;
    let code: EvaluationTrace['code'];
    if (present && !typed) code = 'wrong_type';
    else if (condition.operator === 'absent') {
      matches = !present;
      code = matches ? 'condition_matched' : 'condition_failed';
    } else if (!present) code = 'missing_attribute';
    else {
      const operand = condition.values[0];
      const operandsTyped = condition.values.every((item) => typeof item === declaredType);
      switch (condition.operator) {
        case 'present':
          matches = true;
          break;
        case 'eq':
          matches = operandsTyped && value === operand;
          break;
        case 'not_eq':
          matches = operandsTyped && value !== operand;
          break;
        case 'in':
          matches = operandsTyped && !Array.isArray(value) && condition.values.includes(value!);
          break;
        case 'not_in':
          matches = operandsTyped && !Array.isArray(value) && !condition.values.includes(value!);
          break;
        case 'gt':
          matches = typeof value === 'number' && typeof operand === 'number' && value > operand;
          break;
        case 'gte':
          matches = typeof value === 'number' && typeof operand === 'number' && value >= operand;
          break;
        case 'lt':
          matches = typeof value === 'number' && typeof operand === 'number' && value < operand;
          break;
        case 'lte':
          matches = typeof value === 'number' && typeof operand === 'number' && value <= operand;
          break;
        case 'contains_any':
        case 'contains_all':
          matches =
            declaredType === 'string_list' &&
            Array.isArray(value) &&
            value.length > 0 &&
            condition.values.length > 0 &&
            condition.values.every((item) => typeof item === 'string') &&
            (condition.operator === 'contains_any'
              ? condition.values.some((item) => value.includes(item as string))
              : condition.values.every((item) => value.includes(item as string)));
          break;
      }
      code = matches ? 'condition_matched' : 'condition_failed';
    }
    trace.push({ source: 'condition', id, attribute: condition.attribute, code });
    return matches;
  }
  for (const override of overrides) {
    if (
      override.flagId !== flag.id ||
      override.projectId !== flag.projectId ||
      override.environmentId !== flag.environmentId ||
      override.tenantId !== context.tenantId ||
      override.subjectId !== context.subjectId ||
      override.revokedAt
    )
      continue;
    if (Date.parse(now) >= Date.parse(override.expiresAt)) {
      trace.push({ source: 'override', id: override.id, code: 'override_expired' });
      continue;
    }
    result.reason = 'override';
    result.matchedOverrideId = override.id;
    trace.push({ source: 'override', id: override.id, code: 'override' });
    return outcome(override.outcome);
  }
  for (const rule of configuration.rules) {
    let conditionsMatch = true;
    for (const condition of rule.conditions) {
      if (!conditionMatches(condition, rule.id)) conditionsMatch = false;
    }
    let segmentsMatch = true;
    for (const id of rule.segmentIds) {
      const segment = configuration.segments.find((item) => item.id === id);
      let matches = segment !== undefined;
      if (segment) {
        for (const condition of segment.conditions) {
          if (!conditionMatches(condition, id)) matches = false;
        }
      }
      trace.push({ source: 'segment', id, code: matches ? 'segment_matched' : 'segment_failed' });
      if (!matches) segmentsMatch = false;
    }
    if (!conditionsMatch || !segmentsMatch) {
      trace.push({ source: 'rule', id: rule.id, code: 'rule_skipped' });
      continue;
    }
    if (rule.rolloutBasisPoints === 0) {
      trace.push({ source: 'rollout', id: rule.id, code: 'rollout_excluded' });
      continue;
    }
    if (rule.rolloutBasisPoints < 10000) {
      if (!subject) {
        trace.push({ source: 'rollout', id: rule.id, code: 'missing_subject' });
        continue;
      }
      const bucket = allocationBucket(
        configuration.allocationNamespace,
        'rollout',
        subject,
        rule.id
      );
      const matches = bucket < rule.rolloutBasisPoints;
      trace.push({
        source: 'rollout',
        id: rule.id,
        code: matches ? 'rollout_matched' : 'rollout_excluded',
        bucket,
      });
      if (!matches) continue;
    }
    result.reason = 'rule';
    result.matchedRuleId = rule.id;
    trace.push({ source: 'rule', id: rule.id, code: 'rule_matched' });
    return outcome(rule.outcome);
  }
  trace.push({ source: 'default', id: null, code: 'default' });
  return outcome(configuration.defaultOutcome);
}

export function configurationWarnings(
  current: Configuration,
  proposed: Configuration
): { warnings: string[]; allocationChanged: boolean } {
  const warnings: string[] = [];
  const variantAllocation = (configuration: Configuration) =>
    configuration.variants.map(({ id, weightBasisPoints }) => ({ id, weightBasisPoints }));
  const ruleAllocation = (configuration: Configuration) =>
    configuration.rules.map(({ id, conditions, segmentIds, rolloutBasisPoints, outcome }) => ({
      id,
      conditions,
      segmentIds,
      rolloutBasisPoints,
      outcome,
    }));
  if (JSON.stringify(variantAllocation(current)) !== JSON.stringify(variantAllocation(proposed)))
    warnings.push(
      'Variant IDs, order or weights changed; subjects may receive different assignments.'
    );
  if (
    JSON.stringify(ruleAllocation(current)) !== JSON.stringify(ruleAllocation(proposed)) ||
    JSON.stringify(current.defaultOutcome) !== JSON.stringify(proposed.defaultOutcome) ||
    current.allocationNamespace !== proposed.allocationNamespace ||
    current.hashVersion !== proposed.hashVersion
  )
    warnings.push('Rule eligibility or allocation changed; review subjects before publishing.');
  if (
    current.catalogRevision !== proposed.catalogRevision ||
    JSON.stringify(current.contextDefinitions) !== JSON.stringify(proposed.contextDefinitions) ||
    JSON.stringify(current.segments) !== JSON.stringify(proposed.segments)
  )
    warnings.push('Pinned catalog or segment snapshots changed; targeting may change.');
  return { warnings, allocationChanged: warnings.length > 0 };
}
