import { useEffect, useState, type FormEvent } from 'react';

import { Badge, Button, Empty, Notice, PageHeader } from '@onebrief/atlas-ui';

import {
  createFlagSchema,
  flagSchema,
  flagsSchema,
  type FlagSummary,
  type Project,
  type Role,
} from '../shared/contracts.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { useDraftNavigation } from './draft-context.ts';
import { FlagForm, Modal } from './forms.tsx';

interface Props {
  request: Request;
  scope: string;
  project: Project;
  role: Role;
  active: boolean;
  onOpen: (key: string, environmentId?: string) => void;
  onCreated: (key: string) => void;
}

export function Inventory({ request, scope, project, role, active, onOpen, onCreated }: Props) {
  const { confirmTransition } = useDraftNavigation();
  const [items, setItems] = useState<FlagSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const after = cursors.at(-1);
  const projectId = project.id;
  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '20', search, archived: 'active' });
    if (after) query.set('after', after);
    get(request, `/api/v1/projects/${encodeURIComponent(projectId)}/flags?${query}`, flagsSchema)
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
  }, [request, projectId, after, search, version, active]);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setCursors([]);
    setSearch(draftSearch.trim());
  }
  return (
    <>
      <section className="fd-poc-list" aria-label="Flags">
        <PageHeader
          title="Flags"
          actions={
            role !== 'viewer' && (
              <Button variant="primary" disabled={!scope} onClick={() => setCreating(true)}>
                Create flag
              </Button>
            )
          }
        />
        {error && (
          <Notice tone="danger">
            {error} <Button onClick={() => setVersion((value) => value + 1)}>Try again</Button>
          </Notice>
        )}
        <div className="fd-poc-card">
          <form className="fd-inventory-toolbar" role="search" onSubmit={submitSearch}>
            <label className="fd-search-label">
              Search flags
              <input
                className="input"
                type="search"
                value={draftSearch}
                maxLength={100}
                placeholder="Search by name or key"
                onChange={(event) => setDraftSearch(event.target.value)}
              />
            </label>
            <Button type="submit">Search</Button>
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
            <Empty>
              Flags could not be loaded. Try again to retrieve the current configuration.
            </Empty>
          ) : items.length === 0 ? (
            <Empty>
              <div className="fd-empty">
                <h2>{search ? 'No matching flags' : 'No flags yet'}</h2>
                <p>
                  {search
                    ? 'Try another name or key.'
                    : 'Create a flag to control availability in each environment.'}
                </p>
                {role !== 'viewer' && !search && scope && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Create your first flag
                  </Button>
                )}
              </div>
            </Empty>
          ) : (
            <div className="fd-table-wrap">
              <table className="fd-table">
                <caption className="fd-sr-only">
                  {project.name} shared feature flags and environment gates
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Flag</th>
                    {project.environments.map((environment) => (
                      <th key={environment.id} scope="col">
                        {environment.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((flag) => (
                    <tr key={flag.id}>
                      <td>
                        <button
                          type="button"
                          className="fd-flag-link"
                          aria-label={`Open ${flag.name} overview`}
                          onClick={() => onOpen(flag.key)}
                        >
                          {flag.name}
                        </button>
                        {flag.description && (
                          <span className="fd-table-sub">{flag.description}</span>
                        )}
                      </td>
                      {project.environments.map((environment) => {
                        const configuration = flag.environments.find(
                          (item) => item.environmentId === environment.id
                        );
                        const status = !configuration
                          ? 'Unavailable'
                          : flag.archived
                            ? 'Archived'
                            : configuration.enabled
                              ? 'On'
                              : 'Off';
                        return (
                          <td key={environment.id}>
                            <Button
                              variant="quiet"
                              size="sm"
                              disabled={!configuration}
                              aria-label={`Open ${flag.name} in ${environment.name}: ${status}`}
                              onClick={() => onOpen(flag.key, environment.id)}
                            >
                              <Badge
                                tone={
                                  !configuration || flag.archived
                                    ? 'warning'
                                    : configuration.enabled
                                      ? 'success'
                                      : 'secondary'
                                }
                              >
                                {status}
                              </Badge>
                            </Button>
                            {flag.archived && configuration && (
                              <span className="fd-table-sub">
                                Saved gate: {configuration.enabled ? 'On' : 'Off'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fd-pagination">
            <span>Page {cursors.length + 1}</span>
            <div className="fd-actions">
              <Button
                disabled={loading || cursors.length === 0}
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
        </div>
      </section>
      {creating && (
        <Modal
          title="Create flag"
          onClose={() => {
            if (!busy) confirmTransition(() => setCreating(false));
          }}
        >
          <FlagForm
            busy={busy}
            onCancel={() => setCreating(false)}
            onSave={async (input) => {
              setBusy(true);
              try {
                const flag = await send(
                  request,
                  `${scope}/flags`,
                  'POST',
                  createFlagSchema.parse(input),
                  flagSchema
                );
                setCreating(false);
                setVersion((value) => value + 1);
                onCreated(flag.key);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}
