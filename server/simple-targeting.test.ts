import { describe, expect, it } from 'vitest';

import {
  readSimpleAudience,
  setSimpleAudience,
  type SimpleAudience,
} from '../shared/simple-targeting.ts';
import {
  configurationInput,
  configurationInputSchema,
  configurationSchema,
  defaultConfiguration,
  type ConfigurationInput,
  type EvaluationContext,
  type Segment,
} from '../shared/targeting.ts';
import { evaluate } from './evaluator.ts';

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const createIds = () => {
  let next = 100;
  return () => uuid(next++);
};
const everyone = () => configurationInput(defaultConfiguration('stable-simple-audience'));
const segments: Segment[] = [
  {
    id: uuid(1),
    key: 'early_access',
    name: 'Early access',
    revision: 1,
    conditions: [{ attribute: 'earlyAccess', operator: 'eq', values: [true] }],
  },
  {
    id: uuid(2),
    key: 'large_teams',
    name: 'Large teams',
    revision: 1,
    conditions: [{ attribute: 'teamSize', operator: 'gte', values: [50] }],
  },
];
const selected = (segmentIds = segments.map((segment) => segment.id)) =>
  setSimpleAudience(everyone(), { mode: 'selected', segmentIds }, segments, createIds());
function decision(configuration: ConfigurationInput, context: EvaluationContext, enabled = true) {
  return evaluate({
    flag: {
      id: uuid(10),
      projectId: uuid(11),
      environmentId: uuid(12),
      key: 'simple_audience',
      enabled,
      archived: false,
      revision: 1,
      configuration: configurationSchema.parse({
        ...configuration,
        catalogRevision: 1,
        contextDefinitions: [
          { key: 'earlyAccess', type: 'boolean', description: '' },
          { key: 'teamSize', type: 'number', description: '' },
        ],
        segments: segments.filter((segment) =>
          configuration.rules.some((rule) => rule.segmentIds.includes(segment.id))
        ),
      }),
    },
    context,
    overrides: [],
    now: '2026-11-04T12:00:00.000Z',
  });
}

describe('simple audience evaluation uses the existing evaluator', () => {
  it('recognizes a new flag as Everyone and admits without an identity when enabled', () => {
    const configuration = everyone();
    expect(readSimpleAudience(configuration)).toEqual({ mode: 'everyone', segmentIds: [] });
    expect(decision(configuration, { attributes: {} })).toMatchObject({
      value: { type: 'boolean', value: true },
      reason: 'default',
    });
    expect(decision(configuration, { attributes: {} }, false)).toMatchObject({
      value: { type: 'boolean', value: false },
      reason: 'disabled',
    });
  });

  it('keeps an empty selected audience as nobody, never implicitly Everyone', () => {
    const configuration = selected([]);
    expect(readSimpleAudience(configuration)).toEqual({ mode: 'selected', segmentIds: [] });
    const contexts: EvaluationContext[] = [
      { attributes: {} },
      { attributes: { earlyAccess: true, teamSize: 100 } },
    ];
    for (const context of contexts) {
      expect(decision(configuration, context).value).toEqual({
        type: 'boolean',
        value: false,
      });
    }
    const cleared = setSimpleAudience(
      selected(),
      { mode: 'selected', segmentIds: [] },
      segments,
      createIds()
    );
    expect(cleared).toEqual(configuration);
  });

  it('admits any selected segment, not only their intersection', () => {
    const configuration = selected();
    expect(readSimpleAudience(configuration)).toEqual({
      mode: 'selected',
      segmentIds: segments.map((segment) => segment.id),
    });
    for (const [attributes, admitted, matchedRuleId] of [
      [{ earlyAccess: true, teamSize: 1 }, true, uuid(100)],
      [{ earlyAccess: false, teamSize: 50 }, true, uuid(101)],
      [{ earlyAccess: true, teamSize: 100 }, true, uuid(100)],
      [{ earlyAccess: false, teamSize: 49 }, false, null],
      [{}, false, null],
      [{ earlyAccess: 'true', teamSize: '50' }, false, null],
    ] as const) {
      expect(decision(configuration, { attributes })).toMatchObject({
        value: { type: 'boolean', value: admitted },
        matchedRuleId,
      });
    }
    expect(decision(configuration, { attributes: { earlyAccess: true } }, false).value).toEqual({
      type: 'boolean',
      value: false,
    });
  });
});

describe('simple audience updates preserve allocation and existing identities', () => {
  it('retains rule IDs and names, creating IDs only for newly selected segments', () => {
    const configuration = selected([segments[0]!.id]);
    configuration.rules[0]!.name = 'Keep this operator-authored name';
    const before = structuredClone(configuration);
    let generated = 0;
    const next = setSimpleAudience(
      configuration,
      { mode: 'selected', segmentIds: [segments[1]!.id, segments[0]!.id] },
      segments,
      () => {
        generated++;
        return uuid(200);
      }
    );
    expect(generated).toBe(1);
    expect(next.rules[1]).toEqual(configuration.rules[0]);
    expect(next.rules[0]).toMatchObject({ id: uuid(200), name: 'Large teams' });
    expect(next.allocationNamespace).toBe(configuration.allocationNamespace);
    expect(next.hashVersion).toBe(configuration.hashVersion);
    expect(configuration).toEqual(before);
    expect(configurationInputSchema.safeParse(next).success).toBe(true);

    const retained = setSimpleAudience(
      next,
      { mode: 'selected', segmentIds: [segments[0]!.id] },
      segments,
      () => {
        throw new Error('Retained branches must not allocate new IDs');
      }
    );
    expect(retained.rules).toEqual(configuration.rules);
  });

  it('only changes to Everyone explicitly and does not allocate a rule ID', () => {
    const configuration = selected();
    const next = setSimpleAudience(
      configuration,
      { mode: 'everyone', segmentIds: [] },
      segments,
      () => {
        throw new Error('Everyone must not allocate a rule ID');
      }
    );
    expect(readSimpleAudience(next)).toEqual({ mode: 'everyone', segmentIds: [] });
    expect(next.rules).toEqual([]);
    expect(next.allocationNamespace).toBe(configuration.allocationNamespace);
    expect(decision(next, { attributes: {} }).value).toEqual({ type: 'boolean', value: true });
  });

  it('preserves selected refs missing from the current catalog instead of silently dropping them', () => {
    const configuration = selected();
    const next = setSimpleAudience(
      configuration,
      { mode: 'selected', segmentIds: segments.map((segment) => segment.id) },
      [],
      () => {
        throw new Error('Existing missing refs must retain their rules');
      }
    );
    expect(next).toEqual(configuration);
    expect(() =>
      setSimpleAudience(everyone(), { mode: 'selected', segmentIds: [uuid(999)] }, [], createIds())
    ).toThrow();
  });

  it('accepts pinned historical segment definitions without pretending they are current catalog refs', () => {
    const pinned = { ...segments[0]!, revision: 4, name: 'Pinned historical name' };
    const next = setSimpleAudience(
      everyone(),
      { mode: 'selected', segmentIds: [pinned.id] },
      [pinned],
      createIds()
    );
    expect(next.rules[0]).toMatchObject({ name: pinned.name, segmentIds: [pinned.id] });
  });

  it('allows 20 audiences and rejects overflow, duplicates and contradictory Everyone selections', () => {
    const catalog = Array.from({ length: 21 }, (_, index) => ({
      ...segments[0]!,
      id: uuid(300 + index),
      key: `segment_${index}`,
    }));
    const allIds = catalog.map((segment) => segment.id);
    const next = setSimpleAudience(
      everyone(),
      { mode: 'selected', segmentIds: allIds.slice(0, 20) },
      catalog,
      createIds()
    );
    expect(next.rules).toHaveLength(20);
    expect(configurationInputSchema.safeParse(next).success).toBe(true);
    for (const audience of [
      { mode: 'selected', segmentIds: allIds },
      { mode: 'selected', segmentIds: [allIds[0]!, allIds[0]!] },
      { mode: 'everyone', segmentIds: [allIds[0]!] },
    ] satisfies SimpleAudience[]) {
      expect(() => setSimpleAudience(everyone(), audience, catalog, createIds())).toThrow();
    }
  });

  it('rejects duplicate generated rule IDs rather than returning an invalid configuration', () => {
    expect(() =>
      setSimpleAudience(
        everyone(),
        { mode: 'selected', segmentIds: segments.map((segment) => segment.id) },
        segments,
        () => uuid(100)
      )
    ).toThrow();
  });
});

describe('advanced configurations are never rewritten as simple audiences', () => {
  const advancedShapes: [string, (configuration: ConfigurationInput) => void][] = [
    [
      'true off value',
      (configuration) => {
        configuration.offValue = { type: 'boolean', value: true };
      },
    ],
    [
      'typed values',
      (configuration) => {
        configuration.offValue = { type: 'string', value: 'off' };
        configuration.defaultOutcome = {
          kind: 'value',
          value: { type: 'string', value: 'default' },
        };
        for (const rule of configuration.rules)
          rule.outcome = { kind: 'value', value: { type: 'string', value: 'on' } };
      },
    ],
    [
      'variants',
      (configuration) => {
        configuration.variants = [
          {
            id: 'on',
            name: 'On',
            weightBasisPoints: 10000,
            value: { type: 'boolean', value: true },
          },
        ];
      },
    ],
    [
      'variant default',
      (configuration) => {
        configuration.defaultOutcome = { kind: 'variant', variantId: 'on' };
      },
    ],
    [
      'weighted default',
      (configuration) => {
        configuration.defaultOutcome = { kind: 'weighted' };
      },
    ],
    [
      'true default with rules',
      (configuration) => {
        configuration.defaultOutcome = {
          kind: 'value',
          value: { type: 'boolean', value: true },
        };
      },
    ],
    [
      'partial rollout',
      (configuration) => {
        configuration.rules[0]!.rolloutBasisPoints = 9999;
      },
    ],
    [
      'zero rollout',
      (configuration) => {
        configuration.rules[0]!.rolloutBasisPoints = 0;
      },
    ],
    [
      'inline conditions',
      (configuration) => {
        configuration.rules[0]!.conditions = [
          { attribute: 'earlyAccess', operator: 'eq', values: [true] },
        ];
      },
    ],
    [
      'unconditional branch',
      (configuration) => {
        configuration.rules[0]!.segmentIds = [];
      },
    ],
    [
      'AND segments',
      (configuration) => {
        configuration.rules[0]!.segmentIds = segments.map((segment) => segment.id);
      },
    ],
    [
      'false rule outcome',
      (configuration) => {
        configuration.rules[0]!.outcome = {
          kind: 'value',
          value: { type: 'boolean', value: false },
        };
      },
    ],
    [
      'weighted rule outcome',
      (configuration) => {
        configuration.rules[0]!.outcome = { kind: 'weighted' };
      },
    ],
    [
      'duplicate segment refs',
      (configuration) => {
        configuration.rules[1]!.segmentIds = [...configuration.rules[0]!.segmentIds];
      },
    ],
    [
      'duplicate rule IDs',
      (configuration) => {
        configuration.rules[1]!.id = configuration.rules[0]!.id;
      },
    ],
    [
      'too many branches',
      (configuration) => {
        configuration.rules = Array.from({ length: 21 }, (_, index) => ({
          ...configuration.rules[0]!,
          id: uuid(500 + index),
          segmentIds: [uuid(600 + index)],
        }));
      },
    ],
  ];
  for (const [name, mutate] of advancedShapes) {
    it(`refuses ${name} without lossy rewriting`, () => {
      const configuration = selected();
      mutate(configuration);
      const before = structuredClone(configuration);
      expect(readSimpleAudience(configuration)).toBeNull();
      for (const audience of [
        { mode: 'everyone', segmentIds: [] },
        { mode: 'selected', segmentIds: [segments[0]!.id] },
      ] satisfies SimpleAudience[]) {
        expect(() => setSimpleAudience(configuration, audience, segments, createIds())).toThrow();
        expect(configuration).toEqual(before);
      }
    });
  }
});
