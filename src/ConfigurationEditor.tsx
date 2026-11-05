import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { Button, Notice } from '@onebrief/atlas-ui';

import { flagSchema, previewSchema, type Flag } from '../shared/contracts.ts';
import { readSimpleAudience } from '../shared/simple-targeting.ts';
import {
  catalogSchema,
  configurationInput,
  configurationInputSchema,
  previewRequestSchema,
  publishConfigurationSchema,
  type Catalog,
  type ConfigurationInput,
} from '../shared/targeting.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { useDraftSource } from './draft-context.ts';
import { Confirm } from './forms.tsx';
import { SimpleTargeting } from './SimpleTargeting.tsx';

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

interface Review {
  configuration: ConfigurationInput;
  catalogRevision: number;
  audience: string;
  audienceChanged: boolean;
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
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const requestVersion = useRef(0);
  const simple = readSimpleAudience(flag.configuration) !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(configurationInput(flag.configuration));
  const catalogChanged =
    catalog !== null &&
    catalog.revision !== flag.configuration.catalogRevision &&
    (draft.rules.length > 0 || flag.configuration.rules.length > 0);
  useDraftSource(dirty, discard, busy);

  function discard() {
    setDraft(configurationInput(flag.configuration));
    setReview(null);
    setError('');
    requestVersion.current++;
  }

  useEffect(() => {
    if (!simple) return;
    let current = true;
    setCatalogLoading(true);
    setReview(null);
    setError('');
    requestVersion.current++;
    get(request, `${scope}/catalog`, catalogSchema)
      .then((next) => {
        if (current) setCatalog(next);
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
  }, [request, scope, version, simple]);

  function change(next: ConfigurationInput) {
    setDraft(next);
    setReview(null);
    setError('');
    requestVersion.current++;
  }

  async function prepareSave() {
    if (!catalog || catalogLoading || busy || !writable || !simple) return;
    setError('');
    setReview(null);
    const current = ++requestVersion.current;
    setBusy(true);
    try {
      const proposed = configurationInputSchema.parse(draft);
      const body = previewRequestSchema.parse({
        context: { attributes: {} },
        expectedRevision: flag.revision,
        proposedConfiguration: proposed,
        expectedCatalogRevision: catalog.revision,
      });
      const result = await send(request, `${path}/preview`, 'POST', body, previewSchema);
      if (current !== requestVersion.current) return;
      if (!result.proposed) throw new Error('The server did not validate the proposed audience.');
      const audience = readSimpleAudience(proposed);
      if (!audience)
        throw new Error('This configuration cannot be saved with basic audience controls.');
      const summary =
        audience.mode === 'everyone'
          ? 'Everyone'
          : audience.segmentIds.length === 0
            ? 'No segments selected — nobody qualifies through audience targeting'
            : `Any of: ${audience.segmentIds.map((id) => catalog.segments.find((segment) => segment.id === id)?.name ?? 'Unavailable segment').join(', ')}`;
      setReview({
        configuration: proposed,
        catalogRevision: catalog.revision,
        audience: summary,
        audienceChanged: result.allocationChanged || result.warnings.length > 0,
      });
    } catch (cause) {
      setError(
        cause instanceof z.ZodError
          ? cause.issues.map((issue) => issue.message).join(' · ')
          : errorMessage(cause)
      );
    } finally {
      setBusy(false);
    }
  }

  if (!simple)
    return (
      <section className="fd-poc-card" aria-label="Audience">
        <h2>Audience</h2>
        <p className="fd-help">
          This flag uses advanced settings. They are preserved and read-only in this POC.
        </p>
      </section>
    );

  return (
    <section className="fd-poc-card" aria-label="Audience">
      <h2>Audience</h2>
      {error && <Notice tone="danger">{error}</Notice>}
      {catalogLoading ? (
        <p role="status">Loading segments…</p>
      ) : !catalog ? (
        <>
          <p>Segments could not be loaded. No audience changes can be saved.</p>
          <Button onClick={() => setVersion((value) => value + 1)}>Retry</Button>
        </>
      ) : (
        <>
          {catalogChanged && (
            <Notice tone="warning">
              Segment definitions have changed since this audience was saved. Saved targeting stays
              unchanged until you save again. Saving uses the latest definitions and may change who
              qualifies.
            </Notice>
          )}
          <SimpleTargeting
            draft={draft}
            published={flag.configuration}
            catalog={catalog}
            writable={writable}
            busy={busy}
            onChange={change}
          />
          {writable && (
            <div className="fd-actions">
              <Button
                variant="primary"
                disabled={busy || (!dirty && !catalogChanged)}
                onClick={() => void prepareSave()}
              >
                {busy ? 'Checking…' : 'Save'}
              </Button>
              <Button disabled={!dirty || busy} onClick={discard}>
                Discard
              </Button>
              {dirty && <span className="fd-help">Unsaved changes</span>}
            </div>
          )}
        </>
      )}
      {review && (
        <Confirm
          title={`Save audience in ${environmentName}?`}
          action="Save audience"
          onClose={() => setReview(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const input = publishConfigurationSchema.parse({
                expectedRevision: flag.revision,
                expectedCatalogRevision: review.catalogRevision,
                configuration: review.configuration,
              });
              const next = await send(request, `${path}/configuration`, 'PUT', input, flagSchema);
              onChanged(next);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            <strong>{flag.name}</strong> · {projectName} / {environmentName} only. Other
            environments stay unchanged.
          </p>
          <p>{review.audience}</p>
          {review.audienceChanged && (
            <Notice tone="warning">Who qualifies may change after this save.</Notice>
          )}
          <p className="fd-help">Availability stays {flag.enabled ? 'On' : 'Off'}.</p>
        </Confirm>
      )}
    </section>
  );
}
