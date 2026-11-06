import { useEffect, useRef, useState } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import {
  stringListSchema,
  valueSchema,
  type AttributeDefinition,
  type Condition,
  type ConfigurationInput,
  type EvaluationContext,
  type Outcome,
  type TypedValue,
} from '../shared/targeting.ts';

export function initialValue(type: TypedValue['type']): TypedValue {
  switch (type) {
    case 'boolean':
      return { type, value: false };
    case 'number':
      return { type, value: 0 };
    case 'string':
      return { type, value: '' };
    case 'json':
      return { type, value: {} };
  }
}

export function ValueDisplay({ value }: { value: TypedValue }) {
  return (
    <span className="fd-typed-value">
      <Badge>{value.type}</Badge>
      <code>{JSON.stringify(value.value)}</code>
    </span>
  );
}

interface ValueEditorProps {
  label: string;
  value: TypedValue;
  onChange: (value: TypedValue) => void;
  disabled?: boolean;
}
export function ValueEditor({ label, value, onChange, disabled }: ValueEditorProps) {
  const [json, setJson] = useState(() => JSON.stringify(value.value, null, 2));
  const [error, setError] = useState('');
  const numberInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (
      value.type === 'number' &&
      numberInput.current &&
      numberInput.current.valueAsNumber !== value.value
    ) {
      numberInput.current.value = String(value.value);
      numberInput.current.setCustomValidity('');
    }
    if (value.type === 'json' && jsonInput.current) {
      let matches = false;
      try {
        matches =
          JSON.stringify(JSON.parse(jsonInput.current.value)) === JSON.stringify(value.value);
      } catch {
        /* External reset replaces invalid local JSON. */
      }
      if (!matches) {
        setJson(JSON.stringify(value.value, null, 2));
        setError('');
        jsonInput.current.setCustomValidity('');
      }
    }
  }, [value]);
  return (
    <div className="fd-value-editor">
      <label>
        {label} <span className="fd-help">({value.type})</span>
        {value.type === 'boolean' ? (
          <select
            className="input"
            disabled={disabled}
            value={String(value.value)}
            onChange={(event) =>
              onChange({ type: 'boolean', value: event.target.value === 'true' })
            }
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        ) : value.type === 'string' ? (
          <input
            className="input"
            disabled={disabled}
            maxLength={2000}
            value={value.value}
            onChange={(event) => onChange({ type: 'string', value: event.target.value })}
          />
        ) : value.type === 'number' ? (
          <input
            ref={numberInput}
            className="input"
            disabled={disabled}
            type="number"
            step="any"
            required
            defaultValue={value.value}
            onChange={(event) => {
              const number = event.target.valueAsNumber;
              event.target.setCustomValidity(
                Number.isFinite(number) ? '' : 'Enter a finite number'
              );
              if (Number.isFinite(number)) onChange({ type: 'number', value: number });
            }}
          />
        ) : (
          <textarea
            ref={jsonInput}
            className="textarea fd-mono"
            disabled={disabled}
            rows={4}
            required
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              try {
                const parsed = valueSchema.parse({
                  type: 'json',
                  value: JSON.parse(event.target.value),
                });
                onChange(parsed);
                setError('');
                event.target.setCustomValidity('');
              } catch {
                const message = 'Enter valid JSON of at most 4 KiB.';
                setError(message);
                event.target.setCustomValidity(message);
              }
            }}
          />
        )}
      </label>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

interface OutcomeEditorProps {
  label: string;
  outcome: Outcome;
  type: TypedValue['type'];
  variants: ConfigurationInput['variants'];
  onChange: (outcome: Outcome) => void;
  weighted?: boolean;
  disabled?: boolean;
}
export function OutcomeEditor({
  label,
  outcome,
  type,
  variants,
  onChange,
  weighted = true,
  disabled,
}: OutcomeEditorProps) {
  return (
    <fieldset className="fd-fieldset" disabled={disabled}>
      <legend>{label}</legend>
      <label>
        Outcome kind
        <select
          className="input"
          value={outcome.kind}
          onChange={(event) => {
            const kind = event.target.value;
            onChange(
              kind === 'value'
                ? { kind, value: initialValue(type) }
                : kind === 'variant'
                  ? { kind, variantId: variants[0]?.id ?? '' }
                  : { kind: 'weighted' }
            );
          }}
        >
          <option value="value">Fixed typed value</option>
          <option value="variant" disabled={!variants.length}>
            Fixed variant
          </option>
          {weighted && (
            <option value="weighted" disabled={!variants.length}>
              Weighted variants
            </option>
          )}
        </select>
      </label>
      {outcome.kind === 'value' && (
        <ValueEditor
          key={type}
          label="Selected value"
          value={outcome.value}
          onChange={(value) => onChange({ kind: 'value', value })}
        />
      )}
      {outcome.kind === 'variant' && (
        <label>
          Variant
          <select
            className="input"
            required
            value={outcome.variantId}
            onChange={(event) => onChange({ kind: 'variant', variantId: event.target.value })}
          >
            <option value="" disabled>
              Choose variant
            </option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name} · {variant.id}
              </option>
            ))}
          </select>
        </label>
      )}
      {outcome.kind === 'weighted' && (
        <p className="fd-help">
          Uses the declared ordered weight intervals. Tenant and stable subject ID are required.
        </p>
      )}
    </fieldset>
  );
}

export function availableAttributes(attributes: AttributeDefinition[]): AttributeDefinition[] {
  return [
    { key: 'tenantId', type: 'string', description: 'Built-in tenant identifier' },
    { key: 'subjectId', type: 'string', description: 'Built-in stable subject identifier' },
    ...attributes,
  ];
}
export function newCondition(attributes: AttributeDefinition[]): Condition {
  const attribute = availableAttributes(attributes)[0]!;
  return { attribute: attribute.key, operator: 'eq', values: [''] };
}
function scalarDefault(type: AttributeDefinition['type']) {
  return type === 'boolean' ? false : type === 'number' ? 0 : '';
}
function ScalarEditor({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: AttributeDefinition['type'];
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const numberInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (type === 'number' && numberInput.current && numberInput.current.valueAsNumber !== value) {
      numberInput.current.value = String(value);
      numberInput.current.setCustomValidity('');
    }
  }, [type, value]);
  return (
    <label>
      {label}
      {type === 'boolean' ? (
        <select
          className="input"
          value={String(value)}
          onChange={(event) => onChange(event.target.value === 'true')}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      ) : type === 'number' ? (
        <input
          ref={numberInput}
          className="input"
          type="number"
          step="any"
          required
          defaultValue={String(value)}
          onChange={(event) => {
            const number = event.target.valueAsNumber;
            event.target.setCustomValidity(Number.isFinite(number) ? '' : 'Enter a finite number');
            if (Number.isFinite(number)) onChange(number);
          }}
        />
      ) : (
        <input
          className="input"
          type="text"
          maxLength={500}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function StringListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EvaluationContext['attributes'][string];
  onChange: (value: string[]) => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(value));
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setJson(JSON.stringify(value));
    setError('');
    input.current?.setCustomValidity('');
  }, [value]);
  return (
    <label>
      {label}
      <textarea
        ref={input}
        className="textarea fd-mono"
        rows={3}
        required
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          try {
            const parsed = stringListSchema.parse(JSON.parse(event.target.value));
            onChange(parsed);
            setError('');
            event.target.setCustomValidity('');
          } catch {
            const message =
              'Enter a JSON array of at most 100 strings, each at most 500 characters.';
            setError(message);
            event.target.setCustomValidity(message);
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </label>
  );
}

interface ConditionsEditorProps {
  conditions: Condition[];
  attributes: AttributeDefinition[];
  onChange: (conditions: Condition[]) => void;
  disabled?: boolean;
  label?: string;
}
export function ConditionsEditor({
  conditions,
  attributes,
  onChange,
  disabled,
  label = 'Conditions (all must match / AND)',
}: ConditionsEditorProps) {
  const definitions = availableAttributes(attributes);
  const update = (index: number, condition: Condition) =>
    onChange(conditions.map((item, position) => (position === index ? condition : item)));
  return (
    <fieldset className="fd-fieldset" disabled={disabled}>
      <legend>{label}</legend>
      {!conditions.length && (
        <p className="fd-help">
          No conditions · Matches any context before segment and rollout checks.
        </p>
      )}
      {conditions.map((condition, index) => {
        const definition = definitions.find((item) => item.key === condition.attribute);
        const type = definition?.type ?? 'string';
        const operators: Condition['operator'][] = [
          ...(type === 'string_list'
            ? (['contains_any', 'contains_all'] as const)
            : (['eq', 'not_eq', 'in', 'not_in'] as const)),
          ...(type === 'number' ? (['gt', 'gte', 'lt', 'lte'] as const) : []),
          ...(type === 'string' ? (['ends_with'] as const) : []),
          'present',
          'absent',
        ];
        const multipleOperands = ['in', 'not_in', 'contains_any', 'contains_all'].includes(
          condition.operator
        );
        return (
          <div className="fd-condition" key={index}>
            <label>
              Attribute {index + 1}
              <select
                className="input"
                value={condition.attribute}
                onChange={(event) => {
                  const next = definitions.find((item) => item.key === event.target.value)!;
                  update(index, {
                    attribute: next.key,
                    operator: next.type === 'string_list' ? 'contains_any' : 'eq',
                    values: [scalarDefault(next.type)],
                  });
                }}
              >
                {!definition && (
                  <option value={condition.attribute}>
                    {condition.attribute} · Removed from catalog
                  </option>
                )}
                {definitions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.key} ({item.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select
                className="input"
                value={condition.operator}
                onChange={(event) => {
                  const operator = event.target.value as Condition['operator'];
                  update(index, {
                    ...condition,
                    operator,
                    values: ['present', 'absent'].includes(operator)
                      ? []
                      : [condition.values[0] ?? scalarDefault(type)],
                  });
                }}
              >
                {!operators.includes(condition.operator) && (
                  <option value={condition.operator}>
                    {condition.operator} · Invalid for type
                  </option>
                )}
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            {condition.values.map((value, valueIndex) => (
              <div className="fd-inline-fields" key={valueIndex}>
                <ScalarEditor
                  label={`Operand ${valueIndex + 1} (${type === 'string_list' ? 'string' : type})`}
                  type={type === 'string_list' ? 'string' : type}
                  value={value}
                  onChange={(next) =>
                    update(index, {
                      ...condition,
                      values: condition.values.map((item, position) =>
                        position === valueIndex ? next : item
                      ),
                    })
                  }
                />
                {multipleOperands && condition.values.length > 1 && (
                  <Button
                    aria-label={`Remove operand ${valueIndex + 1} from condition ${index + 1}`}
                    onClick={() =>
                      update(index, {
                        ...condition,
                        values: condition.values.filter((_, position) => position !== valueIndex),
                      })
                    }
                  >
                    Remove operand
                  </Button>
                )}
              </div>
            ))}
            {multipleOperands && (
              <Button
                disabled={condition.values.length >= 20}
                onClick={() =>
                  update(index, {
                    ...condition,
                    values: [...condition.values, scalarDefault(type)],
                  })
                }
              >
                Add operand
              </Button>
            )}
            <Button
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => onChange(conditions.filter((_, position) => position !== index))}
            >
              Remove condition
            </Button>
          </div>
        );
      })}
      <Button
        disabled={conditions.length >= 10}
        onClick={() => onChange([...conditions, newCondition(attributes)])}
      >
        Add condition
      </Button>
      <p className="fd-help">
        Missing or wrongly typed attributes never satisfy negative comparisons. String-list
        membership uses exact strings; an empty list matches neither contains_any nor contains_all.
        Use present / absent explicitly. Tenant enablement is targeting, not authorization.
      </p>
    </fieldset>
  );
}

export function ContextEditor({
  context,
  attributes,
  onChange,
}: {
  context: EvaluationContext;
  attributes: AttributeDefinition[];
  onChange: (context: EvaluationContext) => void;
}) {
  return (
    <fieldset className="fd-fieldset">
      <legend>Actual evaluation context</legend>
      <div className="fd-inline-fields">
        <label>
          Tenant ID
          <input
            className="input"
            maxLength={200}
            value={context.tenantId ?? ''}
            onChange={(event) =>
              onChange({ ...context, tenantId: event.target.value || undefined })
            }
          />
        </label>
        <label>
          Stable subject ID
          <input
            className="input"
            maxLength={200}
            value={context.subjectId ?? ''}
            onChange={(event) =>
              onChange({ ...context, subjectId: event.target.value || undefined })
            }
          />
        </label>
      </div>
      {attributes.map((attribute) => {
        const present = Object.hasOwn(context.attributes, attribute.key);
        return (
          <div className="fd-inline-fields" key={`${attribute.key}:${attribute.type}`}>
            <label className="fd-check">
              <input
                type="checkbox"
                checked={present}
                onChange={(event) => {
                  const next = { ...context.attributes };
                  if (event.target.checked)
                    next[attribute.key] =
                      attribute.type === 'string_list' ? [] : scalarDefault(attribute.type);
                  else delete next[attribute.key];
                  onChange({ ...context, attributes: next });
                }}
              />
              Include {attribute.key}
            </label>
            {present &&
              (attribute.type === 'string_list' ? (
                <StringListEditor
                  label={`${attribute.key} (JSON string array)`}
                  value={context.attributes[attribute.key]!}
                  onChange={(value) =>
                    onChange({
                      ...context,
                      attributes: { ...context.attributes, [attribute.key]: value },
                    })
                  }
                />
              ) : (
                <ScalarEditor
                  label={`${attribute.key} (${attribute.type})`}
                  type={attribute.type}
                  value={
                    Array.isArray(context.attributes[attribute.key])
                      ? scalarDefault(attribute.type)
                      : (context.attributes[attribute.key] as string | number | boolean)
                  }
                  onChange={(value) =>
                    onChange({
                      ...context,
                      attributes: { ...context.attributes, [attribute.key]: value },
                    })
                  }
                />
              ))}
          </div>
        );
      })}
      <p className="fd-help">
        Leave identifiers blank or uncheck attributes to test missing data. String lists use JSON
        arrays, not comma-separated text. Context is limited to 32 attributes and 32 KiB and is sent
        only for this simulation; it is not saved in configuration or activity.
      </p>
    </fieldset>
  );
}
