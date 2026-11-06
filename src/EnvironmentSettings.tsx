import { useEffect, useState } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import { catalogSchema, catalogUpdateSchema, type Catalog } from '../shared/targeting.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { Credentials } from './Credentials.tsx';

interface Props {
  request: Request;
  scope: string;
  projectName: string;
  environmentName: string;
  onDirtyChange: (dirty: boolean) => void;
}
export function EnvironmentSettings({
  request,
  scope,
  projectName,
  environmentName,
  onDirtyChange,
}: Props) {
  const [tab, setTab] = useState<'credentials' | 'context'>('credentials');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = catalog !== null && text !== JSON.stringify(catalog.attributes, null, 2);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let current = true;
    get(request, `${scope}/catalog`, catalogSchema)
      .then((next) => {
        if (current) {
          setCatalog(next);
          setText(JSON.stringify(next.attributes, null, 2));
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope]);
  return (
    <section className="fd-settings">
      <header>
        <p className="fd-eyebrow">
          {projectName} · {environmentName}
        </p>
        <h1>Flightdeck settings</h1>
        <p>Technical integration settings · Administrator access</p>
      </header>
      <nav className="fd-actions" aria-label="Settings sections">
        <Button
          variant={tab === 'credentials' ? 'primary' : 'quiet'}
          onClick={() => setTab('credentials')}
        >
          Evaluation credentials
        </Button>
        <Button variant={tab === 'context' ? 'primary' : 'quiet'} onClick={() => setTab('context')}>
          Evaluation context schema
        </Button>
      </nav>
      <div hidden={tab !== 'credentials'}>
        <Credentials
          request={request}
          scope={scope}
          projectName={projectName}
          environmentName={environmentName}
        />
      </div>
      <div hidden={tab !== 'context'} className="fd-form fd-settings-context">
        <h2>Evaluation context schema</h2>
        <p>
          Declare consumer-supplied traits for this environment. Segment definitions are managed in
          Segments, not here. Changing types must remain compatible with published rules.
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
        {catalog ? (
          <>
            <Badge>
              {dirty ? 'Unpublished schema changes' : `Schema revision ${catalog.revision}`}
            </Badge>
            <label>
              Attribute definitions (JSON)
              <textarea
                className="textarea fd-mono"
                rows={16}
                disabled={busy}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <div className="fd-actions">
              <Button
                disabled={busy || !dirty}
                onClick={() => setText(JSON.stringify(catalog.attributes, null, 2))}
              >
                Discard changes
              </Button>
              <Button
                variant="primary"
                disabled={busy || !dirty}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const input = catalogUpdateSchema.parse({
                      expectedRevision: catalog.revision,
                      catalog: { attributes: JSON.parse(text) },
                    });
                    const next = await send(
                      request,
                      `${scope}/catalog`,
                      'PUT',
                      input,
                      catalogSchema
                    );
                    setCatalog(next);
                    setText(JSON.stringify(next.attributes, null, 2));
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save context schema
              </Button>
            </div>
          </>
        ) : (
          <p role="status">{error ? 'Context schema unavailable.' : 'Loading context schema…'}</p>
        )}
      </div>
    </section>
  );
}
