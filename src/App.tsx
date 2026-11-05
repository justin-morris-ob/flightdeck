import './styles.css';

import { useEffect, useState } from 'react';
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
import { errorMessage, get, send, type Request } from './api.ts';
import { Catalog } from './Catalog.tsx';
import { Credentials } from './Credentials.tsx';
import { useDraftNavigation } from './draft-context.ts';
import { DraftNavigationProvider } from './DraftNavigation.tsx';
import { FlagDetail } from './FlagDetail.tsx';
import { FlagOverview } from './FlagOverview.tsx';
import { Modal } from './forms.tsx';
import { Inventory } from './Inventory.tsx';
import { emptyLocation, type FlightdeckLocation, type LocationResult } from './navigation.ts';
import { useFlightdeckLocation } from './useFlightdeckLocation.ts';

type Session = z.infer<typeof sessionSchema>;
type Operator = z.infer<typeof operatorSchema>;
interface Props {
  request: Request;
  embedded?: boolean;
  visible?: boolean;
  initialLocation?: LocationResult;
  onNavigate?: (location: FlightdeckLocation) => void;
}

export function FlightdeckApp(props: Props) {
  return (
    <DraftNavigationProvider>
      <FlightdeckContent {...props} />
    </DraftNavigationProvider>
  );
}

function FlightdeckContent({
  request,
  embedded = false,
  visible = true,
  initialLocation,
  onNavigate,
}: Props) {
  const { cancelTransition } = useDraftNavigation();
  const {
    location,
    locationError,
    navigate: goTo,
    commit,
    initializeProject,
    reset,
    canGoBack,
    canGoForward,
  } = useFlightdeckLocation({ embedded, initialLocation, onNavigate });
  const { projectId, environmentId, flagKey, view } = location;
  const [session, setSession] = useState<Session | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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
        if (result.items[0]) initializeProject(result.items[0].id);
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
  }, [request, session, initializeProject]);
  const project = projects.find((item) => item.id === projectId);
  const environment = project?.environments.find((item) => item.id === environmentId);
  const scope = project && environment ? scopePath(project.id, environment.id) : '';
  const projectScope = project?.environments[0]
    ? scopePath(project.id, project.environments[0].id)
    : '';
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
      reset();
      cancelTransition();
      setAccount(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function navigate(id: string) {
    if (id === view && !flagKey) return;
    const nextView =
      id === 'credentials' && role === 'administrator'
        ? 'credentials'
        : id === 'catalog'
          ? 'catalog'
          : 'flags';
    goTo({
      ...emptyLocation,
      projectId,
      view: nextView,
      environmentId: nextView === 'credentials' ? (project?.environments[0]?.id ?? '') : '',
    });
  }
  const projectPicker = (
    <label className="fd-project-picker">
      Project
      <select
        className="input"
        value={projectId}
        disabled={scopeLoading}
        onChange={(event) => goTo({ ...emptyLocation, projectId: event.target.value })}
      >
        <option value="" disabled>
          Choose project
        </option>
        {projectId && !project && (
          <option value={projectId} disabled>
            Unavailable project
          </option>
        )}
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  const appMenu = (
    <nav className="fd-project-menu" aria-label="Flightdeck menu">
      <MenuSection kind="shared" className="fd-menu-heading">
        <h2 className="fd-menu-title">Flightdeck</h2>
      </MenuSection>
      <div className="fd-project-menu-scroll">
        <MenuSection title="Views" kind="app">
          <MenuItem
            label="Feature flags"
            icon="flag"
            current={view === 'flags'}
            onSelect={() => navigate('flags')}
          />
          <MenuItem
            label="Project targeting catalog"
            icon="sliders"
            current={view === 'catalog'}
            onSelect={() => navigate('catalog')}
          />
          {role === 'administrator' && (
            <MenuItem
              label="Evaluation credentials"
              icon="approval"
              current={view === 'credentials'}
              onSelect={() => navigate('credentials')}
            />
          )}
        </MenuSection>
      </div>
    </nav>
  );
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
                      <span className="fd-table-sub">Disposable local identity</span>
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
              <span className="fd-organization" aria-label="Administrative organization">
                <span className="fd-scope-label">Organization</span>
                <strong>{session.organization.name}</strong>
              </span>
              {projectPicker}
              {flagKey && environmentId && (
                <Button size="sm" onClick={() => goTo({ ...location, environmentId: '' })}>
                  Flag overview
                </Button>
              )}
              {(view === 'credentials' || (view === 'flags' && flagKey && environmentId)) && (
                <label>
                  Configuration environment
                  <select
                    className="input"
                    value={environmentId}
                    onChange={(event) => goTo({ ...location, environmentId: event.target.value })}
                    disabled={scopeLoading}
                  >
                    <option value="" disabled>
                      Choose environment
                    </option>
                    {project?.environments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
          ) : locationError ? (
            <Notice tone="danger">{locationError}</Notice>
          ) : !project ? (
            <Empty>
              {projectId
                ? 'Project is unavailable in this organization. Choose an authorized project.'
                : 'No authorized projects are available.'}
            </Empty>
          ) : view === 'credentials' && role !== 'administrator' ? (
            <Notice tone="danger">Evaluation credentials require administrator access.</Notice>
          ) : environmentId && !environment ? (
            <Notice tone="danger">
              Environment is unavailable in this project. Choose a valid environment or return to
              the flag overview.
            </Notice>
          ) : (
            <>
              {embedded && (
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
              )}
              {view === 'catalog' ? (
                <Catalog
                  key={`${project.id}:${session.operator.id}`}
                  request={request}
                  scope={projectScope}
                  projectName={project.name}
                  role={session.operator.role}
                />
              ) : view === 'credentials' && role === 'administrator' && environment ? (
                <Credentials
                  key={`${scope}:${session.operator.id}`}
                  request={request}
                  scope={scope}
                  projectName={project.name}
                  environmentName={environment.name}
                />
              ) : view === 'flags' ? (
                <>
                  <div className="fd-inventory-panel" hidden={Boolean(flagKey)}>
                    <Inventory
                      key={`${project.id}:${session.operator.id}`}
                      request={request}
                      scope={projectScope}
                      project={project}
                      role={session.operator.role}
                      active={visible && !flagKey}
                      onOpen={(key, selectedEnvironmentId) =>
                        goTo({
                          ...location,
                          flagKey: key,
                          environmentId: selectedEnvironmentId ?? '',
                        })
                      }
                      onCreated={(key) => commit({ ...location, flagKey: key, environmentId: '' })}
                    />
                  </div>
                  {flagKey && !environmentId && (
                    <FlagOverview
                      key={`${project.id}:${flagKey}:${session.operator.id}`}
                      request={request}
                      project={project}
                      flagKey={flagKey}
                      onBack={() => goTo({ ...location, flagKey: null })}
                      onOpenEnvironment={(id) => goTo({ ...location, environmentId: id })}
                    />
                  )}
                  {flagKey && environment && (
                    <FlagDetail
                      key={`${scope}:${flagKey}:${session.operator.id}`}
                      request={request}
                      scope={scope}
                      flagKey={flagKey}
                      project={project}
                      environmentId={environment.id}
                      role={session.operator.role}
                      onBack={() => goTo({ ...location, flagKey: null, environmentId: '' })}
                    />
                  )}
                </>
              ) : (
                <Empty>Choose an environment to inspect evaluation credentials.</Empty>
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
            <p>Organization · {session.organization.name}</p>
            <p>
              Application-local identity only. Signing out clears unpublished local edits; it does
              not sign you out of Atlas.
            </p>
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
            canGoBack={Boolean(session) && canGoBack}
            canGoForward={Boolean(session) && canGoForward}
            onBack={() => window.history.back()}
            onForward={() => window.history.forward()}
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
        appMenu={session && appMenu}
        contextBar={
          session && (
            <ContextBar
              scope={project?.name ?? 'No project'}
              time={
                view === 'catalog'
                  ? 'Targeting library'
                  : view === 'credentials'
                    ? 'Service credentials'
                    : flagKey
                      ? environmentId
                        ? `Configuration · ${environment?.name ?? 'Unavailable'}`
                        : 'Flag overview'
                      : 'Shared flag inventory'
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
