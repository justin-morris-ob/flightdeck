import type { Catalog, Configuration, ConfigurationInput, Segment } from '../shared/targeting.ts';
import type { Request } from './api.ts';

import { useId } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import {
  directoryAttributes,
  type DirectoryAudience,
  type DirectoryKind,
} from '../shared/directory.ts';
import { readSimpleAudience, setSimpleAudience } from '../shared/simple-targeting.ts';
import {
  DirectoryConnectionNotice,
  DirectoryPicker,
  useDirectoryConnection,
} from './DirectoryPicker.tsx';

interface Props {
  request: Request;
  scope: string;
  environmentName: string;
  onPrepareDirectory: () => void;
  draft: ConfigurationInput;
  published: Configuration;
  catalog: Catalog;
  writable: boolean;
  busy: boolean;
  onChange: (next: ConfigurationInput) => void;
  onReview: () => void;
  onOpenAdvanced: () => void;
}

export function SimpleTargeting({
  request,
  scope,
  environmentName,
  onPrepareDirectory,
  draft,
  published,
  catalog,
  writable,
  busy,
  onChange,
  onReview,
  onOpenAdvanced,
}: Props) {
  const inputId = useId();
  const connection = useDirectoryConnection(request, scope);
  const audience = readSimpleAudience(draft);
  if (!audience)
    return (
      <>
        <Notice>
          Advanced configuration preserved. This flag uses typed values, conditions, rollout or
          variant controls that cannot be represented as a simple audience. Nothing has been
          converted or cleared.
        </Notice>
        <div className="fd-actions">
          <Button onClick={onOpenAdvanced}>Open advanced controls</Button>
        </div>
      </>
    );

  const disabled = !writable || busy;
  const selectableSegments: Segment[] = [...catalog.segments];
  for (const segment of published.segments)
    if (
      audience.segmentIds.includes(segment.id) &&
      !selectableSegments.some((item) => item.id === segment.id)
    )
      selectableSegments.push(segment);
  const missingIds = audience.segmentIds.filter(
    (id) => !selectableSegments.some((segment) => segment.id === id)
  );
  const configured = connection.status?.status === 'configured' ? connection.status : null;
  const matchingBinding = (target: DirectoryAudience) =>
    configured !== null &&
    target.sourceId === configured.binding.sourceId &&
    target.tenantId === configured.binding.tenantId;
  const unconnected = audience.directoryTargets.filter((target) => !matchingBinding(target));
  const missingAttributes = directoryAttributes.filter(
    (definition) =>
      !catalog.attributes.some(
        (item) => item.key === definition.key && item.type === definition.type
      )
  );
  const conflictingAttributes = directoryAttributes.filter((definition) =>
    catalog.attributes.some((item) => item.key === definition.key && item.type !== definition.type)
  );
  const branches = audience.segmentIds.length + audience.directoryTargets.length;
  function setDirectory(target: DirectoryAudience, ids: string[]) {
    if (!audience) return;
    const others = audience.directoryTargets.filter(
      (item) =>
        !(
          item.kind === target.kind &&
          item.sourceId === target.sourceId &&
          item.tenantId === target.tenantId
        )
    );
    onChange(
      setSimpleAudience(
        draft,
        {
          ...audience,
          directoryTargets: ids.length ? [...others, { ...target, ids }] : others,
        },
        selectableSegments,
        () => crypto.randomUUID()
      )
    );
  }

  return (
    <>
      <p className="fd-help">
        Choose who receives this flag when the environment is enabled. Individual exceptions still
        take priority over audience targeting; disabling the environment overrides both.
      </p>
      <fieldset className="fd-fieldset fd-audience-mode" disabled={disabled}>
        <legend>Who should receive this flag?</legend>
        <label className="fd-audience-choice">
          <input
            type="radio"
            name={`${inputId}-mode`}
            checked={audience.mode === 'everyone'}
            onChange={() =>
              onChange(
                setSimpleAudience(
                  draft,
                  { mode: 'everyone', segmentIds: [], directoryTargets: [] },
                  selectableSegments,
                  () => crypto.randomUUID()
                )
              )
            }
          />
          <span>
            <strong>Everyone</strong>
            <span className="fd-table-sub">No audience restrictions.</span>
          </span>
        </label>
        <label className="fd-audience-choice">
          <input
            type="radio"
            name={`${inputId}-mode`}
            checked={audience.mode === 'selected'}
            onChange={() =>
              onChange(
                setSimpleAudience(
                  draft,
                  { mode: 'selected', segmentIds: [], directoryTargets: [] },
                  selectableSegments,
                  () => crypto.randomUUID()
                )
              )
            }
          />
          <span>
            <strong>Selected audiences</strong>
            <span className="fd-table-sub">
              Any selected person, organization, group or segment can qualify (OR).
            </span>
          </span>
        </label>
      </fieldset>
      {audience.mode === 'selected' && (
        <fieldset className="fd-fieldset fd-bc-directory" disabled={disabled}>
          <legend>BC people, organizations and groups · {environmentName}</legend>
          <DirectoryConnectionNotice status={connection.status} error={connection.error} />
          <Button onClick={connection.reload}>Refresh directory connection</Button>
          {configured && missingAttributes.length > 0 && (
            <Notice tone="warning">
              {conflictingAttributes.length
                ? `Incompatible project context fields: ${conflictingAttributes.map((item) => item.key).join(', ')}. Existing types will not be overwritten.`
                : 'Prepare the standard source and membership context fields before adding directory audiences. This saves a project catalog revision, not flag targeting.'}
              {!conflictingAttributes.length && (
                <Button onClick={onPrepareDirectory}>Prepare BC targeting fields</Button>
              )}
            </Notice>
          )}
          {configured &&
            (['people', 'organizations', 'groups'] as const).map((kind: DirectoryKind) => {
              const target = audience.directoryTargets.find(
                (item) => item.kind === kind && matchingBinding(item)
              );
              return (
                <DirectoryPicker
                  key={`${kind}:${configured.binding.sourceId}:${configured.binding.tenantId}`}
                  request={request}
                  scope={scope}
                  kind={kind}
                  binding={configured.binding}
                  ids={target?.ids ?? []}
                  disabled={
                    !writable || missingAttributes.length > 0 || (!target && branches >= 20)
                  }
                  onChange={(ids) =>
                    setDirectory(target ?? { ...configured.binding, kind, ids: [] }, ids)
                  }
                />
              );
            })}
          {unconnected.map((target) => (
            <fieldset
              className="fd-fieldset"
              key={`${target.kind}:${target.sourceId}:${target.tenantId}`}
            >
              <legend>Saved {target.kind} · unavailable directory binding</legend>
              <Notice tone="warning">
                IDs remain active for source {target.sourceId}, tenant {target.tenantId}. Changing
                the connection does not migrate saved targeting.
              </Notice>
              <ul>
                {target.ids.map((id) => (
                  <li key={id}>
                    {id}{' '}
                    <Button
                      onClick={() =>
                        setDirectory(
                          target,
                          target.ids.filter((value) => value !== id)
                        )
                      }
                    >
                      Remove saved {id}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="fd-help">
                Undo draft change restores a removed selection before publication.
              </p>
            </fieldset>
          ))}
        </fieldset>
      )}
      {audience.mode === 'selected' && (
        <fieldset className="fd-fieldset" disabled={disabled}>
          <legend>Flightdeck segments · any match (OR)</legend>
          <p className="fd-help">
            Each selected segment is another independent way to qualify; conditions within a segment
            must all match. Up to 20 audience branches total are supported.
          </p>
          {branches === 0 && (
            <Notice tone="warning">
              No audiences selected · nobody qualifies through audience targeting. This does not
              switch back to Everyone. Individual exceptions can still apply.
            </Notice>
          )}
          {!selectableSegments.length && !missingIds.length && (
            <p>
              No Flightdeck segments are available. Define predicate segments in the project
              catalog.
            </p>
          )}
          <div className="fd-audience-segments">
            {selectableSegments.map((segment) => {
              const checked = audience.segmentIds.includes(segment.id);
              const current = catalog.segments.find((item) => item.id === segment.id);
              const pinned = published.segments.find((item) => item.id === segment.id);
              return (
                <label className="fd-audience-choice" key={segment.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && branches >= 20}
                    onChange={(event) =>
                      onChange(
                        setSimpleAudience(
                          draft,
                          {
                            ...audience,
                            segmentIds: event.target.checked
                              ? [...audience.segmentIds, segment.id]
                              : audience.segmentIds.filter((id) => id !== segment.id),
                          },
                          selectableSegments,
                          () => crypto.randomUUID()
                        )
                      )
                    }
                  />
                  <span>
                    <strong>{segment.name}</strong>{' '}
                    {!current && (
                      <Badge tone="warning">Pinned only · unavailable in current catalog</Badge>
                    )}
                    {current && pinned && current.revision !== pinned.revision && (
                      <Badge tone="warning">Catalog changed since publication</Badge>
                    )}
                    <span className="fd-table-sub">
                      {segment.key} · {segment.conditions.length}{' '}
                      {segment.conditions.length === 1 ? 'condition' : 'conditions'} ·{' '}
                      {current ? `Current r${current.revision}` : `Pinned r${segment.revision}`}
                      {current && pinned ? ` · Published r${pinned.revision}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {missingIds.map((id) => (
              <label className="fd-audience-choice" key={id}>
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    onChange(
                      setSimpleAudience(
                        draft,
                        {
                          ...audience,
                          segmentIds: audience.segmentIds.filter((segmentId) => segmentId !== id),
                        },
                        selectableSegments,
                        () => crypto.randomUUID()
                      )
                    )
                  }
                />
                <span>
                  <strong>Missing segment</strong> <Badge tone="warning">Selection preserved</Badge>
                  <span className="fd-table-sub">
                    {id} · No current or pinned definition available.
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="fd-help" aria-live="polite">
            {branches} of 20 audience branches selected. Publication validates current catalog
            references and explicitly refreshes pinned definitions.
          </p>
        </fieldset>
      )}
      <div className="fd-actions">
        <Button onClick={onOpenAdvanced}>Open advanced controls</Button>
        <Button variant="primary" disabled={disabled} onClick={onReview}>
          Review targeting changes
        </Button>
      </div>
    </>
  );
}
