import { describe, expect, it } from 'vitest';

import {
  byteLength,
  catalogInputSchema,
  catalogSchema,
  conditionSchema,
  configurationInput,
  contextSchema,
  defaultConfiguration,
  evaluationRequestSchema,
  previewRequestSchema,
  type Catalog,
  type Condition,
  type Configuration,
  type EvaluationContext,
} from '../shared/targeting.ts';
import { evaluate } from './evaluator.ts';
import { pinConfiguration, validateConditions } from './targeting-storage.ts';

const projectId = '20000000-0000-4000-8000-000000000001';
const ruleId = '40000000-0000-4000-8000-000000000001';
const segmentId = '50000000-0000-4000-8000-000000000001';
const catalog: Catalog = {
  projectId,
  revision: 1,
  attributes: [
    { key: 'groupIds', type: 'string_list', description: 'Effective memberships' },
    { key: 'plan', type: 'string', description: 'Plan' },
    { key: 'count', type: 'number', description: 'Count' },
    { key: 'staff', type: 'boolean', description: 'Staff' },
  ],
  segments: [],
};

function membership(operator: Condition['operator'], values: Condition['values']): Condition {
  return conditionSchema.parse({ attribute: 'groupIds', operator, values });
}

function fixture(condition = membership('contains_any', ['engineering', 'operations'])) {
  const current = defaultConfiguration('membership-release');
  const input = configurationInput(current);
  input.defaultOutcome = { kind: 'value', value: { type: 'boolean', value: false } };
  input.rules = [
    {
      id: ruleId,
      name: 'Members',
      conditions: [condition],
      segmentIds: [],
      rolloutBasisPoints: 10000,
      outcome: { kind: 'value', value: { type: 'boolean', value: true } },
    },
  ];
  return { current, input };
}

function decision(condition: Condition, attributes: EvaluationContext['attributes']) {
  const { current, input } = fixture(condition);
  return evaluateConfiguration(
    pinConfiguration(input, current, catalog, catalog.revision),
    attributes
  );
}

function evaluateConfiguration(
  configuration: Configuration,
  attributes: EvaluationContext['attributes']
) {
  return evaluate({
    flag: {
      id: '60000000-0000-4000-8000-000000000001',
      key: 'membership-release',
      projectId,
      environmentId: '30000000-0000-4000-8000-000000000001',
      enabled: true,
      archived: false,
      revision: 2,
      configuration,
    },
    context: { attributes },
    overrides: [],
    now: '2026-11-05T12:00:00.000Z',
  });
}

describe('string-list evaluation', () => {
  it.each([
    ['contains_any', ['engineering'], true],
    ['contains_any', ['operations', 'unrelated'], true],
    ['contains_any', ['unrelated'], false],
    ['contains_any', [], false],
    ['contains_all', ['operations', 'engineering', 'unrelated'], true],
    ['contains_all', ['engineering'], false],
    ['contains_all', [], false],
    ['contains_all', ['Engineering', 'operations'], false],
    ['contains_any', ['engineering,operations'], false],
    ['contains_any', [' engineering'], false],
  ] as const)('%s evaluates %j as %s', (operator, groups, matches) => {
    const result = decision(membership(operator, ['engineering', 'operations']), {
      groupIds: [...groups],
    });
    expect(result.value).toEqual({ type: 'boolean', value: matches });
    expect(result.reason).toBe(matches ? 'rule' : 'default');
    expect(result.matchedRuleId).toBe(matches ? ruleId : null);
  });

  it('uses set membership rather than order or duplicate counts, without normalizing strings', () => {
    expect(
      decision(membership('contains_all', ['operations', 'engineering', 'engineering']), {
        groupIds: ['engineering', 'operations'],
      }).value
    ).toEqual({ type: 'boolean', value: true });
    expect(decision(membership('contains_any', ['é']), { groupIds: ['e\u0301'] }).value).toEqual({
      type: 'boolean',
      value: false,
    });
  });

  it.each(['contains_any', 'contains_all'] as const)(
    '%s never coerces scalar, mixed, nested, null or object attributes',
    (operator) => {
      for (const value of [
        'engineering',
        'engineering,operations',
        true,
        1,
        ['engineering', 1],
        [['engineering']],
        null,
        { engineering: true },
      ]) {
        const result = decision(membership(operator, ['engineering']), {
          groupIds: value,
        } as EvaluationContext['attributes']);
        expect(result.value).toEqual({ type: 'boolean', value: false });
        expect(result.trace).toContainEqual({
          source: 'condition',
          id: ruleId,
          attribute: 'groupIds',
          code: 'wrong_type',
        });
      }
      const missing = decision(membership(operator, ['engineering']), {});
      expect(missing.value).toEqual({ type: 'boolean', value: false });
      expect(missing.trace).toContainEqual({
        source: 'condition',
        id: ruleId,
        attribute: 'groupIds',
        code: 'missing_attribute',
      });
    }
  );

  it('distinguishes an empty present list, an absent list and a wrong-type list', () => {
    expect(decision(membership('present', []), { groupIds: [] }).value.value).toBe(true);
    expect(decision(membership('absent', []), { groupIds: [] }).value.value).toBe(false);
    expect(decision(membership('present', []), {}).value.value).toBe(false);
    expect(decision(membership('absent', []), {}).value.value).toBe(true);
    expect(decision(membership('present', []), { groupIds: '' }).value.value).toBe(false);
    expect(decision(membership('absent', []), { groupIds: '' }).value.value).toBe(false);
  });
});

describe('membership validation and pinned publication', () => {
  it('accepts list catalog definitions and validated membership operands', () => {
    expect(catalogSchema.parse(catalog)).toEqual(catalog);
    expect(
      catalogInputSchema.safeParse({ attributes: catalog.attributes, segments: [] }).success
    ).toBe(true);
    for (const operator of ['contains_any', 'contains_all'] as const) {
      expect(() =>
        validateConditions([membership(operator, ['engineering'])], catalog.attributes)
      ).not.toThrow();
      expect(
        conditionSchema.safeParse({
          attribute: 'groupIds',
          operator,
          values: Array.from({ length: 20 }, () => 'engineering'),
        }).success
      ).toBe(true);
      for (const values of [
        [],
        [1],
        [true],
        ['engineering', 1],
        [['engineering']],
        Array(21).fill('x'),
      ])
        expect(conditionSchema.safeParse({ attribute: 'groupIds', operator, values }).success).toBe(
          false
        );
    }
  });

  it('rejects membership on scalar and built-in attributes before publication', () => {
    for (const attribute of ['plan', 'count', 'staff', 'tenantId', 'subjectId']) {
      for (const operator of ['contains_any', 'contains_all'] as const) {
        const { current, input } = fixture({ attribute, operator, values: ['engineering'] });
        expect(() => pinConfiguration(input, current, catalog, 1)).toThrow(
          'List membership requires a string-list attribute'
        );
      }
    }
  });

  it('rejects every scalar comparison on a list before publication', () => {
    for (const operator of ['eq', 'not_eq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte'] as const) {
      const { current, input } = fixture({
        attribute: 'groupIds',
        operator,
        values: ['engineering'],
      });
      expect(() => pinConfiguration(input, current, catalog, 1)).toThrow(
        'String-list attributes support only membership and presence'
      );
    }
    for (const operator of ['present', 'absent'] as const)
      expect(() =>
        validateConditions([membership(operator, [])], catalog.attributes)
      ).not.toThrow();
  });

  it('rejects a membership operand with the wrong type during catalog and publication validation', () => {
    const invalid: Condition = { attribute: 'groupIds', operator: 'contains_any', values: [1] };
    expect(() => validateConditions([invalid], catalog.attributes)).toThrow(
      'Operand type does not match attribute'
    );
    const { current, input } = fixture(invalid);
    expect(() => pinConfiguration(input, current, catalog, 1)).toThrow(
      'Operand type does not match attribute'
    );
  });

  it('validates referenced membership segments and pins snapshots rather than live catalog arrays', () => {
    const { current, input } = fixture();
    input.rules[0]!.conditions = [{ attribute: 'plan', operator: 'eq', values: ['enterprise'] }];
    input.rules[0]!.segmentIds = [segmentId];
    const withSegment: Catalog = {
      ...structuredClone(catalog),
      segments: [
        {
          id: segmentId,
          key: 'engineers',
          name: 'Engineers',
          revision: 1,
          conditions: [membership('contains_all', ['engineering'])],
        },
      ],
    };
    const pinned = pinConfiguration(input, current, withSegment, 1);
    expect(pinned.segments[0]!.conditions[0]!.operator).toBe('contains_all');
    withSegment.segments[0]!.conditions[0]!.values = ['operations'];
    expect(pinned.segments[0]!.conditions[0]!.values).toEqual(['engineering']);
    expect(
      evaluateConfiguration(pinned, { groupIds: ['engineering'], plan: 'enterprise' }).value.value
    ).toBe(true);
    expect(
      evaluateConfiguration(pinned, { groupIds: ['operations'], plan: 'enterprise' }).value.value
    ).toBe(false);
    expect(
      evaluateConfiguration(pinned, { groupIds: ['engineering'], plan: 'basic' }).value.value
    ).toBe(false);
    withSegment.attributes[0]!.type = 'string';
    expect(() => pinConfiguration(input, current, withSegment, 1)).toThrow(
      'List membership requires a string-list attribute'
    );
  });
});

describe('bounded list context', () => {
  it('accepts empty lists and the exact list and item limits without string coercion', () => {
    for (const groupIds of [[], Array.from({ length: 100 }, () => 'group'), ['x'.repeat(500)]]) {
      const context = { attributes: { groupIds } };
      expect(contextSchema.parse(context)).toEqual(context);
      expect(evaluationRequestSchema.parse({ context })).toEqual({ context });
      expect(previewRequestSchema.safeParse({ context, expectedRevision: 1 }).success).toBe(true);
    }
    expect(contextSchema.parse({ attributes: { groupIds: 'a,b' } }).attributes.groupIds).toBe(
      'a,b'
    );
  });

  it.each(
    [
      Array(101).fill('group'),
      ['x'.repeat(501)],
      ['engineering', 1],
      [['engineering']],
      [null],
      [true],
      { group: 'engineering' },
      null,
    ].map((groupIds) => ({ groupIds }))
  )('rejects invalid list or non-context value $groupIds', ({ groupIds }) => {
    const context = { attributes: { groupIds } };
    expect(contextSchema.safeParse(context).success).toBe(false);
    expect(evaluationRequestSchema.safeParse({ context }).success).toBe(false);
    expect(previewRequestSchema.safeParse({ context, expectedRevision: 1 }).success).toBe(false);
  });

  it('accepts 32 attributes but rejects 33', () => {
    const attributes = Object.fromEntries(
      Array.from({ length: 32 }, (_, index) => [`key${index}`, []])
    );
    expect(contextSchema.safeParse({ attributes }).success).toBe(true);
    expect(contextSchema.safeParse({ attributes: { ...attributes, extra: [] } }).success).toBe(
      false
    );
  });

  it('enforces the complete serialized UTF-8 context bound at exactly 32 KiB', () => {
    const context = {
      tenantId: 'tenant',
      subjectId: 'subject',
      attributes: { groupIds: Array.from({ length: 100 }, () => '') },
    };
    let remaining = 32768 - byteLength(context);
    for (let index = 0; remaining > 0; index++) {
      const length = Math.min(500, remaining);
      context.attributes.groupIds[index] = 'x'.repeat(length);
      remaining -= length;
    }
    expect(byteLength(context)).toBe(32768);
    expect(contextSchema.safeParse(context).success).toBe(true);
    context.attributes.groupIds[99] = 'x';
    expect(byteLength(context)).toBe(32769);
    expect(contextSchema.safeParse(context).success).toBe(false);
    context.attributes.groupIds[99] = 'é';
    expect(byteLength(context)).toBe(32770);
    expect(contextSchema.safeParse(context).success).toBe(false);
  });
});
