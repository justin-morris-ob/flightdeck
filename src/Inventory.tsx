import { useEffect, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  CollectionPage,
  Empty,
  Notice,
  Notices,
  PageHeader,
  ViewBar,
} from '@onebrief/atlas-ui';

import {
  createFlagSchema,
  flagSchema,
  flagsSchema,
  type Flag,
  type Project,
  type Role,
} from '../shared/contracts.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { FlagForm, Modal } from './forms.tsx';
import { ValueDisplay } from './TargetingForms.tsx';

interface Props {
  request: Request;
  scope: string;
  project: Project;
  environmentId: string;
  role: Role;
  onOpen: (key: string) => void;
}

export function Inventory({ request, scope, project, environmentId, role, onOpen }: Props) {
  const [items, setItems] = useState<Flag[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState<'active' | 'archived' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const after = cursors.at(-1);
  const environment = project.environments.find((item) => item.id === environmentId)!;
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '20', search, archived });
    if (after) query.set('after', after);
    get(request, `${scope}/flags?${query}`, flagsSchema)
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
  }, [request, scope, after, search, archived, version]);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setCursors([]);
    setSearch(draftSearch.trim());
  }
  return (
    <>
      <CollectionPage
        title="Feature flags"
        icon="flag"
        header={
          <PageHeader
            title="Feature flags"
            crumbs={[project.name, environment.name]}
            meta="Typed configuration and targeting · Environment-scoped decisions"
            actions={
              <>
                <Button onClick={() => setVersion((value) => value + 1)}>Refresh</Button>
                {role !== 'viewer' && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Create flag
                  </Button>
                )}
              </>
            }
          />
        }
        notices={
          <Notices>
            {role === 'viewer' && (
              <Notice tone="primary">
                Viewer access · You can inspect flags, decisions and activity. Changes require an
                editor.
              </Notice>
            )}
            {error && (
              <Notice tone="danger">
                {error} <Button onClick={() => setVersion((value) => value + 1)}>Try again</Button>
              </Notice>
            )}
          </Notices>
        }
        viewBar={
          <ViewBar
            tabs={[
              { id: 'active', label: 'Active flags' },
              { id: 'archived', label: 'Archived' },
              { id: 'all', label: 'All flags' },
            ]}
            value={archived}
            onChange={(value) => {
              setCursors([]);
              setArchived(value);
            }}
          />
        }
      >
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
          <Empty>Flags could not be loaded. Try again to retrieve the current configuration.</Empty>
        ) : items.length === 0 ? (
          <Empty>
            <div className="fd-empty">
              <h2>
                {search
                  ? 'No matching flags'
                  : archived === 'archived'
                    ? 'No archived flags'
                    : 'No flags yet'}
              </h2>
              <p>
                {search
                  ? 'Try another name or key, or clear the search.'
                  : archived === 'archived'
                    ? 'Archived flags retain their keys and activity here.'
                    : 'Create a flag with boolean defaults, then configure typed outcomes, targeting and assignment per environment.'}
              </p>
              {role !== 'viewer' && !search && archived !== 'archived' && (
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
                {project.name} feature flags in {environment.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Environment gate</th>
                  <th scope="col">Flag / key</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Configuration</th>
                  <th scope="col">Revision</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((flag) => (
                  <tr key={flag.id}>
                    <td>
                      <Badge
                        tone={flag.archived ? 'warning' : flag.enabled ? 'success' : 'secondary'}
                      >
                        {flag.archived ? 'Archived' : flag.enabled ? 'On' : 'Off'}
                      </Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="fd-flag-link"
                        onClick={() => onOpen(flag.key)}
                      >
                        {flag.name}
                      </button>
                      <code className="fd-table-sub">{flag.key}</code>
                    </td>
                    <td>{flag.owner}</td>
                    <td>
                      <span className="fd-table-sub">
                        Off: <ValueDisplay value={flag.configuration.offValue} />
                      </span>
                      <span className="fd-table-sub">
                        Default:{' '}
                        {flag.configuration.defaultOutcome.kind === 'value' ? (
                          <ValueDisplay value={flag.configuration.defaultOutcome.value} />
                        ) : flag.configuration.defaultOutcome.kind === 'variant' ? (
                          `Variant ${flag.configuration.defaultOutcome.variantId}`
                        ) : (
                          'Weighted variants'
                        )}
                      </span>
                      <span className="fd-table-sub">
                        {flag.configuration.rules.length} rules · Catalog r
                        {flag.configuration.catalogRevision}
                      </span>
                    </td>
                    <td>
                      <code>r{flag.revision}</code>
                    </td>
                    <td>
                      <time dateTime={flag.updatedAt}>{dateTime(flag.updatedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fd-pagination">
          <span>
            {loading ? 'Fetching page' : `${items.length} flags on this page`} · Page{' '}
            {cursors.length + 1} · 20 per page
          </span>
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
      </CollectionPage>
      {creating && (
        <Modal
          title="Create feature flag"
          onClose={() => {
            if (!busy) setCreating(false);
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
                onOpen(flag.key);
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
