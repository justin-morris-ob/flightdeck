import type { Catalog, Configuration, ConfigurationInput, Segment } from '../shared/targeting.ts';

import { useId } from 'react';

import { Notice } from '@onebrief/atlas-ui';

import { readSimpleAudience, setSimpleAudience } from '../shared/simple-targeting.ts';

interface Props {
  draft: ConfigurationInput;
  published: Configuration;
  catalog: Catalog;
  writable: boolean;
  busy: boolean;
  onChange: (next: ConfigurationInput) => void;
}

export function SimpleTargeting({ draft, published, catalog, writable, busy, onChange }: Props) {
  const inputId = useId();
  const audience = readSimpleAudience(draft);
  if (!audience)
    return (
      <Notice>
        This flag uses a configuration that basic audience controls cannot edit. Its saved
        configuration is preserved; only availability can be changed here.
      </Notice>
    );

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

  function selectSegments(segmentIds: string[]) {
    onChange(
      setSimpleAudience(draft, { mode: 'selected', segmentIds }, selectableSegments, () =>
        crypto.randomUUID()
      )
    );
  }

  return (
    <>
      <p className="fd-help">
        Applies while availability is On. Existing individual exceptions still take priority.
      </p>
      <fieldset className="fd-fieldset fd-audience-mode" disabled={!writable || busy}>
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
          </span>
        </label>
        <label className="fd-audience-choice">
          <input
            type="radio"
            name={`${inputId}-mode`}
            checked={audience.mode === 'selected'}
            onChange={() => selectSegments([])}
          />
          <span>
            <strong>Selected segments</strong>
            <span className="fd-table-sub">Matching any selected segment qualifies.</span>
          </span>
        </label>
      </fieldset>
      {audience.mode === 'selected' && (
        <fieldset className="fd-fieldset" disabled={!writable || busy}>
          <legend>Segments</legend>
          {audience.segmentIds.length === 0 && (
            <Notice>No segments selected. Nobody qualifies through audience targeting.</Notice>
          )}
          {!selectableSegments.length && !missingIds.length && (
            <p>No segments are available. Create one in Segments first.</p>
          )}
          <div className="fd-audience-segments">
            {selectableSegments.map((segment) => {
              const checked = audience.segmentIds.includes(segment.id);
              const available = catalog.segments.some((item) => item.id === segment.id);
              return (
                <label className="fd-audience-choice" key={segment.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && (!available || audience.segmentIds.length >= 20)}
                    onChange={(event) =>
                      selectSegments(
                        event.target.checked
                          ? [...audience.segmentIds, segment.id]
                          : audience.segmentIds.filter((id) => id !== segment.id)
                      )
                    }
                  />
                  <span>
                    <strong>{segment.name}</strong>
                    {!available && (
                      <span className="fd-table-sub">
                        No longer available. Its saved selection is preserved, but remove it before
                        saving other audience changes.
                      </span>
                    )}
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
                    selectSegments(audience.segmentIds.filter((segmentId) => segmentId !== id))
                  }
                />
                <span>
                  <strong>Unavailable segment</strong>
                  <span className="fd-table-sub">
                    Its saved selection is preserved. Remove it before saving audience changes.
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="fd-help" aria-live="polite">
            {audience.segmentIds.length} of 20 segments selected.
          </p>
        </fieldset>
      )}
    </>
  );
}
