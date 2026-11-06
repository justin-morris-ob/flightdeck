import type { SegmentDefinition } from '../shared/unified.ts';
import type { Request } from './api.ts';

import { Fragment, useEffect, useState } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import {
  directoryAudienceSchema,
  directoryConditions,
  type DirectoryAudience,
} from '../shared/directory.ts';
import { type AttributeDefinition, type Condition } from '../shared/targeting.ts';
import { AudiencePicker } from './AudiencePicker.tsx';
import { availableAttributes, newCondition } from './TargetingForms.tsx';

type Block = SegmentDefinition['blocks'][number];
export const operatorLabels: Record<Condition['operator'], string> = {
  eq: 'exactly matches',
  not_eq: 'does not match',
  in: 'matches any value',
  not_in: 'matches none of the values',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains_any: 'contains any selected value',
  contains_all: 'contains every selected value',
  ends_with: 'ends with',
  present: 'is present',
  absent: 'is absent',
};

function TraitValueInput({
  value,
  numeric,
  onChange,
  onInvalid,
}: {
  value: string | number | boolean;
  numeric: boolean;
  onChange: (next: string | number) => void;
  onInvalid: () => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="input"
      type={numeric ? 'number' : 'text'}
      step={numeric ? 'any' : undefined}
      maxLength={numeric ? undefined : 500}
      required={numeric}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const next = numeric ? event.target.valueAsNumber : event.target.value;
        if (numeric && !Number.isFinite(next)) {
          event.target.setCustomValidity('Enter a finite number');
          onInvalid();
        } else {
          event.target.setCustomValidity('');
          onChange(next);
        }
      }}
    />
  );
}

// Only the exact guarded directory shape is presented as a membership selection.
// Other predicates remain editable trait blocks; no predicate is silently discarded.
export function directoryAudience(block: Block): DirectoryAudience | null {
  if (block.conditions.length !== 3) return null;
  const tenant = block.conditions.find((condition) => condition.attribute === 'tenantId');
  const source = block.conditions.find((condition) => condition.attribute === 'sourceId');
  const identity = block.conditions.find((condition) =>
    ['subjectId', 'organizationIds', 'groupIds'].includes(condition.attribute)
  );
  if (
    !tenant ||
    !source ||
    !identity ||
    tenant.operator !== 'eq' ||
    source.operator !== 'eq' ||
    tenant.values.length !== 1 ||
    source.values.length !== 1 ||
    identity.operator !== (identity.attribute === 'subjectId' ? 'in' : 'contains_any')
  )
    return null;
  const parsed = directoryAudienceSchema.safeParse({
    sourceId: source.values[0],
    tenantId: tenant.values[0],
    ids: identity.values,
    kind:
      identity.attribute === 'subjectId'
        ? 'people'
        : identity.attribute === 'organizationIds'
          ? 'organizations'
          : 'groups',
  });
  return parsed.success ? parsed.data : null;
}

export function DefinitionSummary({ definition }: { definition: SegmentDefinition | null }) {
  if (!definition) return <span>No published definition</span>;
  return (
    <span>
      {definition.blocks.map((block, index) => {
        const audience = directoryAudience(block);
        return (
          <Fragment key={index}>
            {index > 0 && <strong> OR </strong>}
            {audience ? (
              <span>
                {audience.kind === 'people'
                  ? 'People'
                  : audience.kind === 'organizations'
                    ? 'Organization members'
                    : 'Group members'}{' '}
                · Any saved ID: {audience.ids.join(', ')}
              </span>
            ) : (
              block.conditions.map((condition, position) => (
                <Fragment key={position}>
                  {position > 0 && <strong> AND </strong>}
                  {condition.attribute} {operatorLabels[condition.operator]}
                  {condition.values.length > 0 &&
                    ` ${condition.values.map((value) => JSON.stringify(value)).join(', ')}`}
                </Fragment>
              ))
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

export function DefinitionView({
  definition,
  request,
  scope,
  writable = false,
}: {
  definition: SegmentDefinition;
  request: Request;
  scope: string;
  writable?: boolean;
}) {
  const memberships = definition.blocks.map(directoryAudience);
  const audiences = memberships.filter((audience) => audience !== null);
  const traits = definition.blocks.flatMap((block, index) => (memberships[index] ? [] : [block]));
  return (
    <div className="fd-segment-definition">
      <p className="fd-help">ANY block matches · ALL conditions within a trait block must match.</p>
      {audiences.length > 0 && (
        <section className="fd-segment-block" aria-label="People and memberships definition">
          <h4>
            People &amp; memberships
            <Badge>Any selection</Badge>
          </h4>
          <AudiencePicker
            request={request}
            scope={scope}
            selected={audiences}
            readOnly
            compact
            disabled={!writable}
          />
          <p className="fd-help">
            Membership follows the person across organizations. Source and tenant guards retained.
          </p>
        </section>
      )}
      {traits.map((block, index) => (
        <Fragment key={index}>
          {(audiences.length > 0 || index > 0) && <p className="fd-segment-logic">OR</p>}
          <section className="fd-segment-block" aria-label={`Trait rules block ${index + 1}`}>
            <h4>
              Trait rules
              <Badge>ALL conditions</Badge>
            </h4>
            <ul className="fd-segment-traits">
              {block.conditions.map((condition, position) => (
                <li key={position}>
                  {position > 0 && <strong className="fd-segment-trait-conjunction">AND</strong>}
                  <code>{condition.attribute}</code>
                  <span>{operatorLabels[condition.operator]}</span>
                  <code>{condition.values.map((value) => JSON.stringify(value)).join(', ')}</code>
                </li>
              ))}
            </ul>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

export function SegmentBlocksEditor({
  request,
  scope,
  blocks,
  attributes,
  onChange,
  disabled,
}: {
  request: Request;
  scope: string;
  blocks: Block[];
  attributes: AttributeDefinition[];
  onChange: (next: Block[]) => void;
  disabled: boolean;
}) {
  const [removed, setRemoved] = useState<Block[] | null>(null);
  const memberships = blocks.map(directoryAudience);
  const selected = memberships.filter((audience) => audience !== null);
  const traits = blocks.flatMap((block, index) => (memberships[index] ? [] : [{ block, index }]));
  const definitions = availableAttributes(attributes);

  function changeBlocks(next: Block[]) {
    setRemoved(null);
    onChange(next);
  }
  function update(index: number, conditions: Condition[]) {
    changeBlocks(blocks.map((block, position) => (position === index ? { conditions } : block)));
  }
  return (
    <fieldset className="fd-fieldset fd-segment-builder" disabled={disabled}>
      <legend>
        <span>Include people who match</span>
        <Badge>ANY block</Badge>
      </legend>
      <section className="fd-segment-block" aria-label="1 · People & memberships">
        <div className="fd-segment-block-heading">
          <h3>1 · People &amp; memberships</h3>
        </div>
        <AudiencePicker
          request={request}
          scope={scope}
          selected={selected}
          disabled={disabled}
          compact
          demoData
          maxTargetBlocks={20 - traits.length}
          onChange={(next) =>
            changeBlocks([
              ...next.map((audience) => ({ conditions: directoryConditions(audience) })),
              ...traits.map(({ block }) => block),
            ])
          }
        />
        <p className="fd-help">Any selection qualifies · Across organizations</p>
      </section>
      {!traits.length && (
        <>
          <p className="fd-segment-logic">OR</p>
          <section className="fd-segment-block" aria-label="2 · Trait rules">
            <div className="fd-segment-block-heading">
              <h3>2 · Trait rules</h3>
              <span className="fd-help">Match all conditions</span>
            </div>
            <p className="fd-help">Optionally match people using their traits.</p>
            <Button
              type="button"
              variant="quiet"
              disabled={blocks.length >= 20}
              onClick={() => changeBlocks([...blocks, { conditions: [newCondition(attributes)] }])}
            >
              + Add AND condition
            </Button>
          </section>
        </>
      )}
      {traits.map(({ block, index }, blockPosition) => (
        <Fragment key={index}>
          <p className="fd-segment-logic">OR</p>
          <section className="fd-segment-block" aria-label={`${blockPosition + 2} · Trait rules`}>
            <div className="fd-segment-block-heading">
              <h3>{blockPosition + 2} · Trait rules</h3>
              <span className="fd-help">Match all conditions</span>
              <Button
                type="button"
                onClick={() => {
                  setRemoved(blocks);
                  onChange(blocks.filter((_, position) => position !== index));
                }}
              >
                Remove block {blockPosition + 1}
              </Button>
            </div>
            {block.conditions.map((condition, conditionIndex) => {
              const definition = definitions.find((item) => item.key === condition.attribute);
              const type = definition?.type ?? 'string';
              const operators: Condition['operator'][] = [
                ...(type === 'string_list'
                  ? (['contains_any', 'contains_all'] as const)
                  : (['eq', 'not_eq', 'in', 'not_in'] as const)),
                ...(type === 'string' ? (['ends_with'] as const) : []),
                ...(type === 'number' ? (['gt', 'gte', 'lt', 'lte'] as const) : []),
                'present',
                'absent',
              ];
              function change(next: Condition) {
                update(
                  index,
                  block.conditions.map((item, position) =>
                    position === conditionIndex ? next : item
                  )
                );
              }
              const multiple = ['in', 'not_in', 'contains_any', 'contains_all'].includes(
                condition.operator
              );
              return (
                <div key={conditionIndex} className="fd-segment-condition">
                  {conditionIndex > 0 && <strong>AND</strong>}
                  <label>
                    Trait
                    <select
                      className="input"
                      value={condition.attribute}
                      onChange={(event) => {
                        const next = definitions.find((item) => item.key === event.target.value)!;
                        change({
                          attribute: next.key,
                          operator: next.type === 'string_list' ? 'contains_any' : 'eq',
                          values: [
                            next.type === 'number' ? 0 : next.type === 'boolean' ? false : '',
                          ],
                        });
                      }}
                    >
                      {!definition && (
                        <option value={condition.attribute}>
                          {condition.attribute} · Not in current catalog
                        </option>
                      )}
                      {definitions.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.key} · {item.type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Matching
                    <select
                      className="input"
                      value={condition.operator}
                      onChange={(event) => {
                        const operator = event.target.value as Condition['operator'];
                        change({
                          ...condition,
                          operator,
                          values: ['present', 'absent'].includes(operator)
                            ? []
                            : [
                                condition.values[0] ??
                                  (type === 'number' ? 0 : type === 'boolean' ? false : ''),
                              ],
                        });
                      }}
                    >
                      {!operators.includes(condition.operator) && (
                        <option value={condition.operator}>
                          {operatorLabels[condition.operator]} · Invalid for trait type
                        </option>
                      )}
                      {operators.map((operator) => (
                        <option key={operator} value={operator}>
                          {operatorLabels[operator]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {condition.values.map((value, valueIndex) => (
                    <div className="fd-segment-operand" key={valueIndex}>
                      <label>
                        {multiple ? `Value ${valueIndex + 1}` : 'Value'}
                        {type === 'boolean' ? (
                          <select
                            className="input"
                            value={String(value)}
                            onChange={(event) =>
                              change({
                                ...condition,
                                values: condition.values.map((item, position) =>
                                  position === valueIndex ? event.target.value === 'true' : item
                                ),
                              })
                            }
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <TraitValueInput
                            key={`${condition.attribute}:${condition.operator}`}
                            numeric={type === 'number'}
                            value={value}
                            onInvalid={() => changeBlocks(blocks)}
                            onChange={(next) =>
                              change({
                                ...condition,
                                values: condition.values.map((item, position) =>
                                  position === valueIndex ? next : item
                                ),
                              })
                            }
                          />
                        )}
                      </label>
                      {multiple && condition.values.length > 1 && (
                        <Button
                          type="button"
                          onClick={() =>
                            change({
                              ...condition,
                              values: condition.values.filter(
                                (_, position) => position !== valueIndex
                              ),
                            })
                          }
                        >
                          Remove value {valueIndex + 1}
                        </Button>
                      )}
                    </div>
                  ))}
                  {multiple && (
                    <Button
                      type="button"
                      disabled={condition.values.length >= 20}
                      onClick={() =>
                        change({
                          ...condition,
                          values: [
                            ...condition.values,
                            type === 'number' ? 0 : type === 'boolean' ? false : '',
                          ],
                        })
                      }
                    >
                      Add value
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="quiet"
                    aria-label={`Remove condition ${conditionIndex + 1}`}
                    onClick={() => {
                      setRemoved(blocks);
                      const conditions = block.conditions.filter(
                        (_, position) => position !== conditionIndex
                      );
                      const next = conditions.length
                        ? blocks.map((block, position) =>
                            position === index ? { conditions } : block
                          )
                        : blocks.filter((_, position) => position !== index);
                      onChange(next);
                    }}
                  >
                    ×
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="quiet"
              disabled={block.conditions.length >= 10}
              onClick={() => update(index, [...block.conditions, newCondition(attributes)])}
            >
              + Add AND condition
            </Button>
          </section>
        </Fragment>
      ))}
      <Button
        type="button"
        className="fd-segment-add-block"
        variant="quiet"
        disabled={blocks.length >= 20}
        onClick={() => changeBlocks([...blocks, { conditions: [newCondition(attributes)] }])}
      >
        + Add OR block
      </Button>
      {blocks.length > 20 && (
        <Notice tone="danger">
          A segment supports at most 20 OR blocks. Remove a block before saving.
        </Notice>
      )}
      {removed && (
        <div className="fd-actions" role="status">
          Definition item removed.
          <Button
            type="button"
            onClick={() => {
              onChange(removed);
              setRemoved(null);
            }}
          >
            Undo removal
          </Button>
        </div>
      )}
    </fieldset>
  );
}
