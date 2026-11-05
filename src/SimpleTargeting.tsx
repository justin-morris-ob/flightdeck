import type { Catalog, Configuration, ConfigurationInput, Segment } from '../shared/targeting.ts';

import { useId } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import { readSimpleAudience, setSimpleAudience } from '../shared/simple-targeting.ts';

interface Props {
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
                  { mode: 'everyone', segmentIds: [] },
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
                  { mode: 'selected', segmentIds: [] },
                  selectableSegments,
                  () => crypto.randomUUID()
                )
              )
            }
          />
          <span>
            <strong>Selected audiences</strong>
            <span className="fd-table-sub">Any selected segment can qualify (OR).</span>
          </span>
        </label>
      </fieldset>
      <fieldset className="fd-fieldset fd-bc-directory" disabled>
        <legend>BC people, organizations and groups</legend>
        <Badge tone="warning">BC directory not connected</Badge>
        <p className="fd-help">
          BC email, organization and group selection is unavailable. No BC directory or membership
          data is connected to Flightdeck.
        </p>
        <div className="fd-inline-fields">
          {['People by email', 'Organizations', 'Groups'].map((label) => (
            <label key={label}>
              {label}
              <input
                className="input"
                disabled
                readOnly
                value=""
                placeholder="BC directory not connected"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {audience.mode === 'selected' && (
        <fieldset className="fd-fieldset" disabled={disabled}>
          <legend>Flightdeck segments · any match (OR)</legend>
          <p className="fd-help">
            Existing predicate-based segments work now. Each selected segment is an independent way
            to qualify; conditions within a segment must all match. Select up to 20 segments.
          </p>
          {audience.segmentIds.length === 0 && (
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
                    disabled={!checked && audience.segmentIds.length >= 20}
                    onChange={(event) =>
                      onChange(
                        setSimpleAudience(
                          draft,
                          {
                            mode: 'selected',
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
                          mode: 'selected',
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
            {audience.segmentIds.length} of 20 segments selected. Publication validates current
            catalog references and explicitly refreshes pinned definitions.
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
