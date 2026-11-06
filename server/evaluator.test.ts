import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { evaluationSchema } from '../shared/contracts.ts';
import { byteLength, configurationSchema } from '../shared/targeting.ts';
import {
  allocationBucket,
  configurationWarnings,
  evaluate,
  UnknownFlagError,
} from './evaluator.ts';

const vectors = JSON.parse(
  readFileSync(new URL('../shared/evaluation-vectors.json', import.meta.url), 'utf8')
) as {
  hashes: {
    namespace: string;
    purpose: 'rollout' | 'variant';
    subject: { tenantId: string; subjectId: string };
    ruleId: string;
    bucket: number;
  }[];
  decisions: {
    name: string;
    input: Parameters<typeof evaluate>[0];
    expected?: Record<string, unknown>;
    error?: string;
  }[];
};
const fixture = () =>
  structuredClone(vectors.decisions.find((vector) => vector.name === 'ordered first match')!.input);

describe('language-neutral evaluation decisions', () => {
  for (const vector of vectors.decisions) {
    it(vector.name, () => {
      if (vector.error) {
        expect(() => evaluate(vector.input)).toThrow(UnknownFlagError);
        try {
          evaluate(vector.input);
        } catch (error) {
          expect(error).toHaveProperty('code', vector.error);
        }
        return;
      }
      const result = evaluate(vector.input);
      expect(result).toMatchObject(vector.expected!);
      expect(evaluationSchema.safeParse(result).success).toBe(true);
      expect(result.revision).toBe(vector.input.flag!.revision);
      expect(result.catalogRevision).toBe(vector.input.flag!.configuration.catalogRevision);
      for (const entry of result.trace) {
        expect(
          Object.keys(entry).every((key) =>
            ['source', 'id', 'code', 'attribute', 'bucket'].includes(key)
          )
        ).toBe(true);
      }
    });
  }
  for (const vector of vectors.hashes) {
    it(`independent hash ${vector.purpose} ${JSON.stringify(vector.subject)}`, () => {
      expect(
        allocationBucket(vector.namespace, vector.purpose, vector.subject, vector.ruleId)
      ).toBe(vector.bucket);
    });
  }
});

it('raising admission thresholds preserves every previously eligible subject', () => {
  const input = fixture();
  const configuration = input.flag!.configuration;
  configuration.rules = [configuration.rules[0]!];
  for (let subject = 0; subject < 200; subject++) {
    input.context = { tenantId: 'tenant', subjectId: String(subject), attributes: {} };
    let admitted = false;
    for (const threshold of [0, 1, 100, 1000, 3000, 5000, 9999, 10000]) {
      configuration.rules[0]!.rolloutBasisPoints = threshold;
      const next = evaluate(input).reason === 'rule';
      if (admitted) expect(next).toBe(true);
      admitted = next;
    }
    expect(admitted).toBe(true);
  }
});

it('presentation renames preserve assignment and are not allocation changes', () => {
  const input = structuredClone(
    vectors.decisions.find((vector) => vector.name === 'weighted assignment')!.input
  );
  const before = evaluate(input);
  const current = structuredClone(input.flag!.configuration);
  for (const variant of input.flag!.configuration.variants) variant.name = `Renamed ${variant.id}`;
  expect(evaluate(input)).toEqual(before);
  expect(configurationWarnings(current, input.flag!.configuration)).toEqual({
    warnings: [],
    allocationChanged: false,
  });
  const ruled = fixture();
  const prior = evaluate(ruled);
  ruled.flag!.configuration.rules[0]!.name = 'New rule display name';
  expect(evaluate(ruled)).toEqual(prior);
});

it('rule-specific admission is independent of globally stable variant assignment', () => {
  const subject = { tenantId: 'tenant', subjectId: 'subject' };
  expect(allocationBucket('release', 'variant', subject, 'first')).toBe(
    allocationBucket('release', 'variant', subject, 'second')
  );
  const rollout = allocationBucket('release', 'rollout', subject, 'first');
  expect(rollout).not.toBe(allocationBucket('release', 'variant', subject, 'first'));
  expect(rollout).not.toBe(allocationBucket('release', 'rollout', subject, 'second'));
});

it.each([
  { segments: 11, attribute: 'x' },
  { segments: 9, attribute: 'a'.repeat(64) },
  { segments: 7, attribute: 'a'.repeat(64) },
])(
  'rejects followed definitions exceeding the evaluation trace budget ($segments segments)',
  ({ segments, attribute }) => {
    const input = fixture();
    const configuration = input.flag!.configuration;
    configuration.contextDefinitions = [];
    configuration.segments = Array.from({ length: segments }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      key: `audience_${index}`,
      name: `Audience ${index}`,
      revision: 1,
      contextDefinitions: [{ key: attribute, type: 'string' as const, description: '' }],
      blocks: Array.from({ length: 20 }, () => ({
        conditions: Array.from({ length: 10 }, () => ({
          attribute,
          operator: 'present' as const,
          values: [],
        })),
      })),
    }));
    const rule = configuration.rules[0]!;
    configuration.rules = Array.from({ length: Math.ceil(segments / 5) }, (_, index) => ({
      ...rule,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      conditions: [
        { attribute: 'subjectId', operator: 'eq' as const, values: ['not-this-subject'] },
      ],
      segmentIds: configuration.segments
        .slice(index * 5, (index + 1) * 5)
        .map((segment) => segment.id),
    }));
    const decision = evaluate(input);
    if (segments === 7) {
      expect(decision.trace.length).toBeLessThan(1500);
      expect(byteLength(decision.trace)).toBeGreaterThan(192 * 1024);
    } else expect(decision.trace.length > 2000 || byteLength(decision) > 256 * 1024).toBe(true);
    expect(configurationSchema.safeParse(configuration).success).toBe(false);
  }
);

it('evaluates complete followed operand data without charging it to flag-owned storage', () => {
  const input = fixture();
  const configuration = input.flag!.configuration;
  configuration.contextDefinitions = [];
  configuration.segments = Array.from({ length: 5 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key: `audience_${index}`,
    name: `Audience ${index}`,
    revision: 1,
    contextDefinitions: [{ key: 'x', type: 'string' as const, description: '' }],
    blocks: [
      {
        conditions: Array.from({ length: 2 }, () => ({
          attribute: 'x',
          operator: 'in' as const,
          values: [
            'admitted',
            ...Array.from({ length: 19 }, (_, value) => `${value}`.padEnd(490, 'x')),
          ],
        })),
      },
    ],
  }));
  configuration.rules = [
    {
      ...configuration.rules[0]!,
      conditions: [],
      segmentIds: configuration.segments.map((segment) => segment.id),
      rolloutBasisPoints: 10000,
      outcome: { kind: 'value', value: { type: 'boolean', value: true } },
    },
  ];
  expect(byteLength(configuration)).toBeGreaterThan(65536);
  configurationSchema.parse(configuration);
  input.context.attributes = { x: 'admitted' };
  expect(evaluationSchema.parse(evaluate(input)).value.value).toBe(true);
  input.context.attributes = { x: 'excluded' };
  expect(evaluate(input).reason).toBe('default');
});

it('warns on variant intervals, rule eligibility and published context revision changes', () => {
  const input = structuredClone(
    vectors.decisions.find((vector) => vector.name === 'weighted assignment')!.input
  );
  const current = input.flag!.configuration;
  const proposed = structuredClone(current);
  proposed.variants.reverse();
  expect(configurationWarnings(current, proposed).allocationChanged).toBe(true);
  const rules = fixture().flag!.configuration;
  const changedRule = structuredClone(rules);
  changedRule.rules[0]!.rolloutBasisPoints = 5000;
  expect(configurationWarnings(rules, changedRule).warnings.length).toBeGreaterThan(0);
  const refreshed = structuredClone(current);
  refreshed.catalogRevision++;
  expect(configurationWarnings(current, refreshed).allocationChanged).toBe(true);
});

it('rejects invalid variant totals, types and references before publication', () => {
  const current = structuredClone(
    vectors.decisions.find((vector) => vector.name === 'weighted assignment')!.input.flag!
      .configuration
  );
  expect(configurationSchema.safeParse(current).success).toBe(true);
  current.variants[0]!.weightBasisPoints = 1;
  expect(configurationSchema.safeParse(current).success).toBe(false);
  current.variants[0]!.weightBasisPoints = 0;
  current.variants[0]!.value = { type: 'string', value: 'wrong' };
  expect(configurationSchema.safeParse(current).success).toBe(false);
  current.variants[0]!.value = { type: 'boolean', value: false };
  current.defaultOutcome = { kind: 'variant', variantId: 'missing' };
  expect(configurationSchema.safeParse(current).success).toBe(false);
});
