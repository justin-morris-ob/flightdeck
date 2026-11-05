import { useEffect, useState, type ReactNode } from 'react';

import { Button, Notice, PageHeader } from '@onebrief/atlas-ui';

import { flagSchema, type Flag, type Project, type Role } from '../shared/contracts.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { ConfigurationEditor } from './ConfigurationEditor.tsx';
import { useDraftNavigation, useDraftSource } from './draft-context.ts';
import { Confirm } from './forms.tsx';

interface Props {
  request: Request;
  scope: string;
  flagKey: string;
  project: Project;
  environmentId: string;
  role: Role;
  onBack: () => void;
  environmentControl?: ReactNode;
}

export function FlagDetail({
  request,
  scope,
  flagKey,
  project,
  environmentId,
  role,
  onBack,
  environmentControl,
}: Props) {
  const [flag, setFlag] = useState<Flag | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const { confirmTransition } = useDraftNavigation();
  useDraftSource(false, () => setConfirm(false), busy);
  const writable = role !== 'viewer';
  const environment = project.environments.find((item) => item.id === environmentId)!;
  const path = `${scope}/flags/${encodeURIComponent(flagKey)}`;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    get(request, path, flagSchema)
      .then((next) => {
        if (current) setFlag(next);
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, path, version]);

  const reload = (
    <Button
      disabled={busy}
      onClick={() =>
        confirmTransition(() => {
          setConfirm(false);
          setVersion((value) => value + 1);
        })
      }
    >
      Reload latest
    </Button>
  );

  if (loading || !flag || error)
    return (
      <div className="fd-poc-detail" aria-live="polite">
        <Button onClick={onBack}>Back to Flags</Button>
        {loading ? (
          <p>Loading flag…</p>
        ) : (
          <>
            <Notice tone="danger">{error}</Notice>
            {reload}
          </>
        )}
      </div>
    );

  return (
    <div className="fd-poc-detail">
      <Button onClick={onBack} disabled={busy}>
        Back to Flags
      </Button>
      <PageHeader title={flag.name} meta={<code>{flag.key}</code>} actions={environmentControl} />
      {flag.description && <p>{flag.description}</p>}
      {role === 'viewer' && <Notice>Viewer access · Settings are read-only.</Notice>}
      {flag.archived && (
        <Notice>
          This flag is archived and returns its configured off value. Saved settings are read-only
          here.
        </Notice>
      )}
      <section className="fd-poc-card" aria-label="Availability">
        <div className="fd-config-state">
          <div>
            <h2>Availability</h2>
            <p className="fd-help">Off disables the flag in this environment.</p>
          </div>
          <Button
            role="switch"
            aria-checked={flag.enabled}
            aria-label="Flag availability"
            variant={flag.enabled ? 'primary' : 'outline'}
            disabled={!writable || busy || flag.archived}
            onClick={() => confirmTransition(() => setConfirm(true))}
          >
            {flag.enabled ? 'On' : 'Off'}
          </Button>
        </div>
      </section>
      <ConfigurationEditor
        key={flag.revision}
        request={request}
        scope={scope}
        path={path}
        flag={flag}
        writable={writable && !flag.archived}
        projectName={project.name}
        environmentName={environment.name}
        onChanged={setFlag}
      />
      <div className="fd-actions">{reload}</div>
      {confirm && (
        <Confirm
          title={`Turn ${flag.enabled ? 'Off' : 'On'} in ${environment.name}?`}
          action={`Turn ${flag.enabled ? 'Off' : 'On'}`}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const next = await send(
                request,
                path,
                'PATCH',
                { expectedRevision: flag.revision, enabled: !flag.enabled },
                flagSchema
              );
              setFlag(next);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            <strong>{flag.name}</strong> · {project.name} / {environment.name} only. Other
            environments and saved targeting stay unchanged.
          </p>
        </Confirm>
      )}
    </div>
  );
}
