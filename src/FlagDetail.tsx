import { useEffect, useState } from 'react';

import {
  AsideSection,
  Badge,
  Block,
  Button,
  Empty,
  FeedPage,
  Notice,
  Notices,
  PageHeader,
  Properties,
  ViewBar,
} from '@onebrief/atlas-ui';

import {
  activitySchema,
  evaluationSchema,
  flagSchema,
  type AuditEntry,
  type Evaluation,
  type Flag,
  type Project,
  type Role,
} from '../shared/contracts.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { ConfigurationEditor } from './ConfigurationEditor.tsx';
import { Decision } from './Decision.tsx';
import { Confirm, FlagForm, Modal } from './forms.tsx';
import { Overrides } from './Overrides.tsx';

interface Props {
  request: Request;
  scope: string;
  flagKey: string;
  project: Project;
  environmentId: string;
  role: Role;
  onBack: () => void;
}

export function FlagDetail({
  request,
  scope,
  flagKey,
  project,
  environmentId,
  role,
  onBack,
}: Props) {
  const [flag, setFlag] = useState<Flag | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<'configuration' | 'overrides' | 'activity'>('configuration');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<'toggle' | 'archive' | null>(null);
  const writable = role !== 'viewer';
  const environment = project.environments.find((item) => item.id === environmentId)!;
  const path = `${scope}/flags/${encodeURIComponent(flagKey)}`;
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    Promise.all([
      get(request, path, flagSchema),
      send(
        request,
        `${scope}/evaluate/${encodeURIComponent(flagKey)}`,
        'POST',
        { context: { attributes: {} } },
        evaluationSchema
      ),
      get(request, `${path}/activity?limit=20`, activitySchema),
    ])
      .then(([nextFlag, decision, entries]) => {
        if (!current) return;
        setFlag(nextFlag);
        setEvaluation(decision);
        setActivity(entries.items);
        setNextCursor(entries.nextCursor);
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
  }, [request, path, scope, flagKey, version]);

  async function mutate(changes: Record<string, unknown>) {
    if (!flag) return;
    setBusy(true);
    try {
      await send(
        request,
        path,
        'PATCH',
        { expectedRevision: flag.revision, ...changes },
        flagSchema
      );
      setVersion((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function loadMore() {
    setMoreBusy(true);
    setError('');
    try {
      const result = await get(
        request,
        `${path}/activity?limit=20&before=${encodeURIComponent(nextCursor!)}`,
        activitySchema
      );
      setActivity((previous) => [
        ...previous,
        ...result.items.filter((item) => !previous.some((old) => old.id === item.id)),
      ]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMoreBusy(false);
    }
  }
  const reload = (
    <Button
      onClick={() => {
        setEdit(false);
        setConfirm(null);
        setVersion((value) => value + 1);
      }}
    >
      Reload latest version
    </Button>
  );
  if (loading || !flag || !evaluation)
    return (
      <div className="fd-loading" aria-live="polite">
        <Button onClick={onBack}>Back to flags</Button>
        {loading ? (
          <p>Loading configuration and decision…</p>
        ) : (
          <>
            <Notice tone="danger">{error}</Notice>
            {reload}
          </>
        )}
      </div>
    );
  return (
    <>
      <FeedPage
        header={
          <PageHeader
            title={flag.name}
            badges={
              <Badge tone={flag.archived ? 'warning' : flag.enabled ? 'success' : 'secondary'}>
                {flag.archived ? 'Archived' : flag.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            }
            crumbs={[`Project · ${project.name}`, `Configuration · ${environment.name}`]}
            meta={<code>{flag.key}</code>}
            actions={
              <>
                <Button onClick={onBack}>Back to flags</Button>
                {writable && <Button onClick={() => setEdit(true)}>Edit metadata</Button>}
                {reload}
              </>
            }
          />
        }
        notices={
          <Notices>
            {error && <Notice tone="danger">{error}</Notice>}
            {role === 'viewer' && (
              <Notice tone="primary">
                Viewer access · Configuration and activity are read-only. You may simulate
                decisions.
              </Notice>
            )}
            {flag.archived && (
              <Notice>
                Archived in every environment · Evaluation returns the configured typed off value
                with enabled:false and reason archived. Restoring preserves environment
                configuration.
              </Notice>
            )}
          </Notices>
        }
        viewBar={
          <ViewBar
            tabs={[
              { id: 'configuration', label: 'Targeting' },
              { id: 'overrides', label: 'Exceptions (advanced)' },
              { id: 'activity', label: 'Activity' },
            ]}
            value={tab}
            onChange={setTab}
          />
        }
        main={
          <>
            <div className="fd-configuration-panel" hidden={tab !== 'configuration'}>
              <Block name="content" label="Feature availability" icon="flag">
                <div className="fd-config-state">
                  <div>
                    <h2>{environment.name}</h2>
                    <p>Master switch · Targeting applies only while this environment is On.</p>
                  </div>
                  <Badge tone={flag.enabled && !flag.archived ? 'success' : 'secondary'}>
                    {flag.archived ? 'Archived · evaluates off' : flag.enabled ? 'On' : 'Off'}
                  </Badge>
                </div>
                {writable && (
                  <div className="fd-actions">
                    <Button
                      variant="primary"
                      disabled={busy || flag.archived}
                      onClick={() => setConfirm('toggle')}
                    >
                      {flag.enabled ? 'Disable' : 'Enable'} in {environment.name}
                    </Button>
                  </div>
                )}
              </Block>
              <ConfigurationEditor
                key={flag.revision}
                request={request}
                scope={scope}
                path={path}
                flag={flag}
                writable={writable}
                projectName={project.name}
                environmentName={environment.name}
                onChanged={(next) => {
                  setFlag(next);
                  setVersion((value) => value + 1);
                }}
              />
              <Block name="content" label="Lifecycle" icon="flag">
                <details>
                  <summary>Archive or restore this flag</summary>
                  <p>
                    Archiving applies to every environment. The immutable key and audit history
                    remain available.
                  </p>
                  <div className="fd-actions">
                    {writable && (
                      <Button disabled={busy} onClick={() => setConfirm('archive')}>
                        {flag.archived ? 'Restore flag' : 'Archive flag'}
                      </Button>
                    )}
                  </div>
                </details>
              </Block>
            </div>
            {tab === 'overrides' ? (
              <Overrides
                request={request}
                path={path}
                flag={flag}
                writable={writable}
                environmentName={environment.name}
                onChanged={(next) => {
                  setFlag(next);
                  setVersion((value) => value + 1);
                }}
              />
            ) : tab === 'activity' ? (
              <Block name="content" label="Activity history" icon="clock">
                <p className="fd-help">
                  Project-wide history · Each change identifies its environment and verified local
                  actor.
                </p>
                {activity.length === 0 ? (
                  <Empty>No activity has been recorded.</Empty>
                ) : (
                  <ol className="fd-activity">
                    {activity.map((entry) => (
                      <li key={entry.id}>
                        <div className="fd-activity-head">
                          <strong>{entry.actorName}</strong>
                          <Badge>{entry.action}</Badge>
                          <code>r{entry.revision}</code>
                        </div>
                        <p>
                          {project.environments.find((item) => item.id === entry.environmentId)
                            ?.name ?? entry.environmentId}{' '}
                          · <time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time>
                        </p>
                        <details>
                          <summary>Configuration change · {entry.actorId}</summary>
                          <div className="fd-change-grid">
                            <div>
                              <h3>Before</h3>
                              <pre>{JSON.stringify(entry.previous, null, 2)}</pre>
                            </div>
                            <div>
                              <h3>After</h3>
                              <pre>{JSON.stringify(entry.next, null, 2)}</pre>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
                {nextCursor && (
                  <Button onClick={() => void loadMore()} disabled={moreBusy}>
                    {moreBusy ? 'Loading…' : 'Load older activity'}
                  </Button>
                )}
              </Block>
            ) : null}
          </>
        }
        aside={
          <>
            <AsideSection name="people" title="Flag information" icon="flag">
              <Properties
                items={[
                  ['Key', <code>{flag.key}</code>],
                  ['Owner', flag.owner],
                  ['Project', project.name],
                  ['Version', flag.revision],
                  ['Updated', dateTime(flag.updatedAt)],
                ]}
              />
              <p className="fd-help">{flag.description || 'No description'}</p>
              <p className="fd-help">Metadata is shared across project environments.</p>
            </AsideSection>
            <AsideSection name="status" title="Advanced diagnostics" icon="eye">
              <details>
                <summary>Inspect the empty-context decision</summary>
                <Decision decision={evaluation} title="Current published decision" />
                <p className="fd-help">
                  Technical baseline only, not a BC user simulation. Use Advanced controls to supply
                  evaluation context and inspect the trace.
                </p>
              </details>
            </AsideSection>
          </>
        }
      />
      {edit && (
        <Modal
          title="Edit flag metadata"
          onClose={() => {
            if (!busy) setEdit(false);
          }}
        >
          <FlagForm
            flag={flag}
            busy={busy}
            onCancel={() => setEdit(false)}
            onSave={async ({ name, description, owner }) => {
              await mutate({ name, description, owner });
              setEdit(false);
            }}
          />
        </Modal>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === 'archive'
              ? flag.archived
                ? 'Restore flag?'
                : 'Archive flag?'
              : `${flag.enabled ? 'Disable' : 'Enable'} this environment?`
          }
          action={
            confirm === 'archive'
              ? flag.archived
                ? 'Restore flag'
                : 'Archive flag'
              : flag.enabled
                ? 'Disable flag'
                : 'Enable flag'
          }
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await mutate(
              confirm === 'archive' ? { archived: !flag.archived } : { enabled: !flag.enabled }
            );
          }}
        >
          <p>
            <strong>{flag.name}</strong> · <code>{flag.key}</code> · Version {flag.revision}
          </p>
          <p>
            {confirm === 'archive'
              ? `This changes the lifecycle in all ${project.environments.length} project environments. ${flag.archived ? 'Saved environment configurations become effective again.' : 'Every evaluation returns its typed off value with enabled:false and reason archived.'}`
              : `Only ${environment.name} changes to ${flag.enabled ? 'disabled' : 'enabled'}. Other environments retain their state.`}
          </p>
          {confirm === 'toggle' && environment.key === 'production' && (
            <Notice>
              Production simulation · Local disposable data only. Confirm this scoped change
              deliberately; this is not a production approval workflow.
            </Notice>
          )}
        </Confirm>
      )}
    </>
  );
}
