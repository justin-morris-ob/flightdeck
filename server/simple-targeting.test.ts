import { describe, expect, it } from 'vitest';

import { directoryAttributes, type DirectoryAudience } from '../shared/directory.ts';
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
  setSimpleAudience(
    everyone(),
    { mode: 'selected', segmentIds, directoryTargets: [] },
    segments,
    createIds()
  );
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
          ...directoryAttributes,
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
    expect(readSimpleAudience(configuration)).toEqual({
      mode: 'everyone',
      segmentIds: [],
      directoryTargets: [],
    });
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
    expect(readSimpleAudience(configuration)).toEqual({
      mode: 'selected',
      segmentIds: [],
      directoryTargets: [],
    });
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
      { mode: 'selected', segmentIds: [], directoryTargets: [] },
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
      directoryTargets: [],
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
      { mode: 'selected', segmentIds: [segments[1]!.id, segments[0]!.id], directoryTargets: [] },
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
      { mode: 'selected', segmentIds: [segments[0]!.id], directoryTargets: [] },
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
      { mode: 'everyone', segmentIds: [], directoryTargets: [] },
      segments,
      () => {
        throw new Error('Everyone must not allocate a rule ID');
      }
    );
    expect(readSimpleAudience(next)).toEqual({
      mode: 'everyone',
      segmentIds: [],
      directoryTargets: [],
    });
    expect(next.rules).toEqual([]);
    expect(next.allocationNamespace).toBe(configuration.allocationNamespace);
    expect(decision(next, { attributes: {} }).value).toEqual({ type: 'boolean', value: true });
  });

  it('preserves selected refs missing from the current catalog instead of silently dropping them', () => {
    const configuration = selected();
    const next = setSimpleAudience(
      configuration,
      { mode: 'selected', segmentIds: segments.map((segment) => segment.id), directoryTargets: [] },
      [],
      () => {
        throw new Error('Existing missing refs must retain their rules');
      }
    );
    expect(next).toEqual(configuration);
    expect(() =>
      setSimpleAudience(
        everyone(),
        { mode: 'selected', segmentIds: [uuid(999)], directoryTargets: [] },
        [],
        createIds()
      )
    ).toThrow();
  });

  it('accepts pinned historical segment definitions without pretending they are current catalog refs', () => {
    const pinned = { ...segments[0]!, revision: 4, name: 'Pinned historical name' };
    const next = setSimpleAudience(
      everyone(),
      { mode: 'selected', segmentIds: [pinned.id], directoryTargets: [] },
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
      { mode: 'selected', segmentIds: allIds.slice(0, 20), directoryTargets: [] },
      catalog,
      createIds()
    );
    expect(next.rules).toHaveLength(20);
    expect(configurationInputSchema.safeParse(next).success).toBe(true);
    for (const audience of [
      { mode: 'selected', segmentIds: allIds, directoryTargets: [] },
      { mode: 'selected', segmentIds: [allIds[0]!, allIds[0]!], directoryTargets: [] },
      { mode: 'everyone', segmentIds: [allIds[0]!], directoryTargets: [] },
    ] satisfies SimpleAudience[]) {
      expect(() => setSimpleAudience(everyone(), audience, catalog, createIds())).toThrow();
    }
  });

  it('rejects duplicate generated rule IDs rather than returning an invalid configuration', () => {
    expect(() =>
      setSimpleAudience(
        everyone(),
        {
          mode: 'selected',
          segmentIds: segments.map((segment) => segment.id),
          directoryTargets: [],
        },
        segments,
        () => uuid(100)
      )
    ).toThrow();
  });
});

const binding = { sourceId: 'bc-primary', tenantId: uuid(900) };
const directoryTarget = (
  kind: DirectoryAudience['kind'],
  ids = kind === 'people' ? [uuid(700), uuid(701)] : ['12', '34']
): DirectoryAudience => ({ ...binding, kind, ids });
const directorySelected = (directoryTargets: DirectoryAudience[], segmentIds: string[] = []) =>
  setSimpleAudience(
    everyone(),
    { mode: 'selected', segmentIds, directoryTargets },
    segments,
    createIds()
  );

describe('directory audiences compile to scoped evaluator predicates', () => {
  it('publishes and evaluates the longest supported source binding without truncating identity', () => {
    const target = { ...directoryTarget('groups'), sourceId: 's'.repeat(128) };
    const configuration = configurationInputSchema.parse(directorySelected([target]));
    const context = {
      tenantId: target.tenantId,
      attributes: { sourceId: target.sourceId, groupIds: ['12'] },
    };
    expect(decision(configuration, context).value).toEqual({ type: 'boolean', value: true });
    expect(
      decision(configuration, {
        ...context,
        attributes: { ...context.attributes, sourceId: target.sourceId.slice(0, 120) },
      }).value
    ).toEqual({ type: 'boolean', value: false });
  });
  it('uses subjectId IN for multiple people and requires both source and tenant', () => {
    const target = directoryTarget('people');
    const configuration = directorySelected([target]);
    expect(configuration.rules[0]!.conditions).toEqual([
      { attribute: 'tenantId', operator: 'eq', values: [binding.tenantId] },
      { attribute: 'sourceId', operator: 'eq', values: [binding.sourceId] },
      { attribute: 'subjectId', operator: 'in', values: target.ids },
    ]);
    const matching: EvaluationContext = {
      tenantId: binding.tenantId,
      subjectId: target.ids[0]!,
      attributes: { sourceId: binding.sourceId },
    };
    for (const subjectId of target.ids) {
      expect(decision(configuration, { ...matching, subjectId })).toMatchObject({
        value: { type: 'boolean', value: true },
        matchedRuleId: configuration.rules[0]!.id,
      });
    }
    const rejected: EvaluationContext[] = [
      { ...matching, subjectId: uuid(702) },
      { tenantId: binding.tenantId, attributes: matching.attributes },
      { subjectId: target.ids[0]!, attributes: matching.attributes },
      { ...matching, tenantId: 'tenant-b' },
      { ...matching, attributes: {} },
      { ...matching, attributes: { sourceId: 'bc-other' } },
      { ...matching, attributes: { sourceId: [binding.sourceId] } },
    ];
    for (const context of rejected) {
      expect(decision(configuration, context)).toMatchObject({
        value: { type: 'boolean', value: false },
        matchedRuleId: null,
      });
    }
  });

  for (const kind of ['organizations', 'groups'] as const) {
    it(`uses exact contains_any membership for ${kind} within the selected binding`, () => {
      const target = directoryTarget(kind);
      const attribute = kind === 'organizations' ? 'organizationIds' : 'groupIds';
      const otherAttribute = kind === 'organizations' ? 'groupIds' : 'organizationIds';
      const configuration = directorySelected([target]);
      expect(configuration.rules[0]!.conditions).toEqual([
        { attribute: 'tenantId', operator: 'eq', values: [binding.tenantId] },
        { attribute: 'sourceId', operator: 'eq', values: [binding.sourceId] },
        { attribute, operator: 'contains_any', values: target.ids },
      ]);
      const context: EvaluationContext = {
        tenantId: binding.tenantId,
        subjectId: uuid(702),
        attributes: { sourceId: binding.sourceId },
      };
      for (const memberships of [['12'], ['99', '34'], ['12', '34']]) {
        expect(
          decision(configuration, {
            ...context,
            attributes: { ...context.attributes, [attribute]: memberships },
          })
        ).toMatchObject({
          value: { type: 'boolean', value: true },
          matchedRuleId: configuration.rules[0]!.id,
        });
      }
      const nonmatchingAttributes: EvaluationContext['attributes'][] = [
        {},
        { [attribute]: [] },
        { [attribute]: ['112', '340', '012'] },
        { [attribute]: '12' },
        { [attribute]: 12 },
        { [otherAttribute]: ['12'] },
      ];
      for (const attributes of nonmatchingAttributes) {
        expect(
          decision(configuration, {
            ...context,
            attributes: { sourceId: binding.sourceId, ...attributes },
          }).value
        ).toEqual({ type: 'boolean', value: false });
      }
      const foreignContexts: EvaluationContext[] = [
        { ...context, attributes: { [attribute]: ['12'] } },
        { ...context, attributes: { sourceId: 'bc-other', [attribute]: ['12'] } },
        {
          ...context,
          tenantId: 'tenant-b',
          attributes: {
            sourceId: binding.sourceId,
            [attribute]: ['12'],
          },
        },
        { attributes: { sourceId: binding.sourceId, [attribute]: ['12'] } },
      ];
      for (const foreign of foreignContexts) {
        expect(decision(configuration, foreign).value).toEqual({
          type: 'boolean',
          value: false,
        });
      }
    });
  }
});

describe('mixed simple audiences preserve directory and segment identities', () => {
  it('roundtrips every kind and edits IDs without replacing retained branches', () => {
    const targets = [
      directoryTarget('people'),
      directoryTarget('organizations'),
      directoryTarget('groups'),
    ];
    const configuration = directorySelected(targets, [segments[0]!.id]);
    configuration.rules[0]!.name = 'Retain segment name';
    configuration.rules[1]!.name = 'Retain people name';
    const before = structuredClone(configuration);
    const audience = readSimpleAudience(configuration)!;
    expect(audience).toEqual({
      mode: 'selected',
      segmentIds: [segments[0]!.id],
      directoryTargets: targets,
    });
    const noNewIds = () => {
      throw new Error('Retained audience branches must not allocate new IDs');
    };
    expect(setSimpleAudience(configuration, audience, segments, noNewIds)).toEqual(configuration);
    const changedTargets = [
      directoryTarget('people', [uuid(701), uuid(703)]),
      targets[2]!,
      directoryTarget('organizations', ['34', '56']),
    ];
    const edited = setSimpleAudience(
      configuration,
      { ...audience, directoryTargets: changedTargets },
      segments,
      noNewIds
    );
    expect(edited.rules[0]).toEqual(configuration.rules[0]);
    expect(edited.rules.map((rule) => rule.id)).toEqual([
      configuration.rules[0]!.id,
      configuration.rules[1]!.id,
      configuration.rules[3]!.id,
      configuration.rules[2]!.id,
    ]);
    expect(edited.rules[1]!.name).toBe(configuration.rules[1]!.name);
    expect(readSimpleAudience(edited)).toEqual({ ...audience, directoryTargets: changedTargets });
    expect(edited.allocationNamespace).toBe(configuration.allocationNamespace);
    expect(edited.hashVersion).toBe(configuration.hashVersion);
    expect(configurationInputSchema.safeParse(edited).success).toBe(true);
    expect(configuration).toEqual(before);
  });

  it('removes segments without losing direct branches, and Everyone explicitly clears both', () => {
    const targets = [directoryTarget('people'), directoryTarget('groups')];
    const configuration = directorySelected(targets, [segments[0]!.id]);
    const retained = setSimpleAudience(
      configuration,
      { mode: 'selected', segmentIds: [], directoryTargets: targets },
      segments,
      createIds()
    );
    expect(retained.rules).toEqual(configuration.rules.slice(1));
    expect(
      decision(retained, {
        tenantId: binding.tenantId,
        subjectId: uuid(700),
        attributes: { sourceId: binding.sourceId },
      }).value
    ).toEqual({ type: 'boolean', value: true });
    expect(decision(retained, { attributes: { earlyAccess: true } }).value).toEqual({
      type: 'boolean',
      value: false,
    });
    expect(decision(configuration, { attributes: { earlyAccess: true } }).value).toEqual({
      type: 'boolean',
      value: true,
    });
    const cleared = setSimpleAudience(
      configuration,
      { mode: 'everyone', segmentIds: [], directoryTargets: [] },
      segments,
      () => {
        throw new Error('Everyone must not allocate IDs');
      }
    );
    expect(cleared.rules).toEqual([]);
    expect(readSimpleAudience(cleared)).toEqual({
      mode: 'everyone',
      segmentIds: [],
      directoryTargets: [],
    });
    expect(decision(cleared, { attributes: {} }).value).toEqual({
      type: 'boolean',
      value: true,
    });
  });

  it('counts direct and segment branches together and rejects duplicate kind plus binding', () => {
    const targets = Array.from({ length: 20 }, (_, index) => ({
      ...directoryTarget('people'),
      sourceId: `bc-source-${index}`,
    }));
    expect(directorySelected(targets).rules).toHaveLength(20);
    expect(directorySelected(targets.slice(0, 19), [segments[0]!.id]).rules).toHaveLength(20);
    for (const audience of [
      { mode: 'selected', segmentIds: [segments[0]!.id], directoryTargets: targets },
      {
        mode: 'selected',
        segmentIds: [],
        directoryTargets: [...targets, { ...targets[0]!, tenantId: uuid(901) }],
      },
      {
        mode: 'selected',
        segmentIds: [],
        directoryTargets: [
          directoryTarget('people', [uuid(700)]),
          directoryTarget('people', [uuid(701)]),
        ],
      },
      { mode: 'everyone', segmentIds: [], directoryTargets: [targets[0]!] },
    ] satisfies SimpleAudience[]) {
      expect(() => setSimpleAudience(everyone(), audience, segments, createIds())).toThrow();
    }
    const distinctBindings = [
      directoryTarget('people'),
      { ...directoryTarget('people'), sourceId: 'bc-other' },
      { ...directoryTarget('people'), tenantId: uuid(901) },
      directoryTarget('groups'),
    ];
    expect(readSimpleAudience(directorySelected(distinctBindings))!.directoryTargets).toEqual(
      distinctBindings
    );
  });
});

describe('non-representable directory rules remain advanced without data loss', () => {
  const mutations: [string, (configuration: ConfigurationInput) => void][] = [
    [
      'extra condition',
      (configuration) => {
        configuration.rules[0]!.conditions.push({
          attribute: 'earlyAccess',
          operator: 'eq',
          values: [true],
        });
      },
    ],
    [
      'missing source',
      (configuration) => {
        configuration.rules[0]!.conditions.splice(1, 1);
      },
    ],
    [
      'missing tenant',
      (configuration) => {
        configuration.rules[0]!.conditions.splice(0, 1);
      },
    ],
    [
      'partial rollout',
      (configuration) => {
        configuration.rules[0]!.rolloutBasisPoints = 5000;
      },
    ],
    [
      'people equality instead of membership',
      (configuration) => {
        configuration.rules[0]!.conditions[2]!.operator = 'eq';
        configuration.rules[0]!.conditions[2]!.values = [uuid(700)];
      },
    ],
    [
      'unscoped source alternative',
      (configuration) => {
        configuration.rules[0]!.conditions[1]!.operator = 'in';
        configuration.rules[0]!.conditions[1]!.values.push('bc-other');
      },
    ],
    [
      'segment intersection',
      (configuration) => {
        configuration.rules[0]!.segmentIds = [segments[0]!.id];
      },
    ],
    [
      'duplicate directory binding',
      (configuration) => {
        configuration.rules.push({ ...structuredClone(configuration.rules[0]!), id: uuid(999) });
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    it(`refuses ${name} rather than silently compiling away its meaning`, () => {
      const configuration = directorySelected([directoryTarget('people')]);
      mutate(configuration);
      const before = structuredClone(configuration);
      expect(readSimpleAudience(configuration)).toBeNull();
      for (const audience of [
        { mode: 'everyone', segmentIds: [], directoryTargets: [] },
        { mode: 'selected', segmentIds: [], directoryTargets: [directoryTarget('people')] },
      ] satisfies SimpleAudience[]) {
        expect(() => setSimpleAudience(configuration, audience, segments, createIds())).toThrow();
        expect(configuration).toEqual(before);
      }
    });
  }

  for (const kind of ['organizations', 'groups'] as const) {
    it(`preserves advanced contains_all semantics for ${kind}`, () => {
      const configuration = directorySelected([directoryTarget(kind)]);
      configuration.rules[0]!.conditions[2]!.operator = 'contains_all';
      const before = structuredClone(configuration);
      expect(readSimpleAudience(configuration)).toBeNull();
      expect(() =>
        setSimpleAudience(
          configuration,
          { mode: 'selected', segmentIds: [], directoryTargets: [directoryTarget(kind)] },
          segments,
          createIds()
        )
      ).toThrow();
      expect(configuration).toEqual(before);
    });
  }
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
        { mode: 'everyone', segmentIds: [], directoryTargets: [] },
        { mode: 'selected', segmentIds: [segments[0]!.id], directoryTargets: [] },
      ] satisfies SimpleAudience[]) {
        expect(() => setSimpleAudience(configuration, audience, segments, createIds())).toThrow();
        expect(configuration).toEqual(before);
      }
    });
  }
});
