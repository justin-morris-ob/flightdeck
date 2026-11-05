import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import { Badge, Block, Button, Empty, Notice } from '@onebrief/atlas-ui';

import { flagSchema, previewSchema, type Flag } from '../shared/contracts.ts';
import { directoryAttributes } from '../shared/directory.ts';
import { readSimpleAudience } from '../shared/simple-targeting.ts';
import {
  catalogSchema,
  configurationInput,
  configurationInputSchema,
  previewRequestSchema,
  publishConfigurationSchema,
  type Catalog,
  type ConfigurationInput,
  type EvaluationContext,
  type Rule,
  type TypedValue,
} from '../shared/targeting.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { Decision } from './Decision.tsx';
import { Confirm } from './forms.tsx';
import { SimpleTargeting } from './SimpleTargeting.tsx';
import {
  ConditionsEditor,
  ContextEditor,
  initialValue,
  OutcomeEditor,
  ValueDisplay,
  ValueEditor,
} from './TargetingForms.tsx';

type Preview = z.infer<typeof previewSchema>;
interface Props {
  request: Request;
  scope: string;
  path: string;
  flag: Flag;
  writable: boolean;
  projectName: string;
  environmentName: string;
  onChanged: (flag: Flag) => void;
}

export function ConfigurationEditor({
  request,
  scope,
  path,
  flag,
  writable,
  projectName,
  environmentName,
  onChanged,
}: Props) {
  const [draft, setDraft] = useState<ConfigurationInput>(() =>
    configurationInput(flag.configuration)
  );
  const [undoDraft, setUndoDraft] = useState<ConfigurationInput | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [context, setContext] = useState<EvaluationContext>({ attributes: {} });
  const [contextModel, setContextModel] = useState<'current' | 'pinned'>(
    writable ? 'current' : 'pinned'
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ConfigurationInput | null>(null);
  const [reviewMode, setReviewMode] = useState<'audience' | 'simulation'>('audience');
  const [invalidConfigurationFields, setInvalidConfigurationFields] = useState(false);
  const requestVersion = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const configurationFields = useRef<HTMLFieldSetElement>(null);
  const advancedControls = useRef<HTMLDetailsElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(configurationInput(flag.configuration));
  const weightTotal = draft.variants.reduce((sum, variant) => sum + variant.weightBasisPoints, 0);
  useEffect(() => {
    let current = true;
    setCatalogLoading(true);
    setPreview(null);
    setReviewDraft(null);
    requestVersion.current++;
    setError('');
    get(request, `${scope}/catalog`, catalogSchema)
      .then((next) => {
        if (current) {
          setCatalog(next);
          setPreview(null);
          requestVersion.current++;
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setCatalogLoading(false);
      });
    return () => {
      current = false;
      requestVersion.current++;
    };
  }, [request, scope, version]);
  function change(next: ConfigurationInput) {
    setConfirm(false);
    setUndoDraft(draft);
    setDraft(next);
    setPreview(null);
    setReviewDraft(null);
    requestVersion.current++;
  }
  async function prepareDirectory() {
    if (!catalog || busy || !writable) return;
    if (
      directoryAttributes.some((definition) =>
        catalog.attributes.some(
          (item) => item.key === definition.key && item.type !== definition.type
        )
      )
    ) {
      setError(
        'BC targeting fields conflict with existing project context types. No fields were changed.'
      );
      return;
    }
    const missing = directoryAttributes.filter(
      (definition) => !catalog.attributes.some((item) => item.key === definition.key)
    );
    if (!missing.length) return;
    setBusy(true);
    setError('');
    try {
      const next = await send(
        request,
        `${scope}/catalog`,
        'PUT',
        {
          expectedRevision: catalog.revision,
          catalog: {
            attributes: [...catalog.attributes, ...missing],
            segments: catalog.segments.map(({ revision: _revision, ...segment }) => segment),
          },
        },
        catalogSchema
      );
      setCatalog(next);
      setPreview(null);
      setReviewDraft(null);
      requestVersion.current++;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function updateRule(index: number, rule: Rule) {
    change({
      ...draft,
      rules: draft.rules.map((item, position) => (position === index ? rule : item)),
    });
  }
  function setType(type: TypedValue['type']) {
    change({
      ...draft,
      offValue: initialValue(type),
      defaultOutcome:
        draft.defaultOutcome.kind === 'value'
          ? { kind: 'value', value: initialValue(type) }
          : draft.defaultOutcome,
      variants: draft.variants.map((variant) => ({ ...variant, value: initialValue(type) })),
      rules: draft.rules.map((rule) => ({
        ...rule,
        outcome:
          rule.outcome.kind === 'value'
            ? { kind: 'value', value: initialValue(type) }
            : rule.outcome,
      })),
    });
  }
  function openAdvanced() {
    if (!advancedControls.current) return;
    advancedControls.current.open = true;
    advancedControls.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function invalidateFieldReview() {
    setPreview(null);
    setReviewDraft(null);
    setConfirm(false);
    requestVersion.current++;
    setInvalidConfigurationFields(configurationFields.current?.matches(':invalid') ?? false);
  }
  function validConfigurationFields() {
    const fields = configurationFields.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input, select, textarea');
    const invalid = fields && Array.from(fields).find((field) => !field.checkValidity());
    if (!invalid) {
      setInvalidConfigurationFields(false);
      return true;
    }
    openAdvanced();
    setInvalidConfigurationFields(true);
    setError(
      'Advanced configuration has invalid or incomplete fields. Correct them before publication.'
    );
    invalid.reportValidity();
    return false;
  }
  function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void review(context, 'simulation');
  }
  async function review(reviewContext: EvaluationContext, mode: 'audience' | 'simulation') {
    if (!catalog || catalogLoading || busy || !validConfigurationFields()) return;
    setError('');
    setPreview(null);
    setReviewDraft(null);
    try {
      const proposed = writable ? configurationInputSchema.parse(draft) : undefined;
      const body = previewRequestSchema.parse({
        context: reviewContext,
        expectedRevision: flag.revision,
        ...(proposed
          ? { proposedConfiguration: proposed, expectedCatalogRevision: catalog.revision }
          : {}),
      });
      const current = ++requestVersion.current;
      setBusy(true);
      const result = await send(request, `${path}/preview`, 'POST', body, previewSchema);
      if (current === requestVersion.current) {
        setPreview(result);
        setReviewDraft(proposed ?? null);
        setReviewMode(mode);
      }
    } catch (cause) {
      setError(
        cause instanceof z.ZodError
          ? cause.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
          : errorMessage(cause)
      );
    } finally {
      setBusy(false);
    }
  }
  const contextDefinitions = [
    ...(contextModel === 'current'
      ? (catalog?.attributes ?? [])
      : flag.configuration.contextDefinitions),
  ];
  const otherDefinitions =
    contextModel === 'current'
      ? flag.configuration.contextDefinitions
      : (catalog?.attributes ?? []);
  for (const definition of otherDefinitions)
    if (!contextDefinitions.some((item) => item.key === definition.key))
      contextDefinitions.push(definition);
  function audienceSummary(configuration: ConfigurationInput, segments: Catalog['segments']) {
    const audience = readSimpleAudience(configuration);
    if (!audience)
      return `Advanced ${configuration.offValue.type} configuration preserved · ${configuration.rules.length} ordered rules · ${configuration.variants.length} variants. Review its full behavior in Advanced controls.`;
    if (audience.mode === 'everyone') return 'Everyone · enabled for all evaluation subjects.';
    if (!audience.segmentIds.length && !audience.directoryTargets.length)
      return 'Nobody selected · the audience default is off.';
    const names = audience.segmentIds.map((id) => {
      const segment = segments.find((item) => item.id === id);
      return segment ? segment.name : `Unavailable segment (${id})`;
    });
    names.push(
      ...audience.directoryTargets.map(
        (target) =>
          `${target.ids.length} ${target.kind} (source ${target.sourceId}, tenant ${target.tenantId})`
      )
    );
    return `Selected audiences · matches any of: ${names.join(', ')}. Everyone else receives off.`;
  }
  return (
    <>
      <Block name="content" label="Audience targeting" icon="sliders">
        {error && <Notice tone="danger">{error}</Notice>}
        {invalidConfigurationFields && (
          <Notice tone="danger">
            Advanced configuration has invalid or incomplete fields. No changes have been published.{' '}
            <Button onClick={openAdvanced}>Open advanced controls</Button>
          </Notice>
        )}
        <div className="fd-actions">
          <Badge>
            {invalidConfigurationFields
              ? 'Invalid unsaved edits'
              : dirty
                ? 'Unsaved changes'
                : 'Saved'}
          </Badge>
          <Button
            disabled={catalogLoading || busy}
            onClick={() => setVersion((value) => value + 1)}
          >
            Refresh segments
          </Button>
        </div>
        {catalogLoading ? (
          <p role="status">Loading targeting options…</p>
        ) : !catalog ? (
          <Empty>
            Targeting options could not be loaded. Refresh to retry; nothing can be saved without
            them.
          </Empty>
        ) : (
          <>
            {catalog.revision !== flag.configuration.catalogRevision &&
              (draft.rules.length > 0 || flag.configuration.rules.length > 0) && (
                <Notice tone="warning">
                  The targeting library has changed since this flag was saved. Saving will use its
                  latest definitions, which may change who matches the selected segments.
                </Notice>
              )}
            <SimpleTargeting
              request={request}
              scope={scope}
              environmentName={environmentName}
              onPrepareDirectory={() => void prepareDirectory()}
              draft={draft}
              published={flag.configuration}
              catalog={catalog}
              writable={writable}
              busy={busy}
              onChange={change}
              onReview={() => void review({ attributes: {} }, 'audience')}
              onOpenAdvanced={openAdvanced}
            />
            {writable && (
              <div className="fd-actions">
                <Button
                  disabled={!dirty || busy}
                  onClick={() => change(configurationInput(flag.configuration))}
                >
                  Discard draft changes
                </Button>
                {undoDraft && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setDraft(undoDraft);
                      setUndoDraft(null);
                      setPreview(null);
                      setReviewDraft(null);
                      requestVersion.current++;
                    }}
                  >
                    Undo last draft edit or removal
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Block>
      <details ref={advancedControls} className="fd-advanced-controls">
        <summary>Advanced controls</summary>
        <Block name="content" label="Targeting and typed configuration" icon="sliders">
          <p>
            <strong>
              {projectName} · {environmentName}
            </strong>{' '}
            · Global flag revision r{flag.revision}
          </p>
          <p className="fd-help">
            Precedence: archived → environment disabled → active exact tenant/subject override →
            first eligible rule → configured default. All conditions and segments on a rule must
            match.
          </p>
          <p className="fd-help">
            Typed values, ordered predicates, rollouts, variants, pinned definitions and the
            evaluation playground remain available here. Opening or closing these controls does not
            discard edits.
          </p>
          <details>
            <summary>Published pinned definitions and reusable segments (read-only)</summary>
            <p>
              Catalog r{flag.configuration.catalogRevision} · Live evaluation uses these snapshots
              until explicit publish.
            </p>
            <ul>
              {flag.configuration.contextDefinitions.map((attribute) => (
                <li key={attribute.key}>
                  <code>{attribute.key}</code> · {attribute.type} · {attribute.description}
                </li>
              ))}
            </ul>
            {!flag.configuration.segments.length && <p>No reusable segments pinned.</p>}
            {flag.configuration.segments.map((segment) => (
              <section key={segment.id}>
                <h3>
                  {segment.name} · {segment.key} · r{segment.revision}
                </h3>
                <code>{segment.id}</code>
                <ul>
                  {segment.conditions.map((condition, index) => (
                    <li key={index}>
                      {condition.attribute} {condition.operator}{' '}
                      {condition.values.map((value) => JSON.stringify(value)).join(', ')}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </details>
          {!catalog ? (
            <Empty>
              Project catalog could not be loaded. Refresh to retry; no configuration can be
              published without it.
            </Empty>
          ) : (
            <>
              <form
                ref={form}
                className="fd-form"
                onSubmit={simulate}
                onInvalidCapture={() =>
                  setError(
                    'Advanced controls contain invalid or incomplete fields. Correct them before reviewing or publishing.'
                  )
                }
              >
                <fieldset
                  ref={configurationFields}
                  className="fd-fieldset"
                  disabled={!writable || busy}
                  onChange={invalidateFieldReview}
                >
                  <legend>
                    {writable
                      ? 'Environment draft · not live until published'
                      : 'Published configuration · read-only'}
                  </legend>
                  <p className="fd-help">
                    Allocation namespace <code>{draft.allocationNamespace}</code> ·{' '}
                    {draft.hashVersion} · immutable. Display names do not change allocation. Tenant
                    plus stable subject ID are required for partial rollouts and all variant
                    selections.
                  </p>
                  <label>
                    Configuration value type
                    <select
                      className="input"
                      value={draft.offValue.type}
                      onChange={(event) => setType(event.target.value as TypedValue['type'])}
                    >
                      {['boolean', 'string', 'number', 'json'].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="fd-help">
                    Changing type resets every fixed value and variant payload in this draft. Active
                    incompatible overrides will block publication.
                  </p>
                  <ValueEditor
                    key={`off:${draft.offValue.type}`}
                    label="Off value (archived / disabled / missing subject)"
                    value={draft.offValue}
                    onChange={(offValue) => change({ ...draft, offValue })}
                  />
                  <OutcomeEditor
                    key={`default:${draft.offValue.type}`}
                    label="Default outcome (no rule matched)"
                    outcome={draft.defaultOutcome}
                    type={draft.offValue.type}
                    variants={draft.variants}
                    onChange={(defaultOutcome) => change({ ...draft, defaultOutcome })}
                  />
                  <fieldset className="fd-fieldset">
                    <legend>Variants · deterministic assignment</legend>
                    <Notice>
                      Stable variant IDs, array order and weights define assignment intervals.
                      Adding, removing, reordering or reweighting can reassign subjects. No
                      automatic weight redistribution.
                    </Notice>
                    <div className="fd-table-wrap">
                      <table className="fd-table fd-variants">
                        <caption>
                          Variant payloads and integer weights · total must equal 10000 basis points
                          (100%)
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Stable ID / display name</th>
                            <th scope="col">Weight</th>
                            <th scope="col">Typed payload</th>
                            <th scope="col">Order / remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.variants.map((variant, index) => (
                            <tr key={variant.id}>
                              <td>
                                <code>{variant.id}</code>
                                <label>
                                  Variant {index + 1} name
                                  <input
                                    className="input"
                                    required
                                    maxLength={120}
                                    value={variant.name}
                                    onChange={(event) =>
                                      change({
                                        ...draft,
                                        variants: draft.variants.map((item, position) =>
                                          position === index
                                            ? { ...item, name: event.target.value }
                                            : item
                                        ),
                                      })
                                    }
                                  />
                                </label>
                              </td>
                              <td>
                                <label>
                                  Weight for {variant.name} (basis points)
                                  <input
                                    className="input"
                                    type="number"
                                    required
                                    min={0}
                                    max={10000}
                                    step={1}
                                    value={variant.weightBasisPoints}
                                    onChange={(event) =>
                                      change({
                                        ...draft,
                                        variants: draft.variants.map((item, position) =>
                                          position === index
                                            ? {
                                                ...item,
                                                weightBasisPoints: event.target.valueAsNumber,
                                              }
                                            : item
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <span className="fd-help">
                                  {(variant.weightBasisPoints / 100).toFixed(2)}%
                                </span>
                              </td>
                              <td>
                                <ValueEditor
                                  key={`${variant.id}:${draft.offValue.type}`}
                                  label={`Payload for ${variant.name}`}
                                  value={variant.value}
                                  onChange={(value) =>
                                    change({
                                      ...draft,
                                      variants: draft.variants.map((item, position) =>
                                        position === index ? { ...item, value } : item
                                      ),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <div className="fd-actions">
                                  <Button
                                    disabled={index === 0}
                                    aria-label={`Move variant ${variant.name} up`}
                                    onClick={() => {
                                      const variants = [...draft.variants];
                                      [variants[index - 1], variants[index]] = [
                                        variants[index]!,
                                        variants[index - 1]!,
                                      ];
                                      change({ ...draft, variants });
                                    }}
                                  >
                                    Up
                                  </Button>
                                  <Button
                                    disabled={index === draft.variants.length - 1}
                                    aria-label={`Move variant ${variant.name} down`}
                                    onClick={() => {
                                      const variants = [...draft.variants];
                                      [variants[index], variants[index + 1]] = [
                                        variants[index + 1]!,
                                        variants[index]!,
                                      ];
                                      change({ ...draft, variants });
                                    }}
                                  >
                                    Down
                                  </Button>
                                  <Button
                                    onClick={() =>
                                      change({
                                        ...draft,
                                        variants: draft.variants.filter(
                                          (_, position) => position !== index
                                        ),
                                      })
                                    }
                                    aria-label={`Remove variant ${variant.name}`}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">Total</th>
                            <td colSpan={3}>
                              <span role="status">
                                {weightTotal} / 10000 basis points ·{' '}
                                {(weightTotal / 100).toFixed(2)}%{' '}
                                {draft.variants.length > 0 && weightTotal !== 10000
                                  ? '· Invalid total'
                                  : ''}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {!draft.variants.length && (
                      <p>No variants · use fixed typed outcomes, or add variants to assign.</p>
                    )}
                    <Button
                      disabled={draft.variants.length >= 10}
                      onClick={() =>
                        change({
                          ...draft,
                          variants: [
                            ...draft.variants,
                            {
                              id: `v_${crypto.randomUUID().slice(0, 8)}`,
                              name: `Variant ${draft.variants.length + 1}`,
                              weightBasisPoints: draft.variants.length ? 0 : 10000,
                              value: initialValue(draft.offValue.type),
                            },
                          ],
                        })
                      }
                    >
                      Add variant
                    </Button>
                  </fieldset>
                  <fieldset className="fd-fieldset">
                    <legend>Ordered first-match rules</legend>
                    {!draft.rules.length && (
                      <p>No rules · uses the configured default when the gate is enabled.</p>
                    )}
                    {draft.rules.map((rule, index) => (
                      <section
                        className="fd-rule"
                        key={rule.id}
                        aria-label={`Rule ${index + 1}: ${rule.name}`}
                      >
                        <div className="fd-actions">
                          <h3>Rule {index + 1}</h3>
                          <Button
                            disabled={index === 0}
                            aria-label={`Move rule ${rule.name} up`}
                            onClick={() => {
                              const rules = [...draft.rules];
                              [rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!];
                              change({ ...draft, rules });
                            }}
                          >
                            Up
                          </Button>
                          <Button
                            disabled={index === draft.rules.length - 1}
                            aria-label={`Move rule ${rule.name} down`}
                            onClick={() => {
                              const rules = [...draft.rules];
                              [rules[index], rules[index + 1]] = [rules[index + 1]!, rules[index]!];
                              change({ ...draft, rules });
                            }}
                          >
                            Down
                          </Button>
                          <Button
                            aria-label={`Remove rule ${rule.name}`}
                            onClick={() =>
                              change({
                                ...draft,
                                rules: draft.rules.filter((_, position) => position !== index),
                              })
                            }
                          >
                            Remove rule
                          </Button>
                        </div>
                        <code className="fd-table-sub">Stable rule ID · {rule.id}</code>
                        <label>
                          Rule name
                          <input
                            className="input"
                            required
                            maxLength={120}
                            value={rule.name}
                            onChange={(event) =>
                              updateRule(index, { ...rule, name: event.target.value })
                            }
                          />
                        </label>
                        <ConditionsEditor
                          conditions={rule.conditions}
                          attributes={catalog.attributes}
                          onChange={(conditions) => updateRule(index, { ...rule, conditions })}
                        />
                        <fieldset className="fd-fieldset">
                          <legend>Reusable segments (AND)</legend>
                          {!catalog.segments.length && (
                            <p>
                              No current segments. Create reusable predicates in Project targeting
                              catalog.
                            </p>
                          )}
                          {catalog.segments.map((segment) => {
                            const pinned = flag.configuration.segments.find(
                              (item) => item.id === segment.id
                            );
                            return (
                              <div key={segment.id}>
                                <label className="fd-check">
                                  <input
                                    type="checkbox"
                                    checked={rule.segmentIds.includes(segment.id)}
                                    disabled={
                                      !rule.segmentIds.includes(segment.id) &&
                                      rule.segmentIds.length >= 5
                                    }
                                    onChange={(event) =>
                                      updateRule(index, {
                                        ...rule,
                                        segmentIds: event.target.checked
                                          ? [...rule.segmentIds, segment.id]
                                          : rule.segmentIds.filter((id) => id !== segment.id),
                                      })
                                    }
                                  />
                                  {segment.name} · <code>{segment.key}</code> · Current r
                                  {segment.revision} /{' '}
                                  {pinned ? `Pinned r${pinned.revision}` : 'Not pinned'}
                                </label>
                                <details>
                                  <summary>Current segment conditions</summary>
                                  <ul>
                                    {segment.conditions.map((condition, position) => (
                                      <li key={position}>
                                        {condition.attribute} {condition.operator}{' '}
                                        {condition.values
                                          .map((value) => JSON.stringify(value))
                                          .join(', ')}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              </div>
                            );
                          })}
                          {rule.segmentIds
                            .filter((id) => !catalog.segments.some((segment) => segment.id === id))
                            .map((id) => (
                              <div key={id}>
                                <Notice tone="warning">
                                  Referenced segment {id} was removed from the project catalog.
                                  Remove this reference before publishing.
                                </Notice>
                                <Button
                                  onClick={() =>
                                    updateRule(index, {
                                      ...rule,
                                      segmentIds: rule.segmentIds.filter((item) => item !== id),
                                    })
                                  }
                                >
                                  Remove missing segment reference
                                </Button>
                              </div>
                            ))}
                        </fieldset>
                        <label>
                          Rollout (integer basis points)
                          <input
                            className="input"
                            type="number"
                            required
                            min={0}
                            max={10000}
                            step={1}
                            value={rule.rolloutBasisPoints}
                            onChange={(event) =>
                              updateRule(index, {
                                ...rule,
                                rolloutBasisPoints: event.target.valueAsNumber,
                              })
                            }
                          />
                        </label>
                        <p className="fd-help">
                          {(rule.rolloutBasisPoints / 100).toFixed(2)}% · Who: matching conditions
                          AND segments → fraction: {rule.rolloutBasisPoints}/10000 → outcome below.
                          0 never matches; partial rollout skips without tenant + subject; 100%
                          fixed value needs no subject.
                        </p>
                        <OutcomeEditor
                          label={`Rule ${index + 1} outcome`}
                          outcome={rule.outcome}
                          type={draft.offValue.type}
                          variants={draft.variants}
                          onChange={(outcome) => updateRule(index, { ...rule, outcome })}
                        />
                      </section>
                    ))}
                    <Button
                      disabled={draft.rules.length >= 20}
                      onClick={() =>
                        change({
                          ...draft,
                          rules: [
                            ...draft.rules,
                            {
                              id: crypto.randomUUID(),
                              name: `Rule ${draft.rules.length + 1}`,
                              conditions: [],
                              segmentIds: [],
                              rolloutBasisPoints: 10000,
                              outcome: { kind: 'value', value: initialValue(draft.offValue.type) },
                            },
                          ],
                        })
                      }
                    >
                      Add rule
                    </Button>
                  </fieldset>
                  {writable && (
                    <Button
                      disabled={!dirty}
                      onClick={() => change(configurationInput(flag.configuration))}
                    >
                      Discard draft changes
                    </Button>
                  )}
                  {writable && undoDraft && (
                    <Button
                      onClick={() => {
                        setDraft(undoDraft);
                        setUndoDraft(null);
                        setPreview(null);
                        setReviewDraft(null);
                        requestVersion.current++;
                      }}
                    >
                      Undo last draft edit or removal
                    </Button>
                  )}
                </fieldset>
                <label>
                  Context definitions for simulation
                  <select
                    className="input"
                    value={contextModel}
                    disabled={busy}
                    onChange={(event) => {
                      setContextModel(event.target.value as 'current' | 'pinned');
                      setContext({ ...context, attributes: {} });
                      setPreview(null);
                      setReviewDraft(null);
                      requestVersion.current++;
                    }}
                  >
                    <option value="current">Current project catalog · r{catalog.revision}</option>
                    <option value="pinned">
                      Published pinned catalog · r{flag.configuration.catalogRevision}
                    </option>
                  </select>
                </label>
                <p className="fd-help">
                  Switching resets only context attributes. If a definition changed type, select its
                  current or pinned type to inspect both decisions for the exact same context.
                </p>
                <ContextEditor
                  context={context}
                  attributes={contextDefinitions}
                  onChange={(next) => {
                    setContext(next);
                    setPreview(null);
                    setReviewDraft(null);
                    requestVersion.current++;
                  }}
                />
                <div className="fd-actions">
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy
                      ? 'Evaluating…'
                      : writable
                        ? 'Preview current vs draft assignment'
                        : 'Simulate published decision'}
                  </Button>
                  <Badge>{dirty ? 'Unpublished draft changes' : 'Matches published input'}</Badge>
                </div>
              </form>
            </>
          )}
        </Block>
        {preview && (
          <Block name="content" label="Decision playground" icon="eye">
            <Notice>
              {reviewMode === 'audience'
                ? 'Configuration validation used an empty context. These technical decisions do not simulate a BC user or estimate audience membership.'
                : 'Server evaluator · This context only, not a population estimate.'}
            </Notice>
            <div className="fd-change-grid">
              <Decision decision={preview.current} title="Current published decision" />
              {preview.proposed && (
                <Decision decision={preview.proposed} title="Proposed draft decision" />
              )}
            </div>
            {reviewDraft && (
              <details open>
                <summary>Review proposed configuration changes</summary>
                <div className="fd-change-grid">
                  <div>
                    <h3>Current</h3>
                    <ValueDisplay value={flag.configuration.offValue} />
                    <p>Default: {flag.configuration.defaultOutcome.kind}</p>
                    <p>
                      {flag.configuration.rules.length} rules · {flag.configuration.variants.length}{' '}
                      variants · catalog r{flag.configuration.catalogRevision}
                    </p>
                  </div>
                  <div>
                    <h3>Draft</h3>
                    <ValueDisplay value={reviewDraft.offValue} />
                    <p>Default: {reviewDraft.defaultOutcome.kind}</p>
                    <p>
                      {reviewDraft.rules.length} rules · {reviewDraft.variants.length} variants ·
                      catalog r{catalog?.revision}
                    </p>
                  </div>
                </div>
                <details>
                  <summary>Exact before / after configuration (read-only)</summary>
                  <div className="fd-change-grid">
                    <pre>{JSON.stringify(configurationInput(flag.configuration), null, 2)}</pre>
                    <pre>{JSON.stringify(reviewDraft, null, 2)}</pre>
                  </div>
                </details>
              </details>
            )}
          </Block>
        )}
      </details>
      {preview && (
        <Block name="content" label="Targeting change review" icon="eye">
          <Notice>
            {reviewMode === 'audience'
              ? 'The server validated this configuration with an empty context. This is not a real-user simulation or an audience size estimate. BC directory identities are not connected.'
              : 'This review includes the exact context simulation shown in Advanced controls, not a population estimate.'}{' '}
            Publishing applies the entire reviewed draft to {projectName} / {environmentName}; other
            environments remain pinned to their own configuration.
          </Notice>
          <div className="fd-change-grid">
            <section>
              <h3>Current published audience</h3>
              <p>
                {audienceSummary(
                  configurationInput(flag.configuration),
                  flag.configuration.segments
                )}
              </p>
              <p className="fd-help">Pinned catalog r{flag.configuration.catalogRevision}</p>
            </section>
            {reviewDraft && (
              <section>
                <h3>Proposed audience</h3>
                <p>
                  {audienceSummary(reviewDraft, [
                    ...(catalog?.segments ?? []),
                    ...flag.configuration.segments,
                  ])}
                </p>
                <p className="fd-help">Publication pins current catalog r{catalog?.revision}</p>
              </section>
            )}
          </div>
          <p className="fd-help">
            The environment gate remains {flag.enabled ? 'enabled' : 'disabled'}.
            {flag.archived
              ? ' Archive still forces the off value.'
              : ' Active individual exceptions retain their priority when the gate is enabled.'}
          </p>
          {preview.warnings.length > 0 && (
            <Notice tone="warning">
              <ul>
                {preview.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </Notice>
          )}
          <p>
            <strong>
              {preview.allocationChanged
                ? 'Allocation-sensitive changes · existing subjects may be reassigned.'
                : 'No allocation change detected by server.'}
            </strong>
          </p>
          {writable && reviewDraft && preview.proposed && (
            <div className="fd-actions">
              <Button
                variant="primary"
                disabled={busy || catalogLoading}
                onClick={() => {
                  if (!validConfigurationFields()) return;
                  if (reviewMode === 'simulation' && !form.current?.checkValidity()) {
                    openAdvanced();
                    form.current?.reportValidity();
                    return;
                  }
                  setConfirm(true);
                }}
              >
                Review and publish to {environmentName}
              </Button>
            </div>
          )}
        </Block>
      )}
      {confirm && reviewDraft && catalog && preview?.proposed && (
        <Confirm
          title={`Publish targeting to ${environmentName}?`}
          action={`Publish to ${environmentName}`}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            const input = publishConfigurationSchema.parse({
              expectedRevision: flag.revision,
              expectedCatalogRevision: catalog.revision,
              configuration: reviewDraft,
            });
            const next = await send(request, `${path}/configuration`, 'PUT', input, flagSchema);
            onChanged(next);
          }}
        >
          <p>
            <strong>
              {projectName} / {environmentName}
            </strong>{' '}
            · <code>{flag.key}</code> · Expected flag r{flag.revision} / catalog r{catalog.revision}
          </p>
          <p>
            This publishes the exact reviewed draft, pins current catalog definitions and referenced
            segments, and increments the global flag revision. Other environments do not change. The
            environment gate remains {flag.enabled ? 'enabled' : 'disabled'}
            {flag.archived ? '; archive still forces the off value' : ''}.
          </p>
          <Notice tone={preview.allocationChanged ? 'warning' : 'primary'}>
            {preview.allocationChanged
              ? 'Allocation risk: existing subjects may receive different assignments. Review stable IDs, ordered rules, refreshed segments and variant weight intervals before confirming.'
              : 'Review all typed values and targeting changes before confirming.'}
          </Notice>
          {reviewMode === 'simulation' ? (
            <p>
              Preview decision: <ValueDisplay value={preview.proposed.value} /> ·{' '}
              {preview.proposed.reason}
            </p>
          ) : (
            <p>
              This review validated configuration only. It did not simulate a real BC user or verify
              BC audience membership.
            </p>
          )}
        </Confirm>
      )}
    </>
  );
}
