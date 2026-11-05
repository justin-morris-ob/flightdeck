import './styles.css';

import { useEffect, useState } from 'react';
import { z } from 'zod';

import { Badge, Button, Empty, Notice } from '@onebrief/atlas-ui';
import { AppMenu, AppShell, ContextBar, Header, Icon, Rail, type App } from '@onebrief/ux-kit';

import {
  operatorSchema,
  projectsSchema,
  scopePath,
  sessionSchema,
  type Project,
} from '../shared/contracts.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { Catalog } from './Catalog.tsx';
import { Credentials } from './Credentials.tsx';
import { FlagDetail } from './FlagDetail.tsx';
import { Modal } from './forms.tsx';
import { Inventory } from './Inventory.tsx';

type Session = z.infer<typeof sessionSchema>;
type Operator = z.infer<typeof operatorSchema>;
interface Props {
  request: Request;
  embedded?: boolean;
  initialProjectId?: string;
}

export function FlightdeckApp({ request, embedded = false, initialProjectId }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [environmentId, setEnvironmentId] = useState('');
  const [flagKey, setFlagKey] = useState<string | null>(null);
  const [view, setView] = useState<'flags' | 'credentials' | 'catalog'>('flags');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scopeError, setScopeError] = useState('');
  const [bootstrap, setBootstrap] = useState(0);
  const [account, setAccount] = useState(false);
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
    setScopeError('');
    get(request, '/api/v1/projects', projectsSchema)
      .then((result) => {
        if (!current) return;
        setProjects(result.items);
        setProjectId((previous) =>
          result.items.some((item) => item.id === previous) ? previous : (result.items[0]?.id ?? '')
        );
      })
      .catch((cause: unknown) => {
        if (current) setScopeError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setScopeLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, session]);
  const project = projects.find((item) => item.id === projectId);
  const environment =
    project?.environments.find((item) => item.id === environmentId) ?? project?.environments[0];
  const scope = project && environment ? scopePath(project.id, environment.id) : '';
  const role = session?.operator.role;
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
      setProjectId('');
      setEnvironmentId('');
      setFlagKey(null);
      setView('flags');
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
      setProjectId('');
      setEnvironmentId('');
      setFlagKey(null);
      setView('flags');
      setAccount(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function navigate(id: string) {
    setFlagKey(null);
    if (id === 'credentials' && role === 'administrator') setView('credentials');
    else if (id === 'catalog') setView('catalog');
    else {
      setView('flags');
      if (projects.some((item) => item.id === id)) {
        setProjectId(id);
        setEnvironmentId('');
      }
    }
  }
  const appMenu: App = {
    id: 'flightdeck',
    name: 'Flightdeck',
    short: 'Flags',
    tone: 'atom',
    icon: 'flag',
    quickActions: [],
    pinned: [],
    views: [
      { id: 'flags', label: 'Feature flags', icon: 'flag' },
      { id: 'catalog', label: 'Project targeting catalog', icon: 'sliders' },
      ...(role === 'administrator'
        ? [{ id: 'credentials', label: 'Evaluation credentials', icon: 'approval' as const }]
        : []),
    ],
    collections: projects.map((item) => ({ id: item.id, label: item.name, icon: 'collection' })),
  };
  const banner = (
    <div className="fd-dev-banner">
      <Icon name="flag" size="sm" />
      <strong>LOCAL DEVELOPMENT</strong>
      <span>Disposable identities and synthetic data only · Not production authentication</span>
    </div>
  );
  const content = (
    <div className="fd-app" data-embedded={embedded || undefined}>
      {banner}
      {loading ? (
        <div className="fd-loading" role="status">
          Loading local development session…
        </div>
      ) : !session ? (
        <main className="fd-signin">
          <div className="fd-signin-mark">
            <Icon name="flag" />
          </div>
          <p className="fd-eyebrow">ENABLEMENTS & EXPERIMENTS</p>
          <h1>Welcome to Flightdeck</h1>
          <p className="fd-signin-intro">
            Control typed configuration and targeting, inspect decisions, and trace every change.
          </p>
          <section className="fd-signin-card">
            <h2>Local development sign-in</h2>
            <p>
              Select a disposable operator to explore role-based access. These are not real
              organizational identities.{' '}
              {embedded && 'Your Atlas demo sign-in does not grant Flightdeck access.'}
            </p>
            {error && <Notice tone="danger">{error}</Notice>}
            {operators.length === 0 ? (
              <>
                <p>
                  Local sign-in is unavailable. Start the service with explicit local development
                  identity enabled.
                </p>
                <Button onClick={() => setBootstrap((value) => value + 1)}>Retry connection</Button>
              </>
            ) : (
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
                      <span className="fd-table-sub">
                        {operator.id === 'local-outsider'
                          ? 'Isolation test organization'
                          : 'Flightdeck development'}
                      </span>
                    </span>
                    <Badge>{operator.role}</Badge>
                    <Icon name="chevR" size="sm" />
                  </button>
                ))}
              </div>
            )}
            <p className="fd-help">
              Signed HttpOnly local session · Authorization is enforced by the API, independently of
              the shell.
            </p>
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
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setEnvironmentId('');
                    setFlagKey(null);
                  }}
                  disabled={scopeLoading}
                >
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Environment
                <select
                  className="input"
                  value={environment?.id ?? ''}
                  onChange={(event) => {
                    setEnvironmentId(event.target.value);
                  }}
                  disabled={scopeLoading}
                >
                  {project?.environments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="fd-session">
              <span>{session.operator.name}</span>
              <Badge>{role}</Badge>
              <Button size="sm" onClick={() => setAccount(true)}>
                Local account
              </Button>
            </div>
          </div>
          {error && (
            <div className="fd-inline-error">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
          {scopeLoading ? (
            <div className="fd-loading" role="status">
              Loading authorized projects…
            </div>
          ) : scopeError ? (
            <div className="fd-loading">
              <Notice tone="danger">{scopeError}</Notice>
              <Button onClick={() => setBootstrap((value) => value + 1)}>
                Reload session and projects
              </Button>
            </div>
          ) : !project || !environment ? (
            <Empty>No authorized project environments are available.</Empty>
          ) : (
            <>
              <nav className="fd-section-nav" aria-label="Flightdeck sections">
                <Button
                  variant={view === 'flags' ? 'primary' : 'quiet'}
                  onClick={() => navigate('flags')}
                >
                  Feature flags
                </Button>
                <Button
                  variant={view === 'catalog' ? 'primary' : 'quiet'}
                  onClick={() => navigate('catalog')}
                >
                  Project targeting catalog
                </Button>
                {role === 'administrator' && (
                  <Button
                    variant={view === 'credentials' ? 'primary' : 'quiet'}
                    onClick={() => navigate('credentials')}
                  >
                    Evaluation credentials
                  </Button>
                )}
              </nav>
              {view === 'catalog' ? (
                <Catalog
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  role={session.operator.role}
                />
              ) : view === 'credentials' && role === 'administrator' ? (
                <Credentials
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  environmentName={environment.name}
                />
              ) : flagKey ? (
                <FlagDetail
                  key={`${scope}:${flagKey}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  flagKey={flagKey}
                  project={project}
                  environmentId={environment.id}
                  role={session.operator.role}
                  onBack={() => setFlagKey(null)}
                />
              ) : (
                <Inventory
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  project={project}
                  environmentId={environment.id}
                  role={session.operator.role}
                  onOpen={setFlagKey}
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
            <p>Application-local identity only. Signing out here does not sign you out of Atlas.</p>
            <p className="fd-help">
              To change roles, sign out and select another disposable operator.
            </p>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="fd-actions">
              <Button onClick={() => setAccount(false)}>Close</Button>
              <Button variant="primary" onClick={() => void logout()} disabled={busy}>
                {busy ? 'Signing out…' : 'Sign out of Flightdeck'}
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
              <>
                <strong>Flightdeck</strong>
                <Button
                  size="sm"
                  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                  onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
                  icon={<Icon name={theme === 'dark' ? 'sun' : 'moon'} size="sm" />}
                >
                  {theme === 'dark' ? 'Light' : 'Dark'}
                </Button>
              </>
            }
          />
        }
        rail={
          <Rail
            items={[
              {
                id: 'flags',
                label: 'Feature flags',
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
        appMenu={
          session && (
            <AppMenu
              app={appMenu}
              presentation="docked"
              currentPlaceId={view}
              onNavigate={navigate}
            />
          )
        }
        contextBar={
          session && (
            <ContextBar
              scope={project?.name ?? 'No project'}
              time="Live configuration"
              phase={environment?.name}
            />
          )
        }
      >
        {content}
      </AppShell>
    </div>
  );
}
