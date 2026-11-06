import type { Catalog, ConfigurationInput } from '../shared/targeting.ts';
import type { Request } from './api.ts';

import { useId, useState } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import { directoryAttributes, type DirectoryAudience } from '../shared/directory.ts';
import { readSimpleAudience, setSimpleAudience } from '../shared/simple-targeting.ts';
import { AudiencePicker } from './AudiencePicker.tsx';

interface Props {
  request: Request;
  scope: string;
  draft: ConfigurationInput;
  catalog: Catalog;
  writable: boolean;
  busy: boolean;
  onChange: (next: ConfigurationInput) => void;
  onOpenAdvanced: () => void;
}
export function SimpleTargeting({
  request,
  scope,
  draft,
  catalog,
  writable,
  busy,
  onChange,
  onOpenAdvanced,
}: Props) {
  const id = useId();
  const [error, setError] = useState('');
  const audience = readSimpleAudience(draft);
  if (!audience)
    return (
      <>
        <Notice>
          This typed or advanced configuration cannot be represented as simple audience selections.
          Its saved rules and values are preserved.
        </Notice>
        <Button onClick={onOpenAdvanced}>Edit typed configuration</Button>
      </>
    );
  const disabled = !writable || busy;
  const conflict = directoryAttributes.some((definition) =>
    catalog.attributes.some((item) => item.key === definition.key && item.type !== definition.type)
  );
  const branches = audience.segmentIds.length + audience.directoryTargets.length;
  function change(next: typeof audience) {
    if (!next) return;
    setError('');
    if (next.segmentIds.length + next.directoryTargets.length > 20) {
      setError('Choose at most 20 audience branches.');
      return;
    }
    onChange(setSimpleAudience(draft, next, catalog.segments, () => crypto.randomUUID()));
  }
  function selectAudiences(directoryTargets: DirectoryAudience[], segmentIds: string[]) {
    change({ ...audience!, directoryTargets, segmentIds });
  }
  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}
      <fieldset className="fd-fieldset fd-audience-mode" disabled={disabled}>
        <legend>Who should receive this flag?</legend>
        <label className="fd-audience-choice">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={audience.mode === 'everyone'}
            onChange={() => change({ mode: 'everyone', segmentIds: [], directoryTargets: [] })}
          />
          <span>
            <strong>Everyone</strong>
            <span className="fd-table-sub">No audience restrictions</span>
          </span>
        </label>
        <label className="fd-audience-choice">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={audience.mode === 'selected'}
            onChange={() => change({ mode: 'selected', segmentIds: [], directoryTargets: [] })}
          />
          <span>
            <strong>Selected audiences</strong>
            <span className="fd-table-sub">Include anyone matching any selection (OR)</span>
          </span>
        </label>
      </fieldset>
      {audience.mode === 'selected' && (
        <>
          {!branches && (
            <Notice>
              No audiences selected · Nobody qualifies through audience targeting. Exceptions can
              still apply while the gate is On.
            </Notice>
          )}
          {conflict && (
            <Notice tone="warning">
              Existing context field types conflict with directory targeting. They will not be
              overwritten. Correct the schema in Flightdeck settings before publishing.
            </Notice>
          )}
          <fieldset className="fd-fieldset fd-audience-memberships" disabled={disabled}>
            <legend>Search audiences</legend>
            <AudiencePicker
              request={request}
              scope={scope}
              selected={audience.directoryTargets}
              compact
              disabled={disabled}
              directoryDisabled={conflict}
              segments={{ options: catalog.segments, selectedIds: audience.segmentIds }}
              onChange={selectAudiences}
            />
            <p className="fd-help">
              Any selection qualifies · Published Flightdeck segments or BC directory memberships
            </p>
          </fieldset>
          <p className="fd-help">
            People and memberships qualify across organizations within their trusted tenant/source.
            ANY audience can qualify; ALL conditions within a trait block must match.
          </p>
        </>
      )}
    </>
  );
}
