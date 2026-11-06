import './styles.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { Badge, Button, Empty, Notice } from '@onebrief/atlas-ui';
import { AppShell, ContextBar, Header, Icon, MenuItem, MenuSection, Rail } from '@onebrief/ux-kit';

import {
  operatorSchema,
  projectsSchema,
  scopePath,
  sessionSchema,
  type Project,
} from '../shared/contracts.ts';
import { deploymentSchema, type Deployment } from '../shared/unified.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { AuditTrail } from './AuditTrail.tsx';
import { EnvironmentSettings } from './EnvironmentSettings.tsx';
import { FlagDetail } from './FlagDetail.tsx';
import { Modal } from './forms.tsx';
import { Inventory } from './Inventory.tsx';
import { Segments } from './Segments.tsx';

type View = 'flags' | 'segments' | 'audit' | 'settings';
type Session = z.infer<typeof sessionSchema>;
type Operator = z.infer<typeof operatorSchema>;
interface Props {
  request: Request;
  embedded?: boolean;
  initialProjectId?: string;
  initialView?: View;
}

export function FlightdeckApp({
  request,
  embedded = false,
  initialProjectId,
  initialView = 'flags',
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [observedEnvironmentId, setObservedEnvironmentId] = useState('');
  const [flagKey, setFlagKey] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<string | undefined>();
  const [auditFilter, setAuditFilter] = useState<{
    objectType?: 'flag' | 'segment';
    objectId?: string;
  }>({});
  const [view, setView] = useState<View>(initialView);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bootstrap, setBootstrap] = useState(0);
  const [account, setAccount] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [createFlag, setCreateFlag] = useState(0);
  const [createSegment, setCreateSegment] = useState(0);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const reportDirty = useCallback((value: boolean) => setDirty(value), []);
  const reportBusy = useCallback((value: boolean) => setNavigationBusy(value), []);
  useEffect(() => {
    if (!dirty && !navigationBusy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, navigationBusy]);
  function transition(action: () => void) {
    if (navigationBusy) return;
    if (dirty) {
      pendingNavigation.current = action;
      setLeaving(true);
    } else action();
  }
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    Promise.all([
      get(request, '/api/v1/dev/session', z.object({ session: sessionSchema.nullable() })),
      get(request, '/api/v1/dev/operators', z.object({ items: z.array(operatorSchema) })),
    ])
      .then(([result, available]) => {
        if (current) {
          setSession(result.session);
          setOperators(available.items);
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
  }, [request, bootstrap]);
  useEffect(() => {
    if (!session) return;
    let current = true;
    setScopeLoading(true);
    setError('');
    Promise.all([
      get(request, '/api/v1/projects', projectsSchema),
      get(request, '/api/v1/deployment', deploymentSchema),
    ])
      .then(([result, binding]) => {
        if (!current) return;
        setProjects(result.items);
        setDeployment(binding);
        setProjectId((previous) =>
          result.items.some((item) => item.id === previous) ? previous : (result.items[0]?.id ?? '')
        );
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setScopeLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, session]);
  const project = projects.find((item) => item.id === projectId);
  const master = deployment?.mode === 'master';
  const environment = master
    ? (project?.environments.find((item) => item.id === observedEnvironmentId) ??
      project?.environments[0])
    : project?.environments.find((item) => item.key === deployment?.environmentKey);
  const scope = project && environment ? scopePath(project.id, environment.id) : '';
  const writable =
    deployment?.mode === 'local' && session !== null && session.operator.role !== 'viewer';
  async function login(operatorId: string) {
    setBusy(true);
    setError('');
    try {
      const next = await send(
        request,
        '/api/v1/dev/session',
        'POST',
        { operatorId },
        sessionSchema
      );
      setProjects([]);
      setDeployment(null);
      setFlagKey(null);
      setSegmentId(undefined);
      setAuditFilter({});
      setObservedEnvironmentId('');
      setDirty(false);
      setSession(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await request('/api/v1/session', { method: 'DELETE', credentials: 'include' });
      setSession(null);
      setProjects([]);
      setDeployment(null);
      setFlagKey(null);
      setView('flags');
      setDirty(false);
      setAccount(false);
      setLeaving(false);
      pendingNavigation.current = null;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: View) {
    transition(() => {
      setFlagKey(null);
      setSegmentId(undefined);
      setAuditFilter({});
      setCreateFlag(0);
      setCreateSegment(0);
      setView(next);
    });
  }
  function openFlag(key: string, environmentId = environment?.id ?? '') {
    transition(() => {
      setFlagKey(key);
      setObservedEnvironmentId(environmentId);
      setCreateFlag(0);
      setCreateSegment(0);
      setView('flags');
    });
  }
  function openAudit(objectType: 'flag' | 'segment', objectId: string) {
    transition(() => {
      setAuditFilter({ objectType, objectId });
      setCreateFlag(0);
      setCreateSegment(0);
      setView('audit');
    });
  }
  const appMenu = (
    <nav className="fd-project-menu" aria-label="Flightdeck menu">
      <MenuSection kind="shared" className="fd-menu-heading">
        <h2 className="fd-menu-title">Flightdeck</h2>
        {session && writable && (
          <div className="fd-actions fd-menu-quick-actions">
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                transition(() => {
                  setView('flags');
                  setFlagKey(null);
                  setCreateFlag((value) => value + 1);
                })
              }
            >
              Create flag
            </Button>
            <Button
              size="sm"
              onClick={() =>
                transition(() => {
                  setView('segments');
                  setSegmentId(undefined);
                  setCreateSegment((value) => value + 1);
                })
              }
            >
              Create segment
            </Button>
          </div>
        )}
      </MenuSection>
      <div className="fd-project-menu-scroll">
        <MenuSection title="Views" kind="app">
          <MenuItem
            label="Flags"
            icon="flag"
            current={view === 'flags'}
            onSelect={() => navigate('flags')}
          />
          <MenuItem
            label="Segments"
            icon="users"
            current={view === 'segments'}
            onSelect={() => navigate('segments')}
          />
          <MenuItem
            label="Audit trail"
            icon="clock"
            current={view === 'audit'}
            onSelect={() => navigate('audit')}
          />
        </MenuSection>
      </div>
      {!master && session?.operator.role === 'administrator' && (
        <div className="fd-menu-footer">
          <MenuItem
            label="Flightdeck settings"
            icon="sliders"
            current={view === 'settings'}
            onSelect={() => navigate('settings')}
          />
        </div>
      )}
    </nav>
  );
  const content = (
    <div className="fd-app" data-embedded={embedded || undefined}>
      <div className="fd-dev-banner">
        <Icon name="flag" size="sm" />
        <strong>LOCAL DEVELOPMENT</strong>
        <span>Disposable identities · Not production authentication</span>
      </div>
      {loading ? (
        <div className="fd-loading" role="status">
          Loading Flightdeck…
        </div>
      ) : !session ? (
        <main className="fd-signin">
          <div className="fd-signin-mark">
            <Icon name="flag" />
          </div>
          <p className="fd-eyebrow">ENABLEMENTS & EXPERIMENTS</p>
          <h1>Welcome to Flightdeck</h1>
          <p className="fd-signin-intro">Control the feature. Make the audience clear.</p>
          <section className="fd-signin-card">
            <h2>Local development sign-in</h2>
            <p>Select a disposable operator. Atlas sign-in does not grant Flightdeck access.</p>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="fd-operators">
              {operators.map((operator) => (
                <button
                  className="fd-operator"
                  type="button"
                  key={operator.id}
                  onClick={() => void login(operator.id)}
                  disabled={busy}
                >
                  <span>
                    <strong>{operator.name}</strong>
                    <span className="fd-table-sub">{operator.role}</span>
                  </span>
                  <Icon name="chevR" size="sm" />
                </button>
              ))}
            </div>
            {!operators.length && (
              <Button onClick={() => setBootstrap((value) => value + 1)}>Retry connection</Button>
            )}
          </section>
        </main>
      ) : (
        <>
          <div className="fd-scope-bar">
            <div className="fd-scope-fields">
              <label>
                Project
                <select
                  className="input"
                  value={projectId}
                  disabled={scopeLoading}
                  onChange={(event) => {
                    const id = event.target.value;
                    transition(() => {
                      setProjectId(id);
                      setObservedEnvironmentId('');
                      setFlagKey(null);
                      setSegmentId(undefined);
                      setAuditFilter({});
                    });
                  }}
                >
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="fd-session">
              <Badge>
                {master
                  ? 'Master overview · Read only'
                  : `Environment · ${environment?.name ?? deployment?.environmentName ?? 'Unbound'}`}
              </Badge>
              <span>Local data</span>
              <Button size="sm" onClick={() => setAccount(true)}>
                Local account
              </Button>
            </div>
          </div>
          <nav className="fd-section-nav" aria-label="Flightdeck sections">
            {(['flags', 'segments', 'audit'] as const).map((item) => (
              <Button
                key={item}
                variant={view === item ? 'primary' : 'quiet'}
                onClick={() => navigate(item)}
              >
                {item === 'flags' ? 'Flags' : item === 'segments' ? 'Segments' : 'Audit trail'}
              </Button>
            ))}
            {writable && (
              <>
                <Button
                  onClick={() =>
                    transition(() => {
                      setView('flags');
                      setFlagKey(null);
                      setCreateFlag((value) => value + 1);
                    })
                  }
                >
                  Create flag
                </Button>
                <Button
                  onClick={() =>
                    transition(() => {
                      setView('segments');
                      setSegmentId(undefined);
                      setCreateSegment((value) => value + 1);
                    })
                  }
                >
                  Create segment
                </Button>
              </>
            )}
            {!master && session.operator.role === 'administrator' && (
              <Button onClick={() => navigate('settings')}>Flightdeck settings</Button>
            )}
          </nav>
          {error && (
            <div className="fd-inline-error">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
          {scopeLoading ? (
            <div className="fd-loading" role="status">
              Loading authorized scope…
            </div>
          ) : !deployment ? (
            <div className="fd-loading">
              <Notice tone="danger">
                Deployment configuration could not be loaded. Editing is unavailable.
              </Notice>
              <Button onClick={() => setBootstrap((value) => value + 1)}>Retry</Button>
            </div>
          ) : !project || !environment ? (
            <Empty>
              This project has no environment matching this deployment. No fallback environment has
              been selected.
            </Empty>
          ) : (
            <>
              {master && (view !== 'flags' || flagKey) && (
                <div className="fd-report-context">
                  <label>
                    Viewing environment report
                    <select
                      className="input"
                      value={environment.id}
                      onChange={(event) => {
                        setObservedEnvironmentId(event.target.value);
                      }}
                    >
                      {project.environments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>Read only · Changes belong in the local dashboard.</span>
                  {deployment.dashboards[environment.key] && (
                    <a
                      className="fd-flag-link"
                      href={deployment.dashboards[environment.key]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {environment.name} dashboard ↗
                    </a>
                  )}
                </div>
              )}
              {view === 'segments' ? (
                <Segments
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  environmentName={environment.name}
                  writable={writable}
                  onAudit={(id) => openAudit('segment', id)}
                  onOpenFlag={openFlag}
                  onDirtyChange={reportDirty}
                  onBusyChange={reportBusy}
                  createRequest={createSegment}
                  initialSegmentId={segmentId}
                />
              ) : view === 'audit' ? (
                <AuditTrail
                  key={`${scope}:${session.operator.id}:${auditFilter.objectId ?? ''}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  environmentName={environment.name}
                  {...auditFilter}
                  onOpenObject={(type, id) => {
                    if (type === 'flag') openFlag(id);
                    else
                      transition(() => {
                        setView('segments');
                        setSegmentId(id);
                      });
                  }}
                />
              ) : view === 'settings' && !master && session.operator.role === 'administrator' ? (
                <EnvironmentSettings
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  environmentName={environment.name}
                  onDirtyChange={reportDirty}
                />
              ) : flagKey ? (
                <FlagDetail
                  key={`${scope}:${flagKey}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  flagKey={flagKey}
                  project={project}
                  environmentId={environment.id}
                  role={master ? 'viewer' : session.operator.role}
                  onBack={() => transition(() => setFlagKey(null))}
                  onAudit={(id) => openAudit('flag', id)}
                  onDirtyChange={reportDirty}
                  master={master}
                />
              ) : (
                <Inventory
                  key={`${project.id}:${session.operator.id}:${master}`}
                  request={request}
                  scope={scope}
                  project={project}
                  environmentId={environment.id}
                  role={master ? 'viewer' : session.operator.role}
                  onOpen={(key, selectedEnvironmentId) => {
                    setDirty(false);
                    setFlagKey(key);
                    setObservedEnvironmentId(selectedEnvironmentId);
                    setCreateFlag(0);
                    setCreateSegment(0);
                  }}
                  master={master}
                  createRequest={createFlag}
                  onDirtyChange={reportDirty}
                  onBusyChange={reportBusy}
                />
              )}
            </>
          )}
        </>
      )}
      {account && session && (
        <Modal title="Local development account" onClose={() => setAccount(false)}>
          <div className="fd-form">
            <p>
              <strong>{session.operator.name}</strong> · {session.operator.role}
            </p>
            <p>Application-local identity only. Signing out clears all unsaved work.</p>
            <div className="fd-actions">
              <Button onClick={() => setAccount(false)}>Close</Button>
              <Button variant="primary" disabled={busy} onClick={() => void logout()}>
                Sign out of Flightdeck
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {leaving && (
        <Modal
          title="Discard unpublished changes?"
          onClose={() => {
            setLeaving(false);
            pendingNavigation.current = null;
          }}
        >
          <div className="fd-form">
            <p>
              Your unsaved changes belong to this scope. Leaving will discard them; published
              behavior stays unchanged.
            </p>
            <div className="fd-actions">
              <Button
                onClick={() => {
                  setLeaving(false);
                  pendingNavigation.current = null;
                }}
              >
                Stay
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const next = pendingNavigation.current;
                  pendingNavigation.current = null;
                  setLeaving(false);
                  setDirty(false);
                  next?.();
                }}
              >
                Discard and leave
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
  if (embedded) return content;
  return (
    <div className="ob-root fd-standalone" data-theme={theme}>
      <AppShell
        size="desktop"
        menu={session ? 'docked' : 'hidden'}
        header={
          <Header
            currentLabel="Flightdeck"
            canGoBack={false}
            canGoForward={false}
            userName={session?.operator.name ?? 'Local development'}
            onAccount={() => {
              if (session) setAccount(true);
            }}
            utilities={
              <Button
                size="sm"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
                icon={<Icon name={theme === 'dark' ? 'sun' : 'moon'} size="sm" />}
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            }
          />
        }
        rail={
          <Rail
            items={[
              {
                id: 'flags',
                label: 'Flags',
                shortLabel: 'Flags',
                icon: 'flag',
                tone: 'atom',
                appId: 'flightdeck',
                appName: 'Flightdeck',
              },
            ]}
            currentId="flags"
            onSelect={() => navigate('flags')}
          />
        }
        appMenu={session && appMenu}
        contextBar={
          session && (
            <ContextBar
              scope={project?.name ?? 'No project'}
              time={
                view === 'flags'
                  ? 'Feature flags'
                  : view === 'segments'
                    ? 'Segments'
                    : view === 'audit'
                      ? 'Audit trail'
                      : 'Settings'
              }
            />
          )
        }
      >
        {content}
      </AppShell>
    </div>
  );
}
