import type { AttributeDefinition, Condition } from '../shared/targeting.ts';
import type { Request } from './api.ts';

import { useState } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import {
  directoryAttributes,
  directoryAudienceSchema,
  directoryConditions,
  type DirectoryBinding,
  type DirectoryKind,
} from '../shared/directory.ts';
import { DirectoryPicker } from './DirectoryPicker.tsx';

interface Props {
  request: Request;
  scope: string;
  environmentName: string;
  binding: DirectoryBinding;
  attributes: AttributeDefinition[];
  conditions: Condition[];
  disabled: boolean;
  onAdd: (attributes: AttributeDefinition[], conditions: Condition[]) => void;
}

function matchesGuard(condition: Condition, value: string): boolean {
  if (condition.values.some((value) => typeof value !== 'string')) return false;
  switch (condition.operator) {
    case 'eq':
      return condition.values.length === 1 && condition.values[0] === value;
    case 'not_eq':
      return condition.values.length === 1 && condition.values[0] !== value;
    case 'in':
      return condition.values.length > 0 && condition.values.includes(value);
    case 'not_in':
      return condition.values.length > 0 && !condition.values.includes(value);
    case 'present':
      return condition.values.length === 0;
    default:
      return false;
  }
}

export function DirectorySegmentBuilder({
  request,
  scope,
  environmentName,
  binding,
  attributes,
  conditions,
  disabled,
  onAdd,
}: Props) {
  const [kind, setKind] = useState<DirectoryKind>('people');
  const [selections, setSelections] = useState<Record<DirectoryKind, string[]>>({
    people: [],
    organizations: [],
    groups: [],
  });
  const [added, setAdded] = useState('');
  const ids = selections[kind];
  const membershipKey = kind === 'organizations' ? 'organizationIds' : 'groupIds';
  const required = directoryAttributes.filter(
    (attribute) =>
      attribute.key === 'sourceId' || (kind !== 'people' && attribute.key === membershipKey)
  );
  const incompatible = required.find((definition) =>
    attributes.some(
      (attribute) => attribute.key === definition.key && attribute.type !== definition.type
    )
  );
  const missing = required.filter(
    (definition) => !attributes.some((attribute) => attribute.key === definition.key)
  );
  const guards: Condition[] = [
    { attribute: 'tenantId', operator: 'eq', values: [binding.tenantId] },
    { attribute: 'sourceId', operator: 'eq', values: [binding.sourceId] },
  ];
  const conflict = guards.find((guard) =>
    conditions.some(
      (condition) =>
        condition.attribute === guard.attribute &&
        !matchesGuard(condition, guard.values[0] as string)
    )
  );
  const missingGuards = guards.filter(
    (guard) =>
      !conditions.some(
        (condition) =>
          condition.attribute === guard.attribute &&
          condition.operator === 'eq' &&
          condition.values.length === 1 &&
          condition.values[0] === guard.values[0]
      )
  );
  const problem = incompatible
    ? `The existing ${incompatible.key} attribute must have type ${incompatible.type}. It was not overwritten.`
    : conflict
      ? `Existing ${conflict.attribute} conditions conflict with this directory binding. They were not changed. Use a separate segment or explicitly edit its conditions.`
      : attributes.length + missing.length > 32
        ? 'The required directory attributes would exceed the 32-attribute catalog limit.'
        : conditions.length + missingGuards.length + 1 > 10
          ? 'This selection and its required guards would exceed the 10-condition segment limit.'
          : '';

  function add() {
    if (disabled || problem) return;
    const target = directoryAudienceSchema.safeParse({ ...binding, kind, ids });
    if (!target.success) return;
    const additions = directoryConditions(target.data).filter(
      (condition) =>
        !guards.some((guard) => guard.attribute === condition.attribute) ||
        missingGuards.some((guard) => guard.attribute === condition.attribute)
    );
    onAdd([...attributes, ...missing], [...conditions, ...additions]);
    setSelections({ ...selections, [kind]: [] });
    setAdded(
      `Added ${ids.length} ${kind} ID${ids.length === 1 ? '' : 's'} and source/tenant guards to this local draft. Save the project catalog to publish it.`
    );
  }

  return (
    <fieldset className="fd-fieldset" disabled={disabled}>
      <legend>Add BC directory condition</legend>
      <p className="fd-help">
        Directory from {environmentName} · Source {binding.sourceId} · Tenant {binding.tenantId}.
        This segment belongs to the whole project, not just this environment.
      </p>
      <label>
        Directory audience type
        <select
          className="input"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as DirectoryKind);
            setAdded('');
          }}
        >
          <option value="people">People by email</option>
          <option value="organizations">Organizations</option>
          <option value="groups">Groups</option>
        </select>
      </label>
      <DirectoryPicker
        key={kind}
        request={request}
        scope={scope}
        kind={kind}
        binding={binding}
        ids={ids}
        disabled={disabled}
        onChange={(next) => {
          setSelections({ ...selections, [kind]: next });
          setAdded('');
        }}
      />
      {problem && <Notice tone="warning">{problem}</Notice>}
      {missing.length > 0 && !incompatible && (
        <p className="fd-help">
          Add also prepares these local catalog attributes:{' '}
          {missing.map((attribute) => `${attribute.key} (${attribute.type})`).join(', ')}. No
          catalog write occurs until Save.
        </p>
      )}
      <p className="fd-help">
        Selected IDs are alternatives within this condition. Adding another condition uses AND,
        never replaces existing predicates, and never broadens existing tenant/source guards. Use
        separate segments for alternative audiences.
      </p>
      <Button type="button" disabled={disabled || Boolean(problem) || !ids.length} onClick={add}>
        Add selected {kind} to segment draft
      </Button>
      {added && <p role="status">{added}</p>}
    </fieldset>
  );
}

export function DirectorySegmentSummary({ conditions }: { conditions: Condition[] }) {
  const identities = conditions.filter(
    (condition) =>
      (condition.attribute === 'subjectId' && ['eq', 'in'].includes(condition.operator)) ||
      (['organizationIds', 'groupIds'].includes(condition.attribute) &&
        ['contains_any', 'contains_all'].includes(condition.operator))
  );
  if (!identities.length) return null;
  return (
    <section aria-label="Saved directory identity predicates">
      <p className="fd-help">
        Stable IDs in this segment · Labels are not stored in the catalog. These IDs remain visible
        without a directory connection; evaluation uses trusted consumer context only.
      </p>
      <ul>
        {identities.map((condition, index) => (
          <li key={index}>
            {condition.attribute === 'subjectId'
              ? 'Person'
              : condition.attribute === 'organizationIds'
                ? 'Organization'
                : 'Group'}
            {' IDs · '}
            {condition.operator} · {condition.values.join(', ')} · Directory labels not loaded
          </li>
        ))}
      </ul>
    </section>
  );
}
