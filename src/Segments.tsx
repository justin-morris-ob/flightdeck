import './Segments.css';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Badge, Button, Notice, PageHeader } from '@onebrief/atlas-ui';
import { Icon } from '@onebrief/ux-kit';

import { directoryAttributes } from '../shared/directory.ts';
import { catalogSchema, type AttributeDefinition } from '../shared/targeting.ts';
import {
  createSegmentSchema,
  segmentLibrarySchema,
  segmentHistorySchema,
  segmentRecordSchema,
  updateSegmentDraftSchema,
  type SegmentDefinition,
  type SegmentRecord,
  type SegmentUsage,
} from '../shared/unified.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { Confirm, Modal } from './forms.tsx';
import {
  directoryAudience,
  DefinitionSummary,
  DefinitionView,
  SegmentBlocksEditor,
} from './SegmentDefinition.tsx';

export interface Props {
  request: Request;
  scope: string;
  projectName: string;
  environmentName: string;
  writable: boolean;
  onAudit: (segmentId: string) => void;
  onOpenFlag: (key: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  createRequest?: number;
  initialSegmentId?: string;
}

type Editor = {
  record: SegmentRecord | null;
  key: string;
  name: string;
  description: string;
  blocks: SegmentDefinition['blocks'];
};
type Inspection = { kind: 'published' | 'draft' | 'history'; version?: number };
const detailTabs = [
  { id: 'definition', label: 'Definition' },
  { id: 'usage', label: 'Where used' },
  { id: 'history', label: 'Version history' },
] as const;
type DetailTab = (typeof detailTabs)[number]['id'];
const referencePreviewLimit = 3;

function definitionContents(definition: SegmentDefinition): string {
  const counts = { people: 0, organizations: 0, groups: 0, traitBlocks: 0, conditions: 0 };
  for (const block of definition.blocks) {
    const audience = directoryAudience(block);
    if (audience) counts[audience.kind] += audience.ids.length;
    else {
      counts.traitBlocks++;
      counts.conditions += block.conditions.length;
    }
  }
  return [
    counts.people ? `${counts.people} ${counts.people === 1 ? 'person' : 'people'}` : '',
    counts.organizations
      ? `${counts.organizations} organization${counts.organizations === 1 ? '' : 's'}`
      : '',
    counts.groups ? `${counts.groups} group${counts.groups === 1 ? '' : 's'}` : '',
    counts.traitBlocks
      ? `${counts.conditions} trait condition${counts.conditions === 1 ? '' : 's'} across ${counts.traitBlocks} block${counts.traitBlocks === 1 ? '' : 's'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

interface HistoryPage {
  items: SegmentDefinition[];
  headCursor: number | null;
  nextCursor: number | null;
  busy: boolean;
  error: string;
}

function UsageTable({
  usage,
  version,
  environmentName,
  onOpenFlag,
}: {
  usage: SegmentUsage[];
  version: number | null;
  environmentName: string;
  onOpenFlag: (key: string) => void;
}) {
  if (!usage.length) return <p>No published flag references in {environmentName}.</p>;
  return (
    <div className="fd-segments-table-scroll">
      <table className="fd-segments-table">
        <thead>
          <tr>
            <th>Flag · {environmentName}</th>
            <th>Reference</th>
            <th>Environment gate</th>
            <th>Definition behavior</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((item) => (
            <tr key={item.flagId}>
              <td>
                <button
                  type="button"
                  className="fd-flag-link"
                  onClick={() => onOpenFlag(item.flagKey)}
                >
                  {item.flagName}
                </button>
                <span className="fd-help">
                  {item.flagKey} · Flag revision r{item.revision}
                </span>
              </td>
              <td>
                Published configuration<span className="fd-help">Follows published segment</span>
              </td>
              <td>
                <Badge>{item.enabled ? 'On' : 'Off'} · unchanged</Badge>
                <span className="fd-help">
                  {item.archived
                    ? 'Archived · Forces the configured off value regardless of saved gate'
                    : item.enabled
                      ? 'Enables evaluation; membership is not guaranteed'
                      : 'Returns the flag’s configured off value'}
                </span>
              </td>
              <td>
                {version === null ? 'No published definition' : `Follows v${version}`}
                <span className="fd-help">
                  {item.archived
                    ? 'Definition follows; archived flag stays inactive'
                    : item.enabled
                      ? 'ANY block may qualify'
                      : 'Definition follows; evaluation disabled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Segments({
  request,
  scope,
  projectName,
  environmentName,
  writable,
  onAudit,
  onOpenFlag,
  onDirtyChange,
  onBusyChange,
  createRequest = 0,
  initialSegmentId,
}: Props) {
  const [items, setItems] = useState<SegmentRecord[]>([]);
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialSegmentId ?? null);
  const [tab, setTab] = useState<DetailTab>('definition');
  const detailId = useId();
  const [inspection, setInspection] = useState<Inspection>({ kind: 'published' });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<SegmentRecord | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [restore, setRestore] = useState<{
    record: SegmentRecord;
    snapshot: SegmentDefinition;
  } | null>(null);
  const [historyPages, setHistoryPages] = useState<Record<string, HistoryPage>>({});
  const historyRequestVersion = useRef(0);
  const consumedCreate = useRef(0);
  const mutationScope = useRef(scope);
  mutationScope.current = scope;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setItems([]);
    get(request, `${scope}/segments`, segmentLibrarySchema)
      .then((result) => {
        if (current) {
          setItems(result.items);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setError(errorMessage(cause));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [request, scope, refresh]);

  useEffect(() => {
    let current = true;
    setAttributes([]);
    setCatalogError('');
    if (!writable) return;
    get(request, `${scope}/catalog`, catalogSchema)
      .then((catalog) => {
        if (current) setAttributes(catalog.attributes);
      })
      .catch((cause: unknown) => {
        if (current) setCatalogError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope, writable, refresh]);

  useEffect(() => {
    historyRequestVersion.current++;
    setHistoryPages({});
    return () => {
      historyRequestVersion.current++;
    };
  }, [request, scope]);

  useEffect(() => {
    setSelectedId(initialSegmentId ?? null);
    setEditor(null);
    setDirty(false);
    setDiscard(false);
    setReview(null);
    setRestore(null);
    setInspection({ kind: 'published' });
    setTab('definition');
    setMessage('');
    setEditorError('');
  }, [scope, initialSegmentId]);
  useEffect(() => {
    if (!writable) {
      setEditor(null);
      setDirty(false);
      setReview(null);
      setRestore(null);
    }
  }, [writable]);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (!writable || createRequest <= consumedCreate.current) return;
    consumedCreate.current = createRequest;
    setSelectedId(null);
    setEditor({ record: null, key: '', name: '', description: '', blocks: [] });
    setEditorError('');
    setDirty(false);
  }, [createRequest, writable]);

  const selected = items.find((item) => item.id === selectedId && (writable || item.published));
  const historyPage = selected ? historyPages[selected.id] : undefined;
  const historyDefinitions = selected
    ? [
        ...new Map(
          [...(historyPage?.items ?? []), ...selected.history].map((definition) => [
            definition.version,
            definition,
          ])
        ).values(),
      ].sort((left, right) => right.version - left.version)
    : [];
  const historyCursor = selected
    ? historyPage && historyPage.headCursor === selected.historyNextCursor
      ? historyPage.nextCursor
      : selected.historyNextCursor
    : null;
  const visible = items.filter((item) => {
    if (!writable && !item.published) return false;
    if (usageFilter === 'used' && !item.usage.length) return false;
    if (usageFilter === 'unused' && item.usage.length) return false;
    const identity = [
      item.key,
      item.published?.name,
      item.published?.description,
      ...(writable ? [item.name, item.description, item.draft?.name, item.draft?.description] : []),
    ];
    return identity.filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase());
  });
  const directoryTypeConflicts = directoryAttributes.filter((known) =>
    attributes.some((attribute) => attribute.key === known.key && attribute.type !== known.type)
  );
  const currentDefinition = selected
    ? inspection.kind === 'draft' && writable
      ? selected.draft
      : inspection.kind === 'history'
        ? (historyDefinitions.find((item) => item.version === inspection.version) ?? null)
        : selected.published
    : null;
  const identityDefinition =
    currentDefinition ?? selected?.published ?? (writable ? selected?.draft : null);
  const definitionLabel =
    inspection.kind === 'draft'
      ? 'Draft definition'
      : inspection.kind === 'history'
        ? 'Historical snapshot'
        : 'Published definition';

  function changeTab(next: DetailTab) {
    if (inspection.kind === 'history' && next !== 'history')
      setInspection({ kind: selected?.published ? 'published' : 'draft' });
    setTab(next);
  }

  function accept(record: SegmentRecord) {
    setItems((previous) =>
      previous.some((item) => item.id === record.id)
        ? previous.map((item) => (item.id === record.id ? record : item))
        : [...previous, record]
    );
    setSelectedId(record.id);
  }
  async function loadOlderHistory(record: SegmentRecord, before: number) {
    if (historyPages[record.id]?.busy) return;
    const version = historyRequestVersion.current;
    setHistoryPages((previous) => ({
      ...previous,
      [record.id]: {
        items: previous[record.id]?.items ?? [],
        headCursor: record.historyNextCursor,
        nextCursor: before,
        busy: true,
        error: '',
      },
    }));
    try {
      const page = await get(
        request,
        `${scope}/segments/${record.id}/history?before=${before}&limit=20`,
        segmentHistorySchema
      );
      if (version !== historyRequestVersion.current) return;
      setHistoryPages((previous) => ({
        ...previous,
        [record.id]: {
          items: [
            ...new Map(
              [...(previous[record.id]?.items ?? []), ...record.history, ...page.items].map(
                (definition) => [definition.version, definition]
              )
            ).values(),
          ],
          headCursor: record.historyNextCursor,
          nextCursor: page.nextCursor,
          busy: false,
          error: '',
        },
      }));
    } catch (cause) {
      if (version !== historyRequestVersion.current) return;
      setHistoryPages((previous) => ({
        ...previous,
        [record.id]: {
          items: previous[record.id]?.items ?? [],
          headCursor: record.historyNextCursor,
          nextCursor: before,
          busy: false,
          error: errorMessage(cause),
        },
      }));
    }
  }
  function edit(record: SegmentRecord | null) {
    if (!writable) return;
    if (!record) setSelectedId(null);
    const definition = record?.draft ?? record?.published;
    setEditor({
      record,
      key: record?.key ?? '',
      name: definition?.name ?? '',
      description: definition?.description ?? '',
      blocks: definition?.blocks ?? [],
    });
    setEditorError('');
    setDirty(false);
  }
  function closeEditor() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else setEditor(null);
  }
  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !writable || busy) return;
    const targetScope = scope;
    setEditorError('');
    const data = editor.record
      ? updateSegmentDraftSchema.safeParse({
          expectedRevision: editor.record.revision,
          name: editor.name,
          description: editor.description,
          blocks: editor.blocks,
        })
      : createSegmentSchema.safeParse({
          key: editor.key,
          name: editor.name,
          description: editor.description,
          blocks: editor.blocks,
        });
    if (!data.success) {
      setEditorError(
        data.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
      );
      return;
    }
    setBusy(true);
    try {
      const record = await send(
        request,
        editor.record ? `${scope}/segments/${editor.record.id}/draft` : `${scope}/segments`,
        editor.record ? 'PUT' : 'POST',
        data.data,
        segmentRecordSchema
      );
      if (mutationScope.current !== targetScope) return;
      accept(record);
      setEditor(null);
      setDirty(false);
      setInspection({ kind: 'draft' });
      setTab('definition');
      setMessage(
        `Draft v${record.draft?.version} saved in ${environmentName}. Published behavior is unchanged.`
      );
    } catch (cause) {
      if (mutationScope.current === targetScope) setEditorError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function openReview(record: SegmentRecord) {
    if (!writable || busy) return;
    const targetScope = scope;
    setBusy(true);
    setError('');
    setReviewError('');
    try {
      const library = await get(request, `${scope}/segments`, segmentLibrarySchema);
      if (mutationScope.current !== targetScope) return;
      setItems(library.items);
      const current = library.items.find((item) => item.id === record.id);
      if (!current?.draft) throw new Error('There is no saved segment draft to publish.');
      setReview(current);
    } catch (cause) {
      if (mutationScope.current === targetScope) setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!review?.draft || !writable || busy) return;
    const targetScope = scope;
    setBusy(true);
    setReviewError('');
    try {
      const record = await send(
        request,
        `${scope}/segments/${review.id}/publish`,
        'POST',
        { expectedRevision: review.revision },
        segmentRecordSchema
      );
      if (mutationScope.current !== targetScope) return;
      accept(record);
      setReview(null);
      setInspection({ kind: 'published' });
      setTab('definition');
      setMessage(
        `${record.published?.name} v${record.published?.version} published to ${environmentName}. ` +
          `${record.usage.length} published reference${record.usage.length === 1 ? '' : 's'} now follow it. Gates, direct selections, and flag revisions are unchanged.`
      );
    } catch (cause) {
      if (mutationScope.current === targetScope) setReviewError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const editorForm = editor && writable && (
    <form className="fd-form fd-segment-editor" onSubmit={(event) => void saveDraft(event)}>
      {editorError && <Notice tone="danger">{editorError}</Notice>}
      {catalogError && (
        <Notice tone="warning">
          Trait catalog unavailable. Existing predicates are preserved; new custom traits cannot be
          selected. {catalogError}
        </Notice>
      )}
      {directoryTypeConflicts.length > 0 && (
        <Notice tone="warning">
          Existing context field types conflict with BC membership targeting:{' '}
          {directoryTypeConflicts.map((known) => `${known.key} must be ${known.type}`).join('; ')}.
          Directory selections using these fields cannot be saved. Existing types are never
          overwritten.
        </Notice>
      )}
      <div className="fd-segment-metadata">
        <label>
          Segment name
          <input
            className="input"
            required
            maxLength={120}
            autoFocus
            value={editor.name}
            disabled={busy}
            onChange={(event) => {
              setEditor({ ...editor, name: event.target.value });
              setDirty(true);
            }}
          />
        </label>
        <label>
          Description · Optional
          <input
            className="input"
            maxLength={1000}
            value={editor.description}
            disabled={busy}
            onChange={(event) => {
              setEditor({ ...editor, description: event.target.value });
              setDirty(true);
            }}
          />
        </label>
        <label>
          Immutable key
          <input
            className="input fd-mono"
            required
            maxLength={100}
            pattern="[a-z][a-z0-9_-]*"
            readOnly={Boolean(editor.record)}
            value={editor.key}
            disabled={busy}
            onChange={(event) => {
              setEditor({ ...editor, key: event.target.value });
              setDirty(true);
            }}
          />
        </label>
      </div>
      <SegmentBlocksEditor
        request={request}
        scope={scope}
        blocks={editor.blocks}
        attributes={attributes}
        disabled={busy}
        onChange={(blocks) => {
          setEditor({ ...editor, blocks });
          setDirty(true);
        }}
      />
      <div className="fd-actions">
        <Button type="button" disabled={busy} onClick={closeEditor}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving draft…' : 'Save segment draft'}
        </Button>
      </div>
      <p className="fd-help">
        Saving creates or replaces a non-live draft. Review and publish separately before flags can
        follow this definition.
      </p>
    </form>
  );
  return (
    <section className={`fd-segments${editor && !editor.record ? ' fd-segment-creation' : ''}`}>
      <PageHeader
        title={editor && !editor.record ? 'Create segment' : 'Segments'}
        meta={`${projectName} · ${environmentName} · ${editor && !editor.record ? 'Draft · Reusable audience' : 'Reusable audience library'}`}
        actions={
          editor && !editor.record ? (
            <Button disabled={busy} onClick={closeEditor}>
              Back to segments
            </Button>
          ) : (
            <div className="fd-segment-header-controls">
              {selected && (
                <nav aria-label="Segment navigation">
                  <Button
                    onClick={() => {
                      setSelectedId(null);
                      setInspection({ kind: 'published' });
                    }}
                  >
                    <Icon name="back" size="sm" />
                    All segments
                  </Button>
                </nav>
              )}
              <div
                className="fd-actions fd-segment-library-actions"
                role="group"
                aria-label="Segment library actions"
              >
                {writable && (
                  <Button variant="primary" onClick={() => edit(null)}>
                    Create segment
                  </Button>
                )}
                <Button disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>
                  Reload segments
                </Button>
              </div>
            </div>
          )
        }
      />
      {editor && !editor.record && writable ? (
        <div className="fd-creation-card">{editorForm}</div>
      ) : (
        <>
          {!selected && (
            <p className="fd-help">
              One published definition. Every published reference follows it in {environmentName}{' '}
              only.
              {writable
                ? ' Segment drafts are not live.'
                : ' Read only · Published definitions only.'}
            </p>
          )}
          {message && <Notice tone="primary">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          {loading ? (
            <p role="status">Loading segment library…</p>
          ) : selected ? (
            <>
              <article className="fd-segment-summary-card" aria-label="Segment overview">
                <header className="fd-segment-summary-heading">
                  <div className="fd-segment-detail-header">
                    <h2>{identityDefinition?.name ?? selected.name}</h2>
                    <code>{selected.key}</code>
                    {(identityDefinition?.description ?? selected.description) && (
                      <p>{identityDefinition?.description ?? selected.description}</p>
                    )}
                    <div className="fd-segment-status">
                      {!selected.published && <Badge>No published definition</Badge>}
                      {writable && selected.draft && (
                        <Badge tone="warning">Draft v{selected.draft.version} · Not live</Badge>
                      )}
                      <span className="fd-help">
                        {projectName} · {environmentName} only · Segment record revision r
                        {selected.revision}
                      </span>
                    </div>
                  </div>
                  <div className="fd-actions">
                    <Button onClick={() => onAudit(selected.id)}>View audit history</Button>
                    {writable && (
                      <Button onClick={() => edit(selected)}>
                        {selected.draft ? 'Edit draft' : 'Create draft from published'}
                      </Button>
                    )}
                    {writable && selected.draft && (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void openReview(selected)}
                      >
                        Review changes
                      </Button>
                    )}
                  </div>
                </header>
                <div className="fd-segment-summary-details">
                  <section className="fd-segment-summary-definition" aria-label="Audience summary">
                    <div
                      className="fd-segment-version-selector"
                      role="group"
                      aria-label="Inspect segment definition"
                    >
                      {selected.published && (
                        <Button
                          variant="quiet"
                          aria-pressed={inspection.kind === 'published'}
                          onClick={() => {
                            setInspection({ kind: 'published' });
                            setTab('definition');
                          }}
                        >
                          Published v{selected.published.version}
                        </Button>
                      )}
                      {writable && selected.draft && (
                        <Button
                          variant="quiet"
                          aria-pressed={inspection.kind === 'draft'}
                          onClick={() => {
                            setInspection({ kind: 'draft' });
                            setTab('definition');
                          }}
                        >
                          Draft v{selected.draft.version} · Not live
                        </Button>
                      )}
                    </div>
                    <h3>
                      {currentDefinition
                        ? `${definitionLabel} · v${currentDefinition.version}`
                        : 'No published definition'}
                    </h3>
                    {currentDefinition && (
                      <>
                        <p className="fd-segment-audience-summary">
                          {definitionContents(currentDefinition)}
                        </p>
                        <p className="fd-help">
                          {inspection.kind === 'draft'
                            ? 'Saved draft only. Publishing requires a separate review.'
                            : inspection.kind === 'history'
                              ? 'Read-only snapshot · Not active. Inspecting changes nothing.'
                              : 'Read-only snapshot · Current published definition.'}
                        </p>
                      </>
                    )}
                  </section>
                  <aside className="fd-segment-impact" aria-label="Publication boundary">
                    <h3>Publication boundary</h3>
                    <p>
                      {selected.usage.length} published flag reference
                      {selected.usage.length === 1 ? '' : 's'} in {environmentName}.
                    </p>
                    <p>
                      {selected.published
                        ? `Published references follow v${selected.published.version}. Gates stay unchanged.`
                        : 'No published definition. Saved drafts have no live effect.'}
                    </p>
                    <p className="fd-help">
                      Unsaved browser flag drafts are excluded. No other deployment is updated.
                    </p>
                    {writable && inspection.kind === 'draft' && selected.published && (
                      <div className="fd-segment-other-version">
                        <h4>Published v{selected.published.version} remains in use</h4>
                        <p className="fd-help">{definitionContents(selected.published)}</p>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setInspection({ kind: 'published' });
                            setTab('definition');
                          }}
                        >
                          Inspect published v{selected.published.version}
                        </Button>
                      </div>
                    )}
                    {writable && inspection.kind === 'published' && selected.draft && (
                      <div className="fd-segment-other-version">
                        <h4>Separate unpublished changes · Draft v{selected.draft.version}</h4>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setInspection({ kind: 'draft' });
                            setTab('definition');
                          }}
                        >
                          Inspect draft v{selected.draft.version}
                        </Button>
                      </div>
                    )}
                  </aside>
                </div>
              </article>
              <div
                className="fd-segment-detail-tabs"
                data-block="view-bar"
                role="tablist"
                aria-label="Segment detail views"
                onKeyDown={(event) => {
                  const current = detailTabs.findIndex((entry) => entry.id === tab);
                  const next =
                    event.key === 'ArrowRight'
                      ? (current + 1) % detailTabs.length
                      : event.key === 'ArrowLeft'
                        ? (current + detailTabs.length - 1) % detailTabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? detailTabs.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  changeTab(detailTabs[next]!.id);
                  event.currentTarget
                    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
              >
                {detailTabs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    className="view-tab"
                    id={`${detailId}-${entry.id}-tab`}
                    aria-controls={`${detailId}-${entry.id}-panel`}
                    aria-selected={tab === entry.id}
                    tabIndex={tab === entry.id ? 0 : -1}
                    onClick={() => changeTab(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <section
                className="fd-segment-tab-panel"
                role="tabpanel"
                id={`${detailId}-definition-panel`}
                aria-labelledby={`${detailId}-definition-tab`}
                hidden={tab !== 'definition'}
                tabIndex={0}
              >
                {tab === 'definition' &&
                  (currentDefinition ? (
                    <>
                      <h3 className="fd-segment-definition-heading">
                        Audience and trait rules
                        <Badge tone={inspection.kind === 'draft' ? 'warning' : 'success'}>
                          {inspection.kind === 'draft'
                            ? `Draft v${currentDefinition.version} · Not live`
                            : `Published v${currentDefinition.version}`}
                        </Badge>
                      </h3>
                      <DefinitionView
                        definition={currentDefinition}
                        request={request}
                        scope={scope}
                        writable={writable}
                      />
                    </>
                  ) : (
                    <Notice>
                      {selected.draft && writable
                        ? 'No published definition. Inspect the saved draft to review this audience.'
                        : 'No definition available.'}
                    </Notice>
                  ))}
              </section>
              <section
                className="fd-segment-tab-panel"
                role="tabpanel"
                id={`${detailId}-usage-panel`}
                aria-labelledby={`${detailId}-usage-tab`}
                hidden={tab !== 'usage'}
                tabIndex={0}
              >
                {tab === 'usage' && (
                  <>
                    <h3>Where used · {environmentName}</h3>
                    <p>
                      Published references follow together. Off gates stay Off while their
                      definitions follow publication.
                    </p>
                    <UsageTable
                      usage={selected.usage}
                      version={selected.published?.version ?? null}
                      environmentName={environmentName}
                      onOpenFlag={onOpenFlag}
                    />
                    <p className="fd-help">
                      Only stored published references are shown. Unsaved browser flag drafts are
                      not tracked or included in publication impact. For active flags, Gate On
                      enables evaluation, not guaranteed membership. Archived flags remain inactive
                      regardless of their saved gate. No population estimates.
                    </p>
                  </>
                )}
              </section>
              <section
                className="fd-segment-tab-panel"
                role="tabpanel"
                id={`${detailId}-history-panel`}
                aria-labelledby={`${detailId}-history-tab`}
                hidden={tab !== 'history'}
                tabIndex={0}
              >
                {tab === 'history' && (
                  <>
                    <h3>Version history</h3>
                    <p>
                      {writable
                        ? 'Published snapshots are retained. Restore historical contents as a draft, then review and publish deliberately.'
                        : 'Published snapshots are retained for read-only inspection. No live behavior changes here.'}
                    </p>
                    <div className="fd-segments-table-scroll">
                      <table className="fd-segments-table">
                        <thead>
                          <tr>
                            <th>Version</th>
                            <th>Definition &amp; effect</th>
                            <th>Snapshot actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.published && (
                            <tr>
                              <td>Published v{selected.published.version}</td>
                              <td>
                                Current published definition · All published references follow this
                                version.
                              </td>
                              <td>
                                <Button
                                  onClick={() => {
                                    setInspection({ kind: 'published' });
                                    setTab('definition');
                                  }}
                                >
                                  Inspect published v{selected.published.version}
                                </Button>
                              </td>
                            </tr>
                          )}
                          {writable && selected.draft && (
                            <tr>
                              <td>Draft v{selected.draft.version} · Not live</td>
                              <td>Unpublished changes · No live effect</td>
                              <td>
                                <Button
                                  onClick={() => {
                                    setInspection({ kind: 'draft' });
                                    setTab('definition');
                                  }}
                                >
                                  Inspect draft v{selected.draft.version}
                                </Button>
                              </td>
                            </tr>
                          )}
                          {historyDefinitions
                            .filter((snapshot) => snapshot.version !== selected.published?.version)
                            .map((snapshot) => (
                              <tr key={snapshot.version}>
                                <td>Historical v{snapshot.version}</td>
                                <td>
                                  <DefinitionSummary definition={snapshot} />
                                  <span className="fd-help">Retained snapshot · Not active</span>
                                </td>
                                <td>
                                  <Button
                                    onClick={() =>
                                      setInspection({ kind: 'history', version: snapshot.version })
                                    }
                                  >
                                    Inspect snapshot v{snapshot.version}
                                  </Button>
                                  {writable && (
                                    <Button
                                      onClick={() => setRestore({ record: selected, snapshot })}
                                    >
                                      Restore v{snapshot.version} as draft
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {historyPage?.error &&
                      historyPage.headCursor === selected.historyNextCursor && (
                        <Notice tone="warning">
                          Older versions could not be loaded. Existing snapshots are retained.{' '}
                          {historyPage.error}
                        </Notice>
                      )}
                    {historyCursor !== null && (
                      <Button
                        disabled={historyPage?.busy}
                        onClick={() => void loadOlderHistory(selected, historyCursor)}
                      >
                        {historyPage?.busy
                          ? 'Loading older versions…'
                          : 'Load older published versions'}
                      </Button>
                    )}
                    {inspection.kind === 'history' && currentDefinition && (
                      <section className="fd-segment-history-snapshot">
                        <h3>
                          Historical v{currentDefinition.version} snapshot · Read only · Not active
                        </h3>
                        <DefinitionView
                          definition={currentDefinition}
                          request={request}
                          scope={scope}
                          writable={writable}
                        />
                        <p>
                          Inspecting changes nothing. Restoring never replaces the current published
                          definition.
                        </p>
                      </section>
                    )}
                  </>
                )}
              </section>
            </>
          ) : (
            <>
              {initialSegmentId &&
                !items.some(
                  (item) => item.id === initialSegmentId && (writable || item.published)
                ) && <Notice>The requested segment is not available in this scope.</Notice>}
              <section className="fd-segment-library-card" aria-label="Segment library">
                <div className="fd-segments-toolbar">
                  <label>
                    Search segments
                    <input
                      className="input"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by name, key, or description"
                    />
                  </label>
                  <label>
                    Usage
                    <select
                      className="input"
                      value={usageFilter}
                      onChange={(event) => setUsageFilter(event.target.value as typeof usageFilter)}
                    >
                      <option value="all">All usage</option>
                      <option value="used">Referenced by published flags</option>
                      <option value="unused">No published references</option>
                    </select>
                  </label>
                  <span className="fd-help">
                    {visible.length} segment{visible.length === 1 ? '' : 's'}
                  </span>
                </div>
                {visible.length ? (
                  <div className="fd-segments-table-scroll">
                    <table className="fd-segments-table">
                      <thead>
                        <tr>
                          <th>Segment</th>
                          <th>Published definition summary</th>
                          <th>Referenced by</th>
                          <th>Publication</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <button
                                type="button"
                                className="fd-flag-link"
                                onClick={() => {
                                  setSelectedId(item.id);
                                  setTab('definition');
                                  setInspection({ kind: item.published ? 'published' : 'draft' });
                                }}
                              >
                                {item.published?.name ?? item.name}
                              </button>
                              <span className="fd-help">{item.key}</span>
                              <span className="fd-help">
                                {item.published?.description ?? (writable ? item.description : '')}
                              </span>
                            </td>
                            <td>
                              <DefinitionSummary definition={item.published} />
                            </td>
                            <td>
                              {item.usage.length ? (
                                <ul className="fd-segment-reference-list">
                                  {item.usage.slice(0, referencePreviewLimit).map((usage) => (
                                    <li key={usage.flagId}>
                                      <button
                                        type="button"
                                        className="fd-flag-link"
                                        onClick={() => onOpenFlag(usage.flagKey)}
                                      >
                                        {usage.flagName}
                                      </button>
                                    </li>
                                  ))}
                                  {item.usage.length > referencePreviewLimit && (
                                    <li>
                                      <button
                                        type="button"
                                        className="fd-flag-link"
                                        aria-label={`View all ${item.usage.length} flags using ${item.published?.name ?? item.name}`}
                                        onClick={() => {
                                          setSelectedId(item.id);
                                          setInspection({ kind: 'published' });
                                          setTab('usage');
                                        }}
                                      >
                                        View all {item.usage.length} flags
                                      </button>
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                'Not yet referenced'
                              )}
                            </td>
                            <td>
                              {item.published ? (
                                <Badge tone="success">Published v{item.published.version}</Badge>
                              ) : (
                                <Badge>No published definition</Badge>
                              )}
                              {writable &&
                                (item.draft ? (
                                  <span className="fd-help">
                                    Draft v{item.draft.version} · Not live
                                  </span>
                                ) : (
                                  <span className="fd-help">No draft</span>
                                ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>
                    {search || usageFilter !== 'all'
                      ? 'No segments match these filters.'
                      : writable
                        ? 'No segments yet. Create a reusable audience draft to begin.'
                        : 'No published segments in this scope.'}
                  </p>
                )}
                <p className="fd-help">
                  Organizations and groups select people across organizations. Summaries describe
                  published contents, never draft additions. Environment gates control evaluation,
                  not segment membership.
                </p>
              </section>
            </>
          )}
        </>
      )}
      {editor?.record && writable && (
        <Modal title={`Edit segment draft · ${environmentName}`} onClose={closeEditor}>
          {editorForm}
        </Modal>
      )}
      {discard && (
        <Confirm
          title="Discard unsaved segment changes?"
          action="Discard changes"
          onClose={() => setDiscard(false)}
          onConfirm={async () => {
            setEditor(null);
            setDirty(false);
          }}
        >
          <p>
            Only unsaved browser edits are discarded. Any saved draft and the published definition
            remain unchanged.
          </p>
        </Confirm>
      )}
      {review?.draft && writable && (
        <Modal
          title={`Review segment publication · ${environmentName}`}
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <div className="fd-form fd-segment-review">
            {reviewError && (
              <Notice tone="danger">
                {reviewError} Keep this draft, reload the latest record, and review the updated
                impact before publishing.
              </Notice>
            )}
            <h3>
              Publish {review.draft.name} ·{' '}
              {review.published ? `v${review.published.version}` : 'Unpublished'} → v
              {review.draft.version}
            </h3>
            <p>
              {projectName} · {environmentName} only. All {review.usage.length} published references
              below will follow v{review.draft.version} together. No other deployment is updated.
            </p>
            <p className="fd-help">
              Review bound to segment record revision r{review.revision}, including this
              affected-reference set and its gates. Concurrent changes require a fresh review.
            </p>
            <div className="fd-segment-review-columns">
              <section>
                <h3>
                  Before ·{' '}
                  {review.published
                    ? `Published v${review.published.version}`
                    : 'No published definition'}
                </h3>
                {review.published ? (
                  <>
                    <h4>{review.published.name}</h4>
                    <p>{review.published.description}</p>
                    <DefinitionView
                      definition={review.published}
                      request={request}
                      scope={scope}
                      writable={writable}
                    />
                  </>
                ) : (
                  <p>No live segment definition.</p>
                )}
              </section>
              <section>
                <h3>After · Published v{review.draft.version}</h3>
                <h4>{review.draft.name}</h4>
                <p>{review.draft.description}</p>
                <DefinitionView
                  definition={review.draft}
                  request={request}
                  scope={scope}
                  writable={writable}
                />
              </section>
            </div>
            <h3>Affected published references · {environmentName}</h3>
            <UsageTable
              usage={review.usage}
              version={review.draft.version}
              environmentName={environmentName}
              onOpenFlag={onOpenFlag}
            />
            <Notice>
              Only the published segment definition changes. Gates, archive state, direct
              selections, flag revisions, and unrelated flag drafts stay unchanged. Browser-only
              draft references are excluded. Off remains Off; archived flags stay inactive.
            </Notice>
            <div className="fd-actions">
              <Button disabled={busy} onClick={() => setReview(null)}>
                Keep draft
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void publish()}>
                {busy ? 'Publishing…' : `Publish segment to ${environmentName}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {restore && writable && (
        <Confirm
          title={`Restore v${restore.snapshot.version} as draft?`}
          action="Restore as draft"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            const targetScope = scope;
            const record = await send(
              request,
              `${scope}/segments/${restore.record.id}/restore`,
              'POST',
              { expectedRevision: restore.record.revision, version: restore.snapshot.version },
              segmentRecordSchema
            );
            if (mutationScope.current !== targetScope) return;
            accept(record);
            setInspection({ kind: 'draft' });
            setTab('definition');
            setMessage(
              `Historical v${restore.snapshot.version} restored as draft v${record.draft?.version}. Published behavior is unchanged.`
            );
          }}
        >
          <p>
            {projectName} · {environmentName} only. Historical contents are copied into a non-live
            draft. The historical snapshot is preserved.
          </p>
          <div className="fd-segment-review-columns">
            <section>
              <h3>
                {restore.record.draft
                  ? `Existing draft v${restore.record.draft.version} · Replaced`
                  : 'No existing draft'}
              </h3>
              {restore.record.draft && <DefinitionSummary definition={restore.record.draft} />}
            </section>
            <section>
              <h3>Restored draft · Historical v{restore.snapshot.version}</h3>
              <DefinitionSummary definition={restore.snapshot} />
            </section>
          </div>
          <p>
            {restore.record.published
              ? `Published v${restore.record.published.version}`
              : 'Published state'}{' '}
            remains unchanged. All {restore.record.usage.length} published references and their
            gates stay unchanged.
          </p>
          <p>
            A separate review and “Publish segment to {environmentName}” are required to make these
            contents live.
          </p>
          <p className="fd-help">Expected segment record revision r{restore.record.revision}.</p>
        </Confirm>
      )}
    </section>
  );
}
