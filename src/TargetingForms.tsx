import type { AttributeDefinition, Condition } from '../shared/targeting.ts';

import { useEffect, useRef } from 'react';

import { Button } from '@onebrief/atlas-ui';

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
    </fieldset>
  );
}
