import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { evaluationSchema } from '../shared/contracts.ts';
import { configurationSchema } from '../shared/targeting.ts';
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

it('warns on variant interval, rule eligibility and pinned snapshot changes', () => {
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
