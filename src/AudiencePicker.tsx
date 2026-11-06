import './AudiencePicker.css';

import type { Segment } from '../shared/targeting.ts';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';
import { Icon } from '@onebrief/ux-kit';

import {
  directoryResolveSchema,
  directorySearchSchema,
  type DirectoryAudience,
  type DirectoryItem,
  type DirectoryKind,
} from '../shared/directory.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { demoDirectoryBinding, demoDirectoryItems } from './demoDirectory.ts';
import { useDirectoryConnection } from './useDirectoryConnection.ts';

export interface Props {
  request: Request;
  scope: string;
  selected: DirectoryAudience[];
  onChange?: (next: DirectoryAudience[], segmentIds: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  demoData?: boolean;
  /** Segment OR-block budget; omit to retain the single 20-ID batch per kind. */
  maxTargetBlocks?: number;
  segments?: { options: Segment[]; selectedIds: string[] };
  directoryDisabled?: boolean;
}

const kinds: DirectoryKind[] = ['people', 'organizations', 'groups'];
type AudienceKind = DirectoryKind | 'segments';
const labels: Record<AudienceKind, string> = {
  people: 'People',
  organizations: 'Organizations',
  groups: 'Groups',
  segments: 'Segments',
};
const singularLabels: Record<AudienceKind, string> = {
  people: 'Person',
  organizations: 'Organization',
  groups: 'Group',
  segments: 'Segment',
};
const selectionPreviewLimit = 6;

function AudienceIcon({ kind }: { kind: AudienceKind }) {
  if (kind === 'groups') return <Icon name="users" size="sm" className="fd-audience-kind-icon" />;
  return (
    <svg
      className="fd-audience-kind-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'segments' ? (
        <path d="M9 4h6v6H9zM3 16h6v6H3zM15 16h6v6h-6zM12 10v3M6 16v-3h12v3" />
      ) : kind === 'people' ? (
        <>
          <circle cx="12" cy="7" r="3.5" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </>
      ) : (
        <path d="M5 21V3h14v18M3 21h18M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5" />
      )}
    </svg>
  );
}
type Result = { items: DirectoryItem[]; nextOffset: number | null; error: string };
const emptyResults = (): Record<DirectoryKind, Result> => ({
  people: { items: [], nextOffset: null, error: '' },
  organizations: { items: [], nextOffset: null, error: '' },
  groups: { items: [], nextOffset: null, error: '' },
});
function itemKey(audience: Pick<DirectoryAudience, 'sourceId' | 'tenantId' | 'kind'>, id: string) {
  return JSON.stringify([audience.sourceId, audience.tenantId, audience.kind, id]);
}

export function AudiencePicker({
  request,
  scope,
  selected,
  onChange,
  disabled = false,
  readOnly = false,
  compact = false,
  demoData = false,
  maxTargetBlocks,
  segments,
  directoryDisabled = false,
}: Props) {
  const { status, error: statusError } = useDirectoryConnection(request, scope);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AudienceKind | 'all'>('all');
  const [results, setResults] = useState(emptyResults);
  const [cache, setCache] = useState<Record<string, DirectoryItem>>({});
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [selectionQuery, setSelectionQuery] = useState('');
  const selectionId = useId();
  const [removed, setRemoved] = useState<{
    directory: DirectoryAudience[];
    segmentIds: string[];
    after: string;
  } | null>(null);
  const generation = useRef(0);
  const binding = status?.status === 'configured' ? status.binding : null;
  const activeBinding = demoData ? demoDirectoryBinding : binding;
  const segmentIds = segments?.selectedIds ?? [];
  const directorySelectionKey = JSON.stringify(selected);
  const selectionKey = JSON.stringify([selected, segmentIds]);
  const canEdit = !disabled && !readOnly && Boolean(onChange);
  const canSearchDirectory = canEdit && !directoryDisabled;
  const undoSelection = removed?.after === selectionKey ? removed : null;
  const selectedTargets = [
    ...selected.flatMap((audience, audienceIndex) =>
      audience.ids.map((id) => {
        const synthetic =
          audience.sourceId === demoDirectoryBinding.sourceId &&
          audience.tenantId === demoDirectoryBinding.tenantId;
        const item = synthetic
          ? demoDirectoryItems[audience.kind].find((entry) => entry.id === id)
          : disabled
            ? undefined
            : cache[itemKey(audience, id)];
        const currentBinding =
          binding &&
          audience.sourceId === binding.sourceId &&
          audience.tenantId === binding.tenantId;
        const detail = [
          singularLabels[audience.kind],
          !item ? 'Label unavailable; saved ID retained' : undefined,
          !currentBinding && !synthetic ? 'Saved directory binding' : undefined,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          key: `${audienceIndex}:${itemKey(audience, id)}`,
          kind: audience.kind as AudienceKind,
          id,
          audienceIndex,
          label: item?.label ?? id,
          email: item?.email,
          detail,
          description: [item?.label ?? id, item?.email, detail].filter(Boolean).join(' · '),
        };
      })
    ),
    ...segmentIds.map((id) => {
      const segment = segments?.options.find((item) => item.id === id);
      const detail = segment
        ? `Segment · Flightdeck · Follows published v${segment.revision}`
        : 'Segment · Unavailable; saved ID retained';
      return {
        key: `segment:${id}`,
        kind: 'segments' as AudienceKind,
        id,
        audienceIndex: -1,
        label: segment?.name ?? id,
        email: undefined,
        detail,
        description: `${segment?.name ?? id} · ${detail}`,
      };
    }),
  ];
  const selectionExpanded = expanded && selectedTargets.length > selectionPreviewLimit;
  const visibleTargets = selectionExpanded
    ? selectedTargets.filter((target) =>
        `${target.description} ${target.id}`
          .toLowerCase()
          .includes(selectionQuery.trim().toLowerCase())
      )
    : selectedTargets.slice(0, selectionPreviewLimit);
  const resultKinds: AudienceKind[] = segments ? [...kinds, 'segments'] : kinds;
  const searchLabel = segments
    ? 'Search people, organizations, groups, or segments'
    : 'Search names, emails, organizations, or groups';
  const matchingSegments =
    segments?.options.filter((segment) =>
      `${segment.name} ${segment.key}`.toLowerCase().includes(query.trim().toLowerCase())
    ) ?? [];

  useEffect(() => {
    generation.current++;
    setQuery('');
    setResults(emptyResults());
    setCache({});
    setSearched(false);
    setBusy(false);
    setRemoved(null);
    setExpanded(false);
    setSelectionQuery('');
    return () => {
      generation.current++;
    };
  }, [scope, binding?.sourceId, binding?.tenantId, demoData]);

  useEffect(() => {
    let current = true;
    setResolveError('');
    if (!binding || disabled) return;
    const selections: DirectoryAudience[] = JSON.parse(directorySelectionKey);
    const matching = selections.filter(
      (item) => item.sourceId === binding.sourceId && item.tenantId === binding.tenantId
    );
    void Promise.all(
      matching.map(async (audience) => {
        const response = await send(
          request,
          `${scope}/directory/resolve`,
          'POST',
          { kind: audience.kind, ids: audience.ids },
          directoryResolveSchema
        );
        if (
          response.sourceId !== binding.sourceId ||
          response.tenantId !== binding.tenantId ||
          response.kind !== audience.kind
        )
          throw new Error('Directory binding changed. IDs retained.');
        return {
          items: response.items.map((item) => [itemKey(audience, item.id), item] as const),
          missing: response.missingIds.map((id) => itemKey(audience, id)),
        };
      })
    )
      .then((entries) => {
        if (current)
          setCache((previous) => {
            const next = { ...previous };
            for (const result of entries) for (const key of result.missing) delete next[key];
            return { ...next, ...Object.fromEntries(entries.flatMap((result) => result.items)) };
          });
      })
      .catch((cause: unknown) => {
        if (current) setResolveError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope, binding?.sourceId, binding?.tenantId, directorySelectionKey, disabled]);

  const search = useCallback(
    async (kind?: DirectoryKind, offset = 0) => {
      if (!binding || !canSearchDirectory || busy || query.trim().length < 2) return;
      const version = ++generation.current;
      setBusy(true);
      setSearched(false);
      const requested = kind ? [kind] : kinds;
      if (!kind) setResults(emptyResults());
      await Promise.all(
        requested.map(async (entry) => {
          try {
            const response = await get(
              request,
              `${scope}/directory/search?kind=${entry}&q=${encodeURIComponent(query.trim())}&offset=${offset}`,
              directorySearchSchema
            );
            if (version !== generation.current) return;
            if (
              response.sourceId !== binding.sourceId ||
              response.tenantId !== binding.tenantId ||
              response.kind !== entry
            )
              throw new Error('Directory binding changed. Search not accepted.');
            setResults((previous) => ({
              ...previous,
              [entry]: {
                items: offset
                  ? [
                      ...previous[entry].items,
                      ...response.items.filter(
                        (item) => !previous[entry].items.some((existing) => existing.id === item.id)
                      ),
                    ]
                  : response.items,
                nextOffset: response.nextOffset,
                error: '',
              },
            }));
            setCache((previous) => ({
              ...previous,
              ...Object.fromEntries(
                response.items.map((item) => [itemKey({ ...binding, kind: entry }, item.id), item])
              ),
            }));
          } catch (cause) {
            if (version === generation.current)
              setResults((previous) => ({
                ...previous,
                [entry]: { ...previous[entry], error: errorMessage(cause) },
              }));
          }
        })
      );
      if (version === generation.current) {
        setBusy(false);
        setSearched(true);
      }
    },
    [binding, canSearchDirectory, busy, query, request, scope]
  );

  useEffect(() => {
    if (demoData || !binding || !canSearchDirectory || busy || searched || query.trim().length < 2)
      return;
    const timer = window.setTimeout(() => void search(), 250);
    return () => window.clearTimeout(timer);
  }, [demoData, binding, canSearchDirectory, busy, searched, query, search]);

  function updateSelection(next: DirectoryAudience[], nextSegments: string[], removal: boolean) {
    if (!canEdit) return;
    setRemoved(
      removal
        ? {
            directory: selected,
            segmentIds,
            after: JSON.stringify([next, nextSegments]),
          }
        : null
    );
    onChange?.(next, nextSegments);
  }

  function changeSelection(kind: DirectoryKind, id: string, include: boolean) {
    if (!activeBinding || !canSearchDirectory) return;
    const matching = selected.filter(
      (entry) =>
        entry.kind === kind &&
        entry.sourceId === activeBinding.sourceId &&
        entry.tenantId === activeBinding.tenantId
    );
    const previousIds = [...new Set(matching.flatMap((entry) => entry.ids))];
    const ids = include
      ? [...new Set([...previousIds, id])]
      : previousIds.filter((value) => value !== id);
    const next = selected.filter((entry) => !matching.includes(entry));
    for (let offset = 0; offset < ids.length; offset += 20)
      next.push({ ...activeBinding, kind, ids: ids.slice(offset, offset + 20) });
    if (
      include &&
      ((maxTargetBlocks === undefined ? ids.length > 20 : next.length > maxTargetBlocks) ||
        (segments && next.length + segmentIds.length > 20))
    )
      return;
    updateSelection(next, segmentIds, !include);
  }

  function clearQuery(value: string) {
    generation.current++;
    setQuery(value);
    setResults(emptyResults());
    setSearched(false);
    setBusy(false);
  }

  return (
    <section
      className={`fd-audience-picker${compact ? ' fd-audience-picker-compact' : ''}`}
      aria-label={segments ? 'Audience search' : 'People and memberships'}
    >
      {!compact && (
        <>
          <div className="fd-audience-picker-heading">
            <h3>People &amp; memberships</h3>
          </div>
          <p className="fd-help">
            Include any selection · Eligibility follows the person across organizations.
          </p>
        </>
      )}
      {selectedTargets.length > 0 && (
        <div className="fd-audience-selection">
          <div className="fd-audience-selection-summary" aria-live="polite">
            <strong>{selectedTargets.length} selected</strong>
            <span className="fd-audience-selection-counts">
              {resultKinds.map((kind) => {
                const count = selectedTargets.filter((target) => target.kind === kind).length;
                return count > 0 ? (
                  <span key={kind}>
                    <AudienceIcon kind={kind} />
                    {count}{' '}
                    {count === 1 ? singularLabels[kind].toLowerCase() : labels[kind].toLowerCase()}
                  </span>
                ) : null;
              })}
            </span>
          </div>
          {selectionExpanded && (
            <label className="fd-audience-selection-filter">
              <span className="fd-sr-only">Filter selected targets</span>
              <input
                className="input"
                type="search"
                placeholder="Find a selected target…"
                value={selectionQuery}
                onChange={(event) => setSelectionQuery(event.target.value)}
              />
            </label>
          )}
          <ul
            id={selectionId}
            className="fd-audience-chips"
            data-expanded={selectionExpanded || undefined}
            aria-label={segments ? 'Selected audiences' : 'Selected people and memberships'}
          >
            {visibleTargets.map((target) => {
              return (
                <li key={target.key} aria-label={target.description}>
                  <AudienceIcon kind={target.kind} />
                  <span className="fd-audience-chip-label" title={target.description}>
                    <strong>{target.label}</strong>
                    <span className="fd-help">{target.detail}</span>
                  </span>
                  {canEdit && (target.kind === 'segments' || !directoryDisabled) && (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="fd-audience-remove"
                      aria-label={`Remove ${target.kind === 'segments' ? 'segment ' : ''}${target.email ?? target.label}`}
                      title={`Remove ${target.label}`}
                      onClick={() => {
                        if (target.kind === 'segments') {
                          updateSelection(
                            selected,
                            segmentIds.filter((id) => id !== target.id),
                            true
                          );
                          return;
                        }
                        const next = selected.flatMap((entry, index) => {
                          if (index !== target.audienceIndex) return [entry];
                          const ids = entry.ids.filter((value) => value !== target.id);
                          return ids.length ? [{ ...entry, ids }] : [];
                        });
                        updateSelection(next, segmentIds, true);
                      }}
                    >
                      <Icon name="close" size="sm" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {selectionExpanded && visibleTargets.length === 0 && (
            <p className="fd-help">No selected targets match.</p>
          )}
          {selectedTargets.length > selectionPreviewLimit && (
            <Button
              type="button"
              variant="quiet"
              className="fd-audience-overflow"
              aria-expanded={selectionExpanded}
              aria-controls={selectionId}
              onClick={() => {
                setExpanded(!selectionExpanded);
                setSelectionQuery('');
              }}
            >
              {selectionExpanded
                ? 'Show fewer'
                : `+${selectedTargets.length - selectionPreviewLimit} more · View all`}
            </Button>
          )}
        </div>
      )}
      {undoSelection && canEdit && (
        <div role="status" className="fd-actions">
          Selection removed.
          <Button
            type="button"
            onClick={() => {
              onChange?.(undoSelection.directory, undoSelection.segmentIds);
              setRemoved(null);
            }}
          >
            Undo removal
          </Button>
        </div>
      )}
      {statusError && (
        <Notice tone="warning">
          Directory connection unavailable. Saved selections are preserved. {statusError}
        </Notice>
      )}
      {(!compact || canEdit) && !demoData && !status && !statusError && (
        <p role="status">Loading directory connection…</p>
      )}
      {(!compact || canEdit) && !demoData && status?.status === 'disconnected' && (
        <Notice>BC directory not connected. Saved selections remain intact.</Notice>
      )}
      {(activeBinding || segments) && (
        <>
          {!compact && !demoData && (
            <p className="fd-help">
              BC directory · {status?.status === 'configured' ? status.label : ''} · Authoring
              lookup only
            </p>
          )}
          {canEdit && (
            <>
              <div className="fd-audience-search">
                <label>
                  <span className={compact ? 'fd-sr-only' : undefined}>{searchLabel}</span>
                  <input
                    className="input"
                    type="search"
                    value={query}
                    maxLength={128}
                    placeholder={`${searchLabel}…`}
                    onChange={(event) => clearQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (!demoData) void search();
                      }
                    }}
                  />
                </label>
                {query && (
                  <Button type="button" onClick={() => clearQuery('')}>
                    Clear search
                  </Button>
                )}
              </div>
              {activeBinding && !directoryDisabled && !demoData && query.trim().length === 1 && (
                <p className="fd-help">Enter at least 2 characters to search the directory.</p>
              )}
              <div
                className="fd-audience-matches"
                hidden={query.trim().length < (segments || demoData ? 1 : 2)}
              >
                <div
                  className="fd-actions"
                  role="group"
                  aria-label={segments ? 'Filter audience results' : 'Filter directory results'}
                >
                  {(['all', ...resultKinds] as const).map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      aria-pressed={filter === kind}
                      onClick={() => setFilter(kind)}
                    >
                      {kind === 'all' ? 'All' : labels[kind]}
                    </Button>
                  ))}
                </div>
                <div aria-live="polite" aria-busy={busy}>
                  {busy && <p role="status">Searching directory…</p>}
                  {activeBinding &&
                    !directoryDisabled &&
                    query.trim().length >= (demoData ? 1 : 2) &&
                    kinds
                      .filter((kind) => filter === 'all' || kind === filter)
                      .map((kind) => {
                        const result: Result = demoData
                          ? {
                              items: demoDirectoryItems[kind].filter((item) =>
                                `${item.label} ${item.email ?? ''} ${item.id}`
                                  .toLowerCase()
                                  .includes(query.trim().toLowerCase())
                              ),
                              nextOffset: null,
                              error: '',
                            }
                          : results[kind];
                        const ids = new Set(
                          selected
                            .filter(
                              (entry) =>
                                entry.kind === kind &&
                                entry.sourceId === activeBinding.sourceId &&
                                entry.tenantId === activeBinding.tenantId
                            )
                            .flatMap((entry) => entry.ids)
                        );
                        return (
                          <section
                            className="fd-audience-results"
                            key={kind}
                            aria-label={`${labels[kind]} results`}
                          >
                            {(demoData || searched || result.items.length > 0) && (
                              <>
                                <h4>{labels[kind]}</h4>
                                {!demoData && (
                                  <p className="fd-help">BC directory · Authoring lookup only</p>
                                )}
                              </>
                            )}
                            {result.error && (
                              <Notice tone="warning">
                                {labels[kind]} lookup unavailable. {result.error}
                              </Notice>
                            )}
                            {(demoData || searched) &&
                              !busy &&
                              !result.error &&
                              !result.items.length && (
                                <p>No matching {labels[kind].toLowerCase()}.</p>
                              )}
                            {result.items.map((item) => {
                              const checked = ids.has(item.id);
                              return (
                                <label className="fd-audience-result" key={item.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={
                                      !canSearchDirectory ||
                                      (!checked &&
                                        ((maxTargetBlocks === undefined
                                          ? ids.size >= 20
                                          : selected.length >= maxTargetBlocks &&
                                            ids.size % 20 === 0) ||
                                          (Boolean(segments) &&
                                            selected.length + segmentIds.length >= 20 &&
                                            ids.size === 0)))
                                    }
                                    onChange={(event) =>
                                      changeSelection(kind, item.id, event.target.checked)
                                    }
                                  />
                                  <AudienceIcon kind={kind} />
                                  <span>
                                    <strong>{item.label}</strong>
                                    <span className="fd-help">
                                      {item.email ??
                                        (kind === 'organizations'
                                          ? 'Organization · Members across organizations'
                                          : kind === 'groups'
                                            ? 'Group · Members across organizations'
                                            : 'Person')}{' '}
                                      · ID {item.id}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                            {(maxTargetBlocks === undefined
                              ? ids.size >= 20
                              : selected.length >= maxTargetBlocks && ids.size % 20 === 0) && (
                              <p className="fd-help">
                                {maxTargetBlocks === undefined
                                  ? '20 selections per kind maximum. Existing saved IDs are retained.'
                                  : 'Segment block limit reached. Remove a target block or trait block to add more.'}
                              </p>
                            )}
                            {result.nextOffset !== null && (
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => void search(kind, result.nextOffset!)}
                              >
                                More {labels[kind].toLowerCase()}
                              </Button>
                            )}
                          </section>
                        );
                      })}
                  {segments && (filter === 'all' || filter === 'segments') && (
                    <section className="fd-audience-results" aria-label="Segments results">
                      <h4>Segments</h4>
                      <p className="fd-help">Flightdeck · Published definitions only</p>
                      {matchingSegments.map((segment) => {
                        const checked = segmentIds.includes(segment.id);
                        return (
                          <label className="fd-audience-result" key={segment.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && selected.length + segmentIds.length >= 20}
                              onChange={(event) =>
                                updateSelection(
                                  selected,
                                  event.target.checked
                                    ? [...segmentIds, segment.id]
                                    : segmentIds.filter((id) => id !== segment.id),
                                  !event.target.checked
                                )
                              }
                            />
                            <AudienceIcon kind="segments" />
                            <span>
                              <strong>{segment.name}</strong>
                              <span className="fd-help">
                                Segment · Follows published v{segment.revision} · {segment.key}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                      {!matchingSegments.length && (
                        <p>
                          {segments.options.length
                            ? 'No matching segments.'
                            : 'No published segments. Create and publish one in Segments first.'}
                        </p>
                      )}
                      {selected.length + segmentIds.length >= 20 && (
                        <p className="fd-help">
                          20 audience branches maximum. Remove a selection to add another branch.
                        </p>
                      )}
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
      {resolveError && (
        <Notice tone="warning">
          Some labels could not be resolved. IDs are retained. {resolveError}
        </Notice>
      )}
    </section>
  );
}
