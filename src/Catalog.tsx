import type { Role } from '../shared/contracts.ts';

import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  Block,
  Button,
  CollectionPage,
  Empty,
  Notice,
  Notices,
  PageHeader,
} from '@onebrief/atlas-ui';

import {
  catalogActivitySchema,
  catalogSchema,
  catalogUpdateSchema,
  type AttributeDefinition,
  type Catalog as ProjectCatalog,
} from '../shared/targeting.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { DirectoryConnectionNotice, useDirectoryConnection } from './DirectoryPicker.tsx';
import { DirectorySegmentBuilder, DirectorySegmentSummary } from './DirectorySegmentBuilder.tsx';
import { Confirm } from './forms.tsx';
import { ConditionsEditor } from './TargetingForms.tsx';

interface Props {
  request: Request;
  scope: string;
  projectName: string;
  environmentName: string;
  role: Role;
}
type Draft = z.infer<typeof catalogUpdateSchema>['catalog'];
type Activity = z.infer<typeof catalogActivitySchema>;
type Removed =
  | { kind: 'attribute'; item: AttributeDefinition; index: number }
  | { kind: 'segment'; item: Draft['segments'][number]; index: number };
function input(catalog: ProjectCatalog): Draft {
  return {
    attributes: catalog.attributes,
    segments: catalog.segments.map(({ revision: _revision, ...segment }) => segment),
  };
}

export function Catalog(props: Props) {
  return <CatalogEditor key={props.scope} {...props} />;
}

function CatalogEditor({ request, scope, projectName, environmentName, role }: Props) {
  const directory = useDirectoryConnection(request, scope);
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [version, setVersion] = useState(0);
  const [discard, setDiscard] = useState<'reload' | 'reset' | null>(null);
  const [activity, setActivity] = useState<Activity>({ items: [], nextCursor: null });
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const readonly = role === 'viewer';
  const dirty = Boolean(
    catalog && draft && JSON.stringify(input(catalog)) !== JSON.stringify(draft)
  );

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    get(request, `${scope}/catalog`, catalogSchema)
      .then((result) => {
        if (!current) return;
        setCatalog(result);
        setDraft(input(result));
        setRemoved([]);
        setIssues([]);
        setSaved('');
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
  }, [request, scope, version]);

  useEffect(() => {
    let current = true;
    setActivityLoading(true);
    setActivityError('');
    const query = cursor ? `&before=${encodeURIComponent(cursor)}` : '';
    get(request, `${scope}/catalog/activity?limit=20${query}`, catalogActivitySchema)
      .then((result) => {
        if (current) setActivity(result);
      })
      .catch((cause: unknown) => {
        if (current) setActivityError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setActivityLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request, scope, cursor, activityVersion]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(next: Draft) {
    setDraft(next);
    setSaved('');
    setIssues([]);
  }
  function reload() {
    setVersion((value) => value + 1);
    setCursor(null);
    setActivityVersion((value) => value + 1);
  }
  function reset() {
    if (catalog) setDraft(input(catalog));
    setRemoved([]);
    setIssues([]);
    setSaved('');
    setError('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || !draft || readonly || busy) return;
    setError('');
    setSaved('');
    const parsed = catalogUpdateSchema.safeParse({
      expectedRevision: catalog.revision,
      catalog: draft,
    });
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((issue) => `${issue.path.join('.') || 'Catalog'}: ${issue.message}`)
      );
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      const result = await send(request, `${scope}/catalog`, 'PUT', parsed.data, catalogSchema);
      setCatalog(result);
      setDraft(input(result));
      setRemoved([]);
      setSaved(`Saved project catalog revision ${result.revision}. Running flags are unchanged.`);
      setCursor(null);
      setActivityVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function undo(index: number) {
    if (!draft) return;
    const removal = removed[index];
    if (!removal) return;
    if (removal.kind === 'attribute') {
      const attributes = [...draft.attributes];
      attributes.splice(removal.index, 0, removal.item);
      change({ ...draft, attributes });
    } else {
      const segments = [...draft.segments];
      segments.splice(removal.index, 0, removal.item);
      change({ ...draft, segments });
    }
    setRemoved(removed.filter((_, position) => position !== index));
  }

  return (
    <>
      <CollectionPage
        title="Project targeting catalog"
        icon="sliders"
        header={
          <PageHeader
            title="Project targeting catalog"
            crumbs={[projectName]}
            meta={
              catalog
                ? `Project-wide · Revision ${catalog.revision}${dirty ? ' · Unsaved changes' : ''}`
                : 'Project-wide'
            }
            actions={
              <Button
                disabled={loading || busy}
                onClick={() => (dirty ? setDiscard('reload') : reload())}
              >
                Reload latest
              </Button>
            }
          />
        }
        notices={
          <Notices>
            <Notice>
              Project-wide edits do not activate or change running flags. A future, explicit
              configuration publish in each environment pins the refreshed catalog and referenced
              segment revisions.
            </Notice>
            <Notice>
              BC directory authoring uses the selected environment: {environmentName}. Segment
              definitions and context attributes remain project-wide.
            </Notice>
            <DirectoryConnectionNotice status={directory.status} error={directory.error} />
            {directory.error && (
              <Button type="button" onClick={directory.reload}>
                Retry directory connection
              </Button>
            )}
            {readonly && <Notice>Viewer access · Catalog and activity are read-only.</Notice>}
            {error && <Notice tone="danger">{error}</Notice>}
            {saved && <Notice tone="primary">{saved}</Notice>}
          </Notices>
        }
      >
        {loading ? (
          <p role="status">Loading project catalog…</p>
        ) : !catalog || !draft ? (
          <Empty>Catalog unavailable. Reload to try again.</Empty>
        ) : (
          <form className="fd-form" onSubmit={save}>
            {issues.length > 0 && (
              <Notice tone="danger">
                <ul>
                  {issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <Block
              name="content"
              label={`Context attributes · ${draft.attributes.length}/32`}
              icon="sliders"
            >
              <p className="fd-help">
                Declare typed context keys used by segment and rule conditions. Reserved identity
                keys tenantId and subjectId cannot be declared.
              </p>
              {draft.attributes.length === 0 && <Empty>No context attributes defined.</Empty>}
              {draft.attributes.map((attribute, index) => (
                <fieldset className="fd-fieldset" key={index} disabled={readonly || busy}>
                  <legend>Attribute {index + 1}</legend>
                  <div className="fd-inline-fields">
                    <label>
                      Key
                      <input
                        className="input"
                        maxLength={64}
                        value={attribute.key}
                        onChange={(event) =>
                          change({
                            ...draft,
                            attributes: draft.attributes.map((item, position) =>
                              position === index ? { ...item, key: event.target.value } : item
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Type
                      <select
                        className="input"
                        value={attribute.type}
                        onChange={(event) =>
                          change({
                            ...draft,
                            attributes: draft.attributes.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    type: event.target.value as AttributeDefinition['type'],
                                  }
                                : item
                            ),
                          })
                        }
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="string_list">String list</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Description
                    <input
                      className="input"
                      maxLength={300}
                      value={attribute.description}
                      onChange={(event) =>
                        change({
                          ...draft,
                          attributes: draft.attributes.map((item, position) =>
                            position === index ? { ...item, description: event.target.value } : item
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    disabled={readonly || busy}
                    onClick={() => {
                      setRemoved([...removed, { kind: 'attribute', item: attribute, index }]);
                      change({
                        ...draft,
                        attributes: draft.attributes.filter((_, position) => position !== index),
                      });
                    }}
                  >
                    Remove attribute {attribute.key || index + 1}
                  </Button>
                </fieldset>
              ))}
              {!readonly && (
                <Button
                  type="button"
                  disabled={busy || draft.attributes.length >= 32}
                  onClick={() =>
                    change({
                      ...draft,
                      attributes: [
                        ...draft.attributes,
                        { key: '', type: 'string', description: '' },
                      ],
                    })
                  }
                >
                  Add attribute
                </Button>
              )}
            </Block>
            <Block
              name="content"
              label={`Reusable segments · ${draft.segments.length}/50`}
              icon="sliders"
            >
              <p className="fd-help">
                Each segment matches when all its conditions match (AND). Existing segment IDs and
                keys are immutable. Revision is assigned by the server on save.
              </p>
              {draft.segments.length === 0 && <Empty>No reusable segments defined.</Empty>}
              {draft.segments.map((segment, index) => {
                const existing = catalog.segments.find((item) => item.id === segment.id);
                const update = (next: Draft['segments'][number]) =>
                  change({
                    ...draft,
                    segments: draft.segments.map((item, position) =>
                      position === index ? next : item
                    ),
                  });
                return (
                  <fieldset className="fd-fieldset" key={segment.id} disabled={readonly || busy}>
                    <legend>
                      {segment.name || `Segment ${index + 1}`} ·{' '}
                      {existing ? `Revision ${existing.revision}` : 'New · Unsaved'}
                    </legend>
                    <p className="fd-help">Immutable ID: {segment.id}</p>
                    <div className="fd-inline-fields">
                      <label>
                        Key
                        <input
                          className="input"
                          maxLength={100}
                          value={segment.key}
                          readOnly={Boolean(existing)}
                          onChange={(event) => update({ ...segment, key: event.target.value })}
                        />
                      </label>
                      <label>
                        Name
                        <input
                          className="input"
                          maxLength={120}
                          value={segment.name}
                          onChange={(event) => update({ ...segment, name: event.target.value })}
                        />
                      </label>
                    </div>
                    <DirectorySegmentSummary conditions={segment.conditions} />
                    {!readonly && directory.status?.status === 'configured' && (
                      <DirectorySegmentBuilder
                        key={`${directory.status.binding.sourceId}:${directory.status.binding.tenantId}`}
                        request={request}
                        scope={scope}
                        environmentName={environmentName}
                        binding={directory.status.binding}
                        attributes={draft.attributes}
                        conditions={segment.conditions}
                        disabled={busy}
                        onAdd={(attributes, conditions) =>
                          change({
                            ...draft,
                            attributes,
                            segments: draft.segments.map((item, position) =>
                              position === index ? { ...item, conditions } : item
                            ),
                          })
                        }
                      />
                    )}
                    {segment.conditions.length === 0 && (
                      <Notice tone="warning">
                        This segment is empty and cannot be saved. Add a directory selection or an
                        advanced condition below.
                      </Notice>
                    )}
                    <ConditionsEditor
                      label="Segment conditions (AND)"
                      conditions={segment.conditions}
                      attributes={draft.attributes}
                      disabled={readonly || busy}
                      onChange={(conditions) => update({ ...segment, conditions })}
                    />
                    <Button
                      type="button"
                      disabled={readonly || busy}
                      onClick={() => {
                        setRemoved([...removed, { kind: 'segment', item: segment, index }]);
                        change({
                          ...draft,
                          segments: draft.segments.filter((_, position) => position !== index),
                        });
                      }}
                    >
                      Remove segment {segment.name || index + 1}
                    </Button>
                  </fieldset>
                );
              })}
              {!readonly && (
                <Button
                  type="button"
                  disabled={busy || draft.segments.length >= 50}
                  onClick={() =>
                    change({
                      ...draft,
                      segments: [
                        ...draft.segments,
                        {
                          id: crypto.randomUUID(),
                          key: '',
                          name: '',
                          conditions: [],
                        },
                      ],
                    })
                  }
                >
                  Add segment
                </Button>
              )}
            </Block>
            {removed.length > 0 && (
              <Notice>
                Removals are drafts until saved.
                <ul>
                  {removed.map((removal, index) => (
                    <li key={index}>
                      {removal.kind === 'attribute'
                        ? removal.item.key || 'Unnamed attribute'
                        : removal.item.name || 'Unnamed segment'}{' '}
                      <Button
                        type="button"
                        disabled={
                          readonly ||
                          busy ||
                          (removal.kind === 'attribute'
                            ? draft.attributes.length >= 32
                            : draft.segments.length >= 50)
                        }
                        onClick={() => undo(index)}
                      >
                        Undo removal
                      </Button>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {!readonly && (
              <div className="fd-actions">
                <Button type="button" disabled={busy || !dirty} onClick={() => setDiscard('reset')}>
                  Reset draft
                </Button>
                <Button type="submit" variant="primary" disabled={busy || !dirty}>
                  {busy ? 'Saving…' : `Save project catalog after r${catalog.revision}`}
                </Button>
              </div>
            )}
          </form>
        )}
        <Block name="content" label="Project catalog activity" icon="clock">
          <p className="fd-help">
            Server-recorded actor, revision and time · Project-wide changes, not environment
            activation.
          </p>
          {activityError && <Notice tone="danger">{activityError}</Notice>}
          {activityLoading ? (
            <p role="status">Loading catalog activity…</p>
          ) : activityError ? (
            <Button onClick={() => setActivityVersion((value) => value + 1)}>Retry activity</Button>
          ) : activity.items.length === 0 ? (
            <Empty>No catalog activity on this page.</Empty>
          ) : (
            activity.items.map((item) => (
              <article key={item.id}>
                <h3>
                  Revision {item.revision} · {item.actorName}
                </h3>
                <p>
                  Verified actor ID: {item.actorId} ·{' '}
                  <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
                </p>
                <details>
                  <summary>Before / after catalog changes</summary>
                  <div className="fd-inline-fields">
                    <CatalogSnapshot label="Before" catalog={item.previous} />
                    <CatalogSnapshot label="After" catalog={item.next} />
                  </div>
                </details>
              </article>
            ))
          )}
          <div className="fd-actions">
            <Button
              disabled={activityLoading || (!cursor && !activityError)}
              onClick={() => {
                setCursor(null);
                setActivityVersion((value) => value + 1);
              }}
            >
              Latest activity
            </Button>
            <Button
              disabled={activityLoading || Boolean(activityError) || !activity.nextCursor}
              onClick={() => setCursor(activity.nextCursor)}
            >
              Older activity
            </Button>
          </div>
        </Block>
      </CollectionPage>
      {discard && (
        <Confirm
          title="Discard unsaved catalog changes?"
          action={discard === 'reload' ? 'Discard and reload' : 'Discard draft'}
          onClose={() => setDiscard(null)}
          onConfirm={async () => {
            if (discard === 'reload') reload();
            else reset();
          }}
        >
          <p>
            Unsaved attribute edits, segment edits and removals in {projectName} will be discarded.
            Running flag configurations remain unchanged.
          </p>
        </Confirm>
      )}
    </>
  );
}

function CatalogSnapshot({ label, catalog }: { label: string; catalog: ProjectCatalog | null }) {
  return (
    <section>
      <h4>
        {label}
        {catalog ? ` · r${catalog.revision}` : ''}
      </h4>
      {!catalog ? (
        <p>No previous catalog.</p>
      ) : (
        <>
          <h5>Attributes ({catalog.attributes.length})</h5>
          {catalog.attributes.length === 0 ? (
            <p>None</p>
          ) : (
            <ul>
              {catalog.attributes.map((attribute) => (
                <li key={attribute.key}>
                  <strong>{attribute.key}</strong> · {attribute.type}
                  {attribute.description ? ` · ${attribute.description}` : ''}
                </li>
              ))}
            </ul>
          )}
          <h5>Segments ({catalog.segments.length})</h5>
          {catalog.segments.length === 0 ? (
            <p>None</p>
          ) : (
            catalog.segments.map((segment) => (
              <section key={segment.id}>
                <h5>
                  {segment.name} · {segment.key} · r{segment.revision}
                </h5>
                <p className="fd-help">ID: {segment.id} · All conditions must match</p>
                <ul>
                  {segment.conditions.map((condition, index) => (
                    <li key={index}>
                      {condition.attribute} {condition.operator}{' '}
                      {condition.values.map((value) => JSON.stringify(value)).join(', ')}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </section>
  );
}
