import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  CollectionPage,
  Empty,
  Notice,
  PageHeader,
  ViewBar,
} from '@onebrief/atlas-ui';
import { Icon } from '@onebrief/ux-kit';

import {
  createFlagSchema,
  flagSchema,
  flagsSchema,
  type FlagSummary,
  type Project,
  type Role,
} from '../shared/contracts.ts';
import { lifecycleSchema, type Lifecycle } from '../shared/unified.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { Confirm, FlagForm } from './forms.tsx';
import { lifecycleDescription, lifecycleLabels } from './lifecycle.ts';

interface Props {
  request: Request;
  scope: string;
  project: Project;
  environmentId: string;
  role: Role;
  onOpen: (key: string, environmentId: string) => void;
  master?: boolean;
  createRequest?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function Inventory({
  request,
  scope,
  project,
  environmentId,
  role,
  onOpen,
  master = false,
  createRequest = 0,
  onDirtyChange,
  onBusyChange,
}: Props) {
  const [items, setItems] = useState<FlagSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState<'active' | 'archived' | 'all'>('active');
  const [lifecycle, setLifecycle] = useState('all');
  const [longevity, setLongevity] = useState('all');
  const [grouped, setGrouped] = useState(true);
  const [collapsedLifecycles, setCollapsedLifecycles] = useState<Set<Lifecycle>>(() => new Set());
  const inventoryId = useId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const after = cursors.at(-1);
  const environment = project.environments.find((item) => item.id === environmentId);
  useEffect(() => {
    if (createRequest > 0 && role !== 'viewer' && !master) {
      setCreating(true);
      setDirty(false);
    }
  }, [createRequest, role, master]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '20', search, archived });
    if (after) query.set('after', after);
    if (lifecycle !== 'all') query.set('lifecycle', lifecycle);
    if (!master && longevity !== 'all') query.set('longevity', longevity);
    const path = master
      ? `/api/v1/projects/${encodeURIComponent(project.id)}/flags`
      : `${scope}/flags`;
    get(request, `${path}?${query}`, flagsSchema)
      .then((result) => {
        if (current) {
          setItems(result.items);
          setNextCursor(result.nextCursor);
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
  }, [request, scope, project.id, after, search, archived, lifecycle, longevity, master, version]);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setCursors([]);
    setSearch(draftSearch.trim());
  }
  function closeCreation() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else setCreating(false);
  }
  if (creating && role !== 'viewer' && !master) {
    return (
      <section className="fd-creation-screen">
        <PageHeader
          title="Create flag"
          meta={`${project.name} · ${environment?.name} · New flag`}
          actions={
            <Button onClick={closeCreation} disabled={busy}>
              Back to flags
            </Button>
          }
        />
        <div className="fd-creation-card">
          <Notice tone="primary">
            Starts Off in {environment?.name} only. No other environment is created or changed.
          </Notice>
          <FlagForm
            key={createRequest}
            busy={busy}
            environmentName={environment?.name}
            onDirtyChange={setDirty}
            onCancel={closeCreation}
            onSave={async (input) => {
              setBusy(true);
              try {
                const created = await send(
                  request,
                  `${scope}/flags`,
                  'POST',
                  createFlagSchema.parse(input),
                  flagSchema
                );
                if (!mounted.current) return;
                setDirty(false);
                setCreating(false);
                onOpen(created.key, created.environmentId);
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          />
        </div>
        {discard && (
          <Confirm
            title="Discard unsaved flag?"
            action="Discard changes"
            onClose={() => setDiscard(false)}
            onConfirm={async () => {
              setDirty(false);
              setCreating(false);
              setDiscard(false);
            }}
          >
            <p>
              This flag has not been created. Only your unsaved browser edits will be discarded.
            </p>
          </Confirm>
        )}
      </section>
    );
  }
  const groups: { lifecycle: Lifecycle | null; flags: FlagSummary[] }[] =
    !master && grouped
      ? lifecycleSchema.options
          .map((value) => ({
            lifecycle: value,
            flags: items.filter(
              (flag) =>
                (flag.environments.find((item) => item.environmentId === environmentId)
                  ?.lifecycle ?? 'development') === value
            ),
          }))
          .filter((group) => group.flags.length > 0)
      : [{ lifecycle: null, flags: items }];
  return (
    <>
      <CollectionPage
        title="Flags"
        icon="flag"
        header={
          <PageHeader
            title="Feature flags"
            crumbs={[project.name]}
            meta={
              master
                ? 'Master overview · Reported configuration · Read only'
                : `${environment?.name} · Local dashboard · Organize by lifecycle`
            }
            actions={<Button onClick={() => setVersion((value) => value + 1)}>Refresh</Button>}
          />
        }
        viewBar={
          !master && (
            <ViewBar
              tabs={[
                { id: 'all', label: 'All flags' },
                ...Object.entries(lifecycleLabels).map(([id, label]) => ({ id, label })),
              ]}
              value={lifecycle}
              onChange={(value) => {
                setCursors([]);
                setLifecycle(value);
                setCollapsedLifecycles(
                  (previous) => new Set([...previous].filter((item) => item !== value))
                );
              }}
            />
          )
        }
      >
        {error && <Notice tone="danger">{error}</Notice>}
        <form className="fd-inventory-toolbar" role="search" onSubmit={submitSearch}>
          <label className="fd-search-label">
            Search flags
            <input
              className="input"
              type="search"
              value={draftSearch}
              maxLength={100}
              placeholder="Search flags by name or key"
              onChange={(event) => setDraftSearch(event.target.value)}
            />
          </label>
          <Button type="submit">Search</Button>
          {master && (
            <label>
              Reported lifecycle
              <select
                className="input"
                value={lifecycle}
                onChange={(event) => {
                  setLifecycle(event.target.value);
                  setCursors([]);
                }}
              >
                <option value="all">Any reported</option>
                {Object.entries(lifecycleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!master && (
            <>
              <label>
                Longevity
                <select
                  className="input"
                  value={longevity}
                  onChange={(event) => {
                    setLongevity(event.target.value);
                    setCursors([]);
                  }}
                >
                  <option value="all">All</option>
                  <option value="temporary">Temporary</option>
                  <option value="long-lived">Long-lived</option>
                </select>
              </label>
              <label>
                Group by
                <select
                  className="input"
                  value={grouped ? 'lifecycle' : 'none'}
                  onChange={(event) => setGrouped(event.target.value === 'lifecycle')}
                >
                  <option value="lifecycle">Lifecycle</option>
                  <option value="none">None</option>
                </select>
              </label>
            </>
          )}
          <label>
            Flag state
            <select
              className="input"
              value={archived}
              onChange={(event) => {
                setArchived(event.target.value as typeof archived);
                setCursors([]);
              }}
            >
              <option value="active">Active flags</option>
              <option value="archived">Archived flags</option>
              <option value="all">All flags</option>
            </select>
          </label>
          {search && (
            <Button
              onClick={() => {
                setDraftSearch('');
                setSearch('');
                setCursors([]);
              }}
            >
              Clear search
            </Button>
          )}
        </form>
        {loading ? (
          <div className="fd-table-loading" role="status">
            Loading flags…
          </div>
        ) : error ? (
          <Empty>Flags could not be loaded. Refresh to retry.</Empty>
        ) : !items.length ? (
          <Empty>
            <div className="fd-empty">
              <h2>No matching flags</h2>
              <p>Try another search or lifecycle filter.</p>
              {role !== 'viewer' && !master && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create flag
                </Button>
              )}
            </div>
          </Empty>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table fd-unified-inventory">
              <caption className="fd-sr-only">
                {project.name} · {master ? 'Reported environments' : environment?.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Flag / owner</th>
                  {master ? (
                    project.environments.map((item) => (
                      <th scope="col" key={item.id}>
                        {item.name}
                      </th>
                    ))
                  ) : (
                    <>
                      <th scope="col">Gate</th>
                      <th scope="col">Audience / behavior</th>
                      <th scope="col">Type</th>
                    </>
                  )}
                </tr>
              </thead>
              {groups.map((group) => {
                const groupLifecycle = group.lifecycle;
                const collapsed =
                  groupLifecycle !== null && collapsedLifecycles.has(groupLifecycle);
                return (
                  <tbody key={groupLifecycle ?? 'ungrouped'}>
                    {groupLifecycle !== null && (
                      <tr className="fd-inventory-lifecycle-heading">
                        <th scope="rowgroup" colSpan={4}>
                          <Button
                            type="button"
                            variant="quiet"
                            className="fd-lifecycle-toggle"
                            aria-label={lifecycleLabels[groupLifecycle]}
                            aria-expanded={!collapsed}
                            aria-controls={group.flags
                              .map((flag) => `${inventoryId}-${flag.id}`)
                              .join(' ')}
                            aria-describedby={`${inventoryId}-${groupLifecycle}-description`}
                            onClick={() =>
                              setCollapsedLifecycles((previous) => {
                                const next = new Set(previous);
                                if (next.has(groupLifecycle)) next.delete(groupLifecycle);
                                else next.add(groupLifecycle);
                                return next;
                              })
                            }
                          >
                            <Icon name={collapsed ? 'chevR' : 'chevD'} size="sm" />
                            <span>{lifecycleLabels[groupLifecycle]}</span>
                            <span
                              id={`${inventoryId}-${groupLifecycle}-description`}
                              className="fd-lifecycle-description"
                            >
                              {lifecycleDescription[groupLifecycle]}
                            </span>
                          </Button>
                        </th>
                      </tr>
                    )}
                    {group.flags.map((flag) => {
                      const current = flag.environments.find(
                        (item) => item.environmentId === environmentId
                      );
                      return (
                        <tr key={flag.id} id={`${inventoryId}-${flag.id}`} hidden={collapsed}>
                          <td>
                            <button
                              type="button"
                              className="fd-flag-link"
                              onClick={() => onOpen(flag.key, environmentId)}
                            >
                              {current?.name ?? flag.name}
                            </button>
                            <code className="fd-table-sub">{flag.key}</code>
                            <span className="fd-table-sub">{current?.owner ?? flag.owner}</span>
                          </td>
                          {master ? (
                            project.environments.map((item) => {
                              const report = flag.environments.find(
                                (candidate) => candidate.environmentId === item.id
                              );
                              return (
                                <td key={item.id}>
                                  {report ? (
                                    <div className="fd-report-cell">
                                      <Badge>{lifecycleLabels[report.lifecycle]}</Badge>
                                      <Badge
                                        tone={
                                          report.archived
                                            ? 'warning'
                                            : report.enabled
                                              ? 'success'
                                              : 'secondary'
                                        }
                                      >
                                        {report.archived
                                          ? 'Archived'
                                          : report.enabled
                                            ? 'Gate On'
                                            : 'Gate Off'}
                                      </Badge>
                                      <span>{report.audienceSummary}</span>
                                      <span className="fd-table-sub">
                                        {report.configurationSummary}
                                      </span>
                                      <Button
                                        variant="quiet"
                                        size="sm"
                                        onClick={() => onOpen(flag.key, item.id)}
                                      >
                                        View {item.name} →
                                      </Button>
                                    </div>
                                  ) : (
                                    <Badge tone="warning">Unavailable</Badge>
                                  )}
                                </td>
                              );
                            })
                          ) : current ? (
                            <>
                              <td>
                                <Badge
                                  tone={
                                    current.archived
                                      ? 'warning'
                                      : current.enabled
                                        ? 'success'
                                        : 'secondary'
                                  }
                                >
                                  {current.archived
                                    ? 'Archived'
                                    : current.enabled
                                      ? 'Gate On'
                                      : 'Gate Off'}
                                </Badge>
                              </td>
                              <td>
                                <strong>{current.audienceSummary}</strong>
                                <span className="fd-table-sub">{current.configurationSummary}</span>
                              </td>
                              <td className="fd-value-type">{current.valueType}</td>
                            </>
                          ) : (
                            <td colSpan={3}>
                              <Badge tone="warning">Unavailable</Badge>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        <div className="fd-pagination">
          <span>
            {items.length} flags on this page · Page {cursors.length + 1}
          </span>
          <div className="fd-actions">
            <Button
              disabled={loading || !cursors.length}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              disabled={loading || !nextCursor || Boolean(error)}
              onClick={() => {
                if (nextCursor) setCursors((previous) => [...previous, nextCursor]);
              }}
            >
              Next
            </Button>
          </div>
        </div>
        <p className="fd-inventory-footnote">
          {master
            ? 'Compare reported state only. Open a local dashboard to make changes. Unavailable does not mean Off.'
            : 'Environment is supplied by this deployment. Gates control evaluation; they do not define audience membership.'}
        </p>
      </CollectionPage>
    </>
  );
}
