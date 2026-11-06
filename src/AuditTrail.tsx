import './AuditTrail.css';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

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

import { auditTrailSchema, type AuditEvent } from '../shared/unified.ts';
import { errorMessage, get, type Request } from './api.ts';

interface Props {
  request: Request;
  scope: string;
  projectName: string;
  environmentName: string;
  objectType?: 'flag' | 'segment';
  objectId?: string;
  onOpenObject?: (type: 'flag' | 'segment', keyOrId: string) => void;
}

interface Filters {
  search: string;
  objectType: '' | 'flag' | 'segment';
  actor: string;
  action: string;
  since: string;
  until: string;
}

const PAGE_SIZE = 20;
const compactTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

function label(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function utc(value: string): string {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function compactUtc(value: string): string {
  return `${compactTime.format(new Date(value)).replace(',', ' ·')} UTC`;
}

function isSnapshot(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function RecordedValue({ value, present }: { value: unknown; present: boolean }) {
  if (!present) return <span className="fd-audit-muted">Not recorded</span>;
  return <pre className="fd-audit-value">{JSON.stringify(value, null, 2)}</pre>;
}

function BeforeAfter({ event }: { event: AuditEvent }) {
  const previous = isSnapshot(event.previous) ? event.previous : null;
  const next = isSnapshot(event.next) ? event.next : null;
  const comparable = (previous !== null || event.previous === null) && next !== null;
  const fields = comparable
    ? [...new Set([...Object.keys(previous ?? {}), ...Object.keys(next)])]
    : [];
  return (
    <section className="fd-audit-section" aria-label="Recorded before and after">
      <h3>Before &amp; after</h3>
      <p className="fd-audit-muted">
        Exact recorded values at this event, not current configuration.
      </p>
      <div className="fd-table-wrap">
        <table className="fd-table fd-audit-diff">
          <caption className="fd-sr-only">
            Recorded before and after values for event {event.id}
          </caption>
          <thead>
            <tr>
              <th scope="col">Recorded field</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {fields.length ? (
              fields.map((field) => (
                <tr key={field}>
                  <th scope="row">
                    <code>{field}</code>
                  </th>
                  <td>
                    <RecordedValue
                      value={previous?.[field]}
                      present={Boolean(previous && Object.hasOwn(previous, field))}
                    />
                  </td>
                  <td>
                    <RecordedValue
                      value={next?.[field]}
                      present={Boolean(next && Object.hasOwn(next, field))}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <th scope="row">Snapshot</th>
                <td>
                  <RecordedValue value={event.previous} present={event.previous !== null} />
                </td>
                <td>
                  <RecordedValue value={event.next} present />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <details className="fd-audit-raw">
        <summary>Full recorded snapshots</summary>
        <h4>Before</h4>
        <RecordedValue value={event.previous} present />
        <h4>After</h4>
        <RecordedValue value={event.next} present />
      </details>
    </section>
  );
}

function EventDetail({
  id,
  event,
  environmentName,
  onOpenObject,
  onClose,
}: {
  id: string;
  event: AuditEvent;
  environmentName: string;
  onOpenObject: Props['onOpenObject'];
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [event.id]);
  return (
    <article id={id} className="fd-audit-detail" aria-label={`Recorded event ${event.id}`}>
      <section className="fd-audit-section" aria-label="Recorded event summary">
        <div className="fd-audit-detail-head">
          <div>
            <Badge>Read-only history</Badge>
            <p className="fd-audit-muted">
              Recorded event · <code>{event.id}</code>
            </p>
            <h2 ref={heading} tabIndex={-1}>
              {label(event.action)}
            </h2>
            <p>
              <strong>{event.objectName}</strong> · {label(event.objectType)} ·{' '}
              <code>{event.objectKey}</code>
            </p>
          </div>
          <Button size="sm" onClick={onClose}>
            Close event
          </Button>
        </div>
        <dl className="fd-audit-properties">
          <div>
            <dt>Actor</dt>
            <dd>
              {event.actorName}
              <code>{event.actorId}</code>
            </dd>
          </div>
          <div>
            <dt>Occurred · UTC</dt>
            <dd>
              <time dateTime={event.createdAt}>{utc(event.createdAt)}</time>
            </dd>
          </div>
          <div>
            <dt>Recorded request environment</dt>
            <dd>
              {environmentName}
              <code>{event.environmentId}</code>
            </dd>
          </div>
          <div>
            <dt>Object identity</dt>
            <dd>
              <code>{event.objectId}</code>
            </dd>
          </div>
          <div>
            <dt>Recorded action</dt>
            <dd>
              <code>{event.action}</code>
            </dd>
          </div>
        </dl>
      </section>
      <BeforeAfter event={event} />
      {event.affectedReferences !== undefined && (
        <section className="fd-audit-section" aria-label="Recorded affected references">
          <h3>Affected published references · At this event</h3>
          {event.affectedReferences.length ? (
            <div className="fd-table-wrap">
              <table className="fd-table">
                <caption className="fd-sr-only">
                  Published flag references recorded in event {event.id}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Flag</th>
                    <th scope="col">Recorded gate</th>
                    <th scope="col">Recorded revision</th>
                  </tr>
                </thead>
                <tbody>
                  {event.affectedReferences.map((reference) => (
                    <tr key={reference.flagId}>
                      <td>
                        {onOpenObject ? (
                          <button
                            type="button"
                            className="fd-flag-link"
                            onClick={() => onOpenObject('flag', reference.flagKey)}
                          >
                            {reference.flagName}
                          </button>
                        ) : (
                          reference.flagName
                        )}
                        <code className="fd-table-sub">{reference.flagKey}</code>
                      </td>
                      <td>
                        {reference.archived ? (
                          <>
                            <Badge tone="warning">Archived · Forces off</Badge>
                            <span className="fd-table-sub">
                              Saved gate: {reference.enabled ? 'On' : 'Off'}
                            </span>
                          </>
                        ) : (
                          <Badge tone={reference.enabled ? 'success' : 'secondary'}>
                            {reference.enabled ? 'On' : 'Off'}
                          </Badge>
                        )}
                      </td>
                      <td>r{reference.revision}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No affected published references were recorded in this event.</p>
          )}
          <p className="fd-audit-muted">
            This is the recorded reference set and gate state, not present-day usage or evidence of
            SDK delivery.
          </p>
        </section>
      )}
      <footer className="fd-audit-section" aria-label="Historical snapshot boundary">
        <Notice>
          Historical snapshot only. Imported legacy metadata events may have applied project-wide;
          the recorded request environment is not proof of environment-only impact. Snapshots are
          preserved unchanged, without current-state reinterpretation. History cannot edit, restore,
          or publish configuration.
        </Notice>
        {onOpenObject && (
          <Button
            onClick={() =>
              onOpenObject(
                event.objectType,
                event.objectType === 'flag' ? event.objectKey : event.objectId
              )
            }
          >
            Open {event.objectType}
          </Button>
        )}
      </footer>
    </article>
  );
}

export function AuditTrail(props: Props) {
  return (
    <AuditHistory
      key={JSON.stringify([props.scope, props.objectType, props.objectId])}
      {...props}
    />
  );
}

function AuditHistory({
  request,
  scope,
  projectName,
  environmentName,
  objectType,
  objectId,
  onOpenObject,
}: Props) {
  const initial: Filters = {
    search: '',
    objectType: objectType ?? '',
    actor: '',
    action: '',
    since: '',
    until: '',
  };
  const historyId = useId();
  const [draft, setDraft] = useState<Filters>(initial);
  const [filters, setFilters] = useState<Filters>(initial);
  const [cursors, setCursors] = useState<string[]>([]);
  const [page, setPage] = useState<{ items: AuditEvent[]; nextCursor: string | null }>({
    items: [],
    nextCursor: null,
  });
  const [loadedQuery, setLoadedQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [version, setVersion] = useState(0);
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.search) params.set('search', filters.search);
  if (filters.objectType) params.set('objectType', filters.objectType);
  if (objectId) params.set('objectId', objectId);
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.action) params.set('action', filters.action);
  if (filters.since) params.set('since', `${filters.since}T00:00:00.000Z`);
  if (filters.until) params.set('until', `${filters.until}T23:59:59.999Z`);
  const cursor = cursors.at(-1);
  if (cursor) params.set('before', cursor);
  const query = `${scope}/audit?${params.toString()}`;
  const currentPage = loadedQuery === query;
  const selected = currentPage ? page.items.find((event) => event.id === selectedId) : undefined;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setSelectedId(null);
    get(request, query, auditTrailSchema)
      .then((result) => {
        if (!current) return;
        setPage(result);
        setLoadedQuery(query);
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
  }, [request, query, version]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.since && draft.until && draft.since > draft.until) {
      setValidation('The start date must be on or before the end date. Dates use UTC.');
      return;
    }
    setValidation('');
    setFilters({
      ...draft,
      search: draft.search.trim(),
      actor: draft.actor.trim(),
      action: draft.action.trim(),
    });
    setCursors([]);
    setSelectedId(null);
  }

  function reset() {
    setDraft(initial);
    setFilters(initial);
    setCursors([]);
    setSelectedId(null);
    setValidation('');
  }

  function closeEvent() {
    const eventId = selectedId;
    setSelectedId(null);
    requestAnimationFrame(() => {
      document.getElementById(`${historyId}-${eventId}`)?.focus();
    });
  }

  return (
    <CollectionPage
      title="Change history"
      header={
        <PageHeader
          title="Audit trail"
          crumbs={[projectName]}
          meta={`${environmentName} · History by recorded request scope`}
          badges={<Badge>Read only</Badge>}
          actions={
            <Button disabled={loading} onClick={() => setVersion((value) => value + 1)}>
              Refresh history
            </Button>
          }
        />
      }
      notices={
        <Notices>
          <Notice>
            Configuration history, not evaluation telemetry. Timestamps are UTC. Environment
            identifies recorded request scope; imported legacy metadata events may have applied
            project-wide. Before/after snapshots are preserved unchanged.
          </Notice>
          {error && (
            <Notice tone="danger">
              {error}{' '}
              <Button size="sm" onClick={() => setVersion((value) => value + 1)}>
                Retry history
              </Button>
            </Notice>
          )}
          {validation && <Notice tone="danger">{validation}</Notice>}
        </Notices>
      }
      viewBar={
        <ViewBar
          tabs={[{ id: 'history', label: 'Change history' }]}
          value="history"
          onChange={() => {
            setCursors([]);
            setSelectedId(null);
            setVersion((value) => value + 1);
          }}
          end={<Badge>{environmentName}</Badge>}
        />
      }
    >
      <form
        className="fd-audit-filters"
        role="search"
        aria-label="Filter audit history"
        onSubmit={apply}
      >
        <label className="fd-search-label fd-audit-search">
          Search history
          <input
            className="input"
            type="search"
            maxLength={100}
            value={draft.search}
            placeholder="Object, actor, action, or event ID"
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          />
        </label>
        <label>
          Object
          <select
            className="input"
            value={draft.objectType}
            disabled={Boolean(objectId)}
            onChange={(event) =>
              setDraft({ ...draft, objectType: event.target.value as Filters['objectType'] })
            }
          >
            <option value="">All objects</option>
            <option value="flag">Flags</option>
            <option value="segment">Segments</option>
          </select>
        </label>
        <label>
          Actor
          <input
            className="input"
            maxLength={100}
            value={draft.actor}
            placeholder="Actor name or ID"
            onChange={(event) => setDraft({ ...draft, actor: event.target.value })}
          />
        </label>
        <label>
          Action
          <input
            className="input"
            maxLength={100}
            value={draft.action}
            placeholder="Recorded action"
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
          />
        </label>
        <label>
          From · UTC
          <input
            className="input"
            type="date"
            value={draft.since}
            onChange={(event) => setDraft({ ...draft, since: event.target.value })}
          />
        </label>
        <label>
          Through · UTC
          <input
            className="input"
            type="date"
            value={draft.until}
            onChange={(event) => setDraft({ ...draft, until: event.target.value })}
          />
        </label>
        <div className="fd-audit-filter-actions">
          <Button type="submit">Apply filters</Button>
          <Button onClick={reset}>Reset filters</Button>
        </div>
      </form>
      {objectId && (
        <p className="fd-audit-muted">
          Filtered to {objectType ?? 'object'} · <code>{objectId}</code>
        </p>
      )}
      {loading || (!currentPage && !error) ? (
        <div className="fd-table-loading" role="status">
          Loading recorded history…
        </div>
      ) : error ? (
        <Empty>History could not be loaded. Retry to view recorded events.</Empty>
      ) : (
        <div className={selected ? 'fd-audit-layout fd-audit-layout-detail' : 'fd-audit-layout'}>
          <section aria-label="Audit event results">
            {!page.items.length ? (
              <Empty>No recorded events match these filters in {environmentName}.</Empty>
            ) : selected ? (
              <ul className="fd-audit-compact-events" aria-label="Compact audit events">
                {page.items.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      id={`${historyId}-${event.id}`}
                      data-audit-event-id={event.id}
                      className="fd-audit-compact-event"
                      aria-label={`Open ${label(event.action)}: ${event.objectName} · ${utc(event.createdAt)}`}
                      aria-current={selectedId === event.id ? 'true' : undefined}
                      aria-expanded={selectedId === event.id}
                      aria-controls={`${historyId}-detail`}
                      onClick={() => setSelectedId(event.id)}
                    >
                      <time dateTime={event.createdAt} title={utc(event.createdAt)}>
                        {compactUtc(event.createdAt)}
                      </time>
                      <strong>{label(event.action)}</strong>
                      <span
                        className="fd-audit-compact-object"
                        title={`${label(event.objectType)} · ${event.objectName} · ${event.objectKey}`}
                      >
                        {label(event.objectType)} · {event.objectName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="fd-table-wrap">
                <table className="fd-table fd-audit-events">
                  <caption className="fd-sr-only">
                    {projectName} · {environmentName} audit events · UTC
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Time · UTC</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Object</th>
                      <th scope="col">Action</th>
                      <th scope="col">Recorded request scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <time dateTime={event.createdAt}>{utc(event.createdAt)}</time>
                        </td>
                        <td>
                          {event.actorName}
                          <code className="fd-table-sub">{event.actorId}</code>
                        </td>
                        <td>
                          <strong>{event.objectName}</strong>
                          <span className="fd-table-sub">
                            {label(event.objectType)} · <code>{event.objectKey}</code>
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="fd-flag-link fd-audit-event-open"
                            id={`${historyId}-${event.id}`}
                            data-audit-event-id={event.id}
                            aria-label={`Open ${label(event.action)}: ${event.objectName} · ${utc(event.createdAt)}`}
                            aria-expanded={selectedId === event.id}
                            onClick={() => setSelectedId(event.id)}
                          >
                            {label(event.action)}
                          </button>
                          <code className="fd-table-sub">{event.id}</code>
                        </td>
                        <td>
                          {environmentName}
                          <code className="fd-table-sub">{event.environmentId}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="fd-audit-pagination" aria-label="History pagination">
              <span>
                Page {cursors.length + 1} · {page.items.length} recorded{' '}
                {page.items.length === 1 ? 'event' : 'events'}
              </span>
              <div>
                <Button
                  disabled={!cursors.length}
                  onClick={() => {
                    setCursors((previous) => previous.slice(0, -1));
                    setSelectedId(null);
                  }}
                >
                  Newer events
                </Button>
                <Button
                  disabled={!page.nextCursor}
                  onClick={() => {
                    if (page.nextCursor) setCursors((previous) => [...previous, page.nextCursor!]);
                    setSelectedId(null);
                  }}
                >
                  Older events
                </Button>
              </div>
            </div>
          </section>
          {selected && (
            <EventDetail
              id={`${historyId}-detail`}
              event={selected}
              environmentName={environmentName}
              onOpenObject={onOpenObject}
              onClose={closeEvent}
            />
          )}
        </div>
      )}
    </CollectionPage>
  );
}
