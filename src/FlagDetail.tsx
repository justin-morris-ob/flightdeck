import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Button, Notice, PageHeader } from '@onebrief/atlas-ui';

import { flagSchema, type Flag, type Project, type Role } from '../shared/contracts.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { ConfigurationEditor } from './ConfigurationEditor.tsx';
import { Confirm, FlagForm, Modal } from './forms.tsx';
import { lifecycleDescription, lifecycleLabels } from './lifecycle.ts';
import { Overrides } from './Overrides.tsx';
import { PublishedBehavior } from './PublishedBehavior.tsx';
import { PublishedContext } from './PublishedContext.tsx';

interface Props {
  request: Request;
  scope: string;
  flagKey: string;
  project: Project;
  environmentId: string;
  role: Role;
  onBack: () => void;
  onAudit: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  master?: boolean;
}
export function FlagDetail({
  request,
  scope,
  flagKey,
  project,
  environmentId,
  role,
  onBack,
  onAudit,
  onDirtyChange,
  master = false,
}: Props) {
  const [flag, setFlag] = useState<Flag | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [exceptions, setExceptions] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirm, setConfirm] = useState<'toggle' | 'archive' | 'lifecycle' | null>(null);
  const [lifecycle, setLifecycle] = useState<Flag['lifecycle']>('development');
  const pending = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const writable = role !== 'viewer' && !master;
  const environment = project.environments.find((item) => item.id === environmentId)!;
  const path = `${scope}/flags/${encodeURIComponent(flagKey)}`;
  const reportDirty = useCallback((value: boolean) => setDirty(value), []);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    get(request, path, flagSchema)
      .then((next) => {
        if (current) {
          setFlag(next);
          setLifecycle(next.lifecycle);
        }
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
  useEffect(() => {
    if (editing) editorHeading.current?.focus();
  }, [editing]);
  function guard(action: () => void) {
    if (dirtyRef.current) {
      pending.current = action;
      setDiscarding(true);
    } else action();
  }
  async function mutate(changes: Record<string, unknown>) {
    if (!flag) return;
    setBusy(true);
    try {
      const next = await send(
        request,
        path,
        'PATCH',
        { expectedRevision: flag.revision, ...changes },
        flagSchema
      );
      setFlag(next);
      setLifecycle(next.lifecycle);
      setEditorVersion((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  if (loading || !flag)
    return (
      <div className="fd-loading" aria-live="polite">
        <Button onClick={onBack}>Back to flags</Button>
        {loading ? (
          <p>Loading published configuration…</p>
        ) : (
          <>
            <Notice tone="danger">{error}</Notice>
            <Button onClick={() => setVersion((value) => value + 1)}>Retry</Button>
          </>
        )}
      </div>
    );
  return (
    <>
      <section className="fd-unified-detail">
        <PageHeader
          title={flag.name}
          badges={
            <>
              <Badge tone={flag.archived ? 'warning' : 'secondary'}>
                {flag.archived ? 'Archived' : 'Active'}
              </Badge>
              <Badge>Lifecycle · {lifecycleLabels[flag.lifecycle]}</Badge>
            </>
          }
          crumbs={[project.name, environment.name]}
          meta={
            <>
              <code>{flag.key}</code> · {flag.owner} · {flag.configuration.offValue.type}
            </>
          }
          actions={
            <>
              <Button onClick={onBack}>Back to flags</Button>
              <Button onClick={() => onAudit(flag.id)}>View audit history</Button>
              <Button
                onClick={() =>
                  guard(() => {
                    setEditing(false);
                    setVersion((value) => value + 1);
                  })
                }
              >
                Reload
              </Button>
            </>
          }
        />
        {error && <Notice tone="danger">{error}</Notice>}
        {master && (
          <Notice>
            Read-only environment report. Open this environment's local dashboard to make changes.
          </Notice>
        )}
        <div className="fd-detail-layout">
          <main className="fd-detail-published">
            <section className="fd-published-card fd-lifecycle-panel" aria-label="Lifecycle">
              <div>
                <h2 className="fd-eyebrow">
                  Lifecycle ·{' '}
                  {flag.lifecycle === 'development' || flag.lifecycle === 'release'
                    ? 'Temporary'
                    : 'Long-lived'}
                </h2>
                {flag.lifecycle === 'development' || flag.lifecycle === 'release' ? (
                  <p className="fd-lifecycle-path">
                    <span data-current={flag.lifecycle === 'development' || undefined}>
                      Development
                    </span>
                    <span aria-hidden="true">→</span>
                    <span data-current={flag.lifecycle === 'release' || undefined}>Release</span>
                  </p>
                ) : (
                  <p className="fd-lifecycle-path">
                    <strong>{lifecycleLabels[flag.lifecycle]}</strong>
                  </p>
                )}
              </div>
              <p className="fd-help">{lifecycleDescription[flag.lifecycle]}</p>
              {writable && (
                <Button
                  onClick={() =>
                    guard(() => {
                      setLifecycle(flag.lifecycle);
                      setConfirm('lifecycle');
                    })
                  }
                >
                  Change lifecycle
                </Button>
              )}
            </section>
            <ConfigurationEditor
              request={request}
              scope={scope}
              path={path}
              flag={flag}
              writable={writable}
              projectName={project.name}
              environmentName={environment.name}
              editing={editing}
              resetVersion={editorVersion}
              onDirtyChange={reportDirty}
              onChanged={(next) => {
                setFlag(next);
                setDirty(false);
                setEditing(false);
                setEditorVersion((value) => value + 1);
              }}
            >
              {({ audience, advanced }) => (
                <>
                  <PublishedBehavior
                    flag={flag}
                    environmentName={environment.name}
                    request={request}
                    scope={scope}
                    writable={writable}
                    editing={editing}
                    audienceEditor={
                      <section
                        className="fd-audience-editor"
                        aria-label="Edit audience"
                        hidden={!editing}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.stopPropagation();
                            guard(() => setEditing(false));
                          }
                        }}
                      >
                        <header className="fd-audience-editor-head">
                          <div>
                            <h3 ref={editorHeading} tabIndex={-1}>
                              Edit audience
                            </h3>
                            <p>
                              {environment.name} · {flag.name}
                            </p>
                          </div>
                          <Button
                            aria-label="Close audience editor"
                            onClick={() => guard(() => setEditing(false))}
                          >
                            Close
                          </Button>
                        </header>
                        {audience}
                      </section>
                    }
                    gateAction={
                      writable && (
                        <Button
                          disabled={busy || flag.archived}
                          onClick={() => guard(() => setConfirm('toggle'))}
                        >
                          Change gate
                        </Button>
                      )
                    }
                    audienceAction={
                      writable &&
                      (editing ? (
                        <Badge>Editing audience</Badge>
                      ) : (
                        <Button
                          variant="primary"
                          disabled={flag.archived}
                          onClick={() => setEditing(true)}
                        >
                          Edit audience
                        </Button>
                      ))
                    }
                    exceptionsAction={
                      <Button
                        aria-expanded={exceptions}
                        onClick={() => setExceptions((value) => !value)}
                      >
                        {exceptions ? 'Close exceptions' : 'Exceptions'}
                      </Button>
                    }
                    contextPanel={<PublishedContext request={request} path={path} flag={flag} />}
                  />
                  {advanced}
                </>
              )}
            </ConfigurationEditor>
            {exceptions && (
              <Overrides
                request={request}
                path={path}
                flag={flag}
                writable={writable && !dirty}
                environmentName={environment.name}
                onChanged={(next) => {
                  if (JSON.stringify(next) === JSON.stringify(flag)) return;
                  guard(() => {
                    setFlag(next);
                    setEditorVersion((value) => value + 1);
                  });
                }}
              />
            )}
            <section className="fd-published-card fd-flag-information">
              <h2>Flag information</h2>
              <p>{flag.description || 'No description'}</p>
              <dl>
                <dt>Owner</dt>
                <dd>{flag.owner}</dd>
                <dt>Updated</dt>
                <dd>{dateTime(flag.updatedAt)}</dd>
              </dl>
              {writable && (
                <div className="fd-actions">
                  <Button onClick={() => guard(() => setMetadata(true))}>Edit metadata</Button>
                  <Button onClick={() => guard(() => setConfirm('archive'))}>
                    {flag.archived ? 'Restore flag' : 'Archive flag'}
                  </Button>
                </div>
              )}
              <p className="fd-help">
                Metadata and lifecycle belong to {environment.name}. They do not change audiences or
                gates in other environments.
              </p>
            </section>
          </main>
        </div>
      </section>
      {metadata && (
        <Modal
          title={`Edit metadata · ${environment.name}`}
          onClose={() => {
            if (!busy) setMetadata(false);
          }}
        >
          <FlagForm
            flag={flag}
            environmentName={environment.name}
            busy={busy}
            onCancel={() => setMetadata(false)}
            onSave={async ({ name, description, owner }) => {
              await mutate({ name, description, owner });
              setMetadata(false);
            }}
          />
        </Modal>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === 'lifecycle'
              ? `Review lifecycle change · ${environment.name}`
              : confirm === 'archive'
                ? `${flag.archived ? 'Restore' : 'Archive'} flag in ${environment.name}?`
                : `Change gate · ${environment.name}`
          }
          action={
            confirm === 'lifecycle'
              ? 'Save lifecycle change'
              : confirm === 'archive'
                ? flag.archived
                  ? 'Restore flag'
                  : 'Archive flag'
                : flag.enabled
                  ? 'Turn gate Off'
                  : 'Turn gate On'
          }
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await mutate(
              confirm === 'lifecycle'
                ? { lifecycle }
                : confirm === 'archive'
                  ? { archived: !flag.archived }
                  : { enabled: !flag.enabled }
            );
          }}
        >
          <p>
            <strong>{flag.name}</strong> · {environment.name} only · Expected r{flag.revision}
          </p>
          {confirm === 'lifecycle' ? (
            <>
              <p>Lifecycle is classification, not activation or publication.</p>
              <label>
                Proposed lifecycle
                <select
                  className="input"
                  value={lifecycle}
                  onChange={(event) => setLifecycle(event.target.value as Flag['lifecycle'])}
                >
                  {Object.entries(lifecycleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {lifecycleLabels[flag.lifecycle]} → {lifecycleLabels[lifecycle]}. Gate, audience and
                values stay unchanged.
              </p>
            </>
          ) : (
            <p>
              {confirm === 'archive'
                ? 'Archiving returns the configured off value locally and preserves configuration and history.'
                : `The gate changes to ${flag.enabled ? 'Off' : 'On'}. Saved audience, lifecycle and values stay unchanged; no targeting draft is published.`}
            </p>
          )}
          <p>No other environment changes. The action is recorded in Audit trail.</p>
        </Confirm>
      )}
      {discarding && (
        <Modal
          title="Discard audience draft?"
          onClose={() => {
            setDiscarding(false);
            pending.current = null;
          }}
        >
          <div className="fd-form">
            <p>Published behavior is unchanged. Discard this draft before continuing?</p>
            <div className="fd-actions">
              <Button
                onClick={() => {
                  setDiscarding(false);
                  pending.current = null;
                }}
              >
                Stay
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const next = pending.current;
                  pending.current = null;
                  setDiscarding(false);
                  setDirty(false);
                  setEditorVersion((value) => value + 1);
                  next?.();
                }}
              >
                Discard and continue
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
