import { useEffect, useRef, useState } from 'react';

import { Badge, Button, Notice } from '@onebrief/atlas-ui';

import {
  directoryResolveSchema,
  directorySearchSchema,
  directoryStatusSchema,
  type DirectoryBinding,
  type DirectoryItem,
  type DirectoryKind,
  type DirectoryStatus,
} from '../shared/directory.ts';
import { errorMessage, get, send, type Request } from './api.ts';

export function useDirectoryConnection(request: Request, scope: string) {
  const [status, setStatus] = useState<DirectoryStatus | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setStatus(null);
    setError('');
    get(request, `${scope}/directory`, directoryStatusSchema)
      .then((value) => {
        if (current) setStatus(value);
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope, version]);
  return { status, error, reload: () => setVersion((value) => value + 1) };
}

export function DirectoryConnectionNotice({
  status,
  error,
}: {
  status: DirectoryStatus | null;
  error: string;
}) {
  if (error)
    return (
      <Notice tone="warning">
        Directory connection unavailable. Saved targeting is preserved. {error}
      </Notice>
    );
  if (!status) return <p role="status">Loading directory connection…</p>;
  if (status.status === 'disconnected')
    return (
      <Notice>BC directory not connected. Saved targeting still evaluates supplied context.</Notice>
    );
  return (
    <p className="fd-help">
      <Badge tone="primary">BC directory configured</Badge> {status.label} · Source{' '}
      {status.binding.sourceId} · Tenant {status.binding.tenantId}. Directory access is for
      authoring only.
    </p>
  );
}

interface Props {
  request: Request;
  scope: string;
  kind: DirectoryKind;
  binding: DirectoryBinding;
  ids: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}

export function DirectoryPicker({ request, scope, kind, binding, ids, disabled, onChange }: Props) {
  const label =
    kind === 'people' ? 'People by email' : kind === 'organizations' ? 'Organizations' : 'Groups';
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [resolved, setResolved] = useState<DirectoryItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [removed, setRemoved] = useState<string | null>(null);
  const idsKey = JSON.stringify(ids);
  const searchVersion = useRef(0);
  useEffect(() => {
    searchVersion.current++;
    setItems([]);
    setSearched(false);
    setNextOffset(null);
    setBusy(false);
    setError('');
    return () => {
      searchVersion.current++;
    };
  }, [scope, kind, binding.sourceId, binding.tenantId]);
  useEffect(() => {
    let current = true;
    setResolveError('');
    setResolved([]);
    const selected: string[] = JSON.parse(idsKey);
    if (!selected.length || disabled) return;
    send(
      request,
      `${scope}/directory/resolve`,
      'POST',
      { kind, ids: selected },
      directoryResolveSchema
    )
      .then((value) => {
        if (!current) return;
        if (
          value.sourceId !== binding.sourceId ||
          value.tenantId !== binding.tenantId ||
          value.kind !== kind
        )
          throw new Error('Directory source changed. Saved IDs were retained.');
        setResolved(value.items);
      })
      .catch((cause: unknown) => {
        if (current) setResolveError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope, kind, binding.sourceId, binding.tenantId, idsKey, disabled]);

  async function search(offset = 0) {
    if (busy || disabled || query.trim().length < 2) return;
    const version = ++searchVersion.current;
    setBusy(true);
    setError('');
    setItems([]);
    setNextOffset(null);
    try {
      const value = await get(
        request,
        `${scope}/directory/search?kind=${kind}&q=${encodeURIComponent(query.trim())}&offset=${offset}`,
        directorySearchSchema
      );
      if (version !== searchVersion.current) return;
      if (
        value.sourceId !== binding.sourceId ||
        value.tenantId !== binding.tenantId ||
        value.kind !== kind
      )
        throw new Error('Directory source changed. Search results were not accepted.');
      setItems(value.items);
      setNextOffset(value.nextOffset);
      setSearched(true);
    } catch (cause) {
      if (version !== searchVersion.current) return;
      setError(errorMessage(cause));
      setSearched(false);
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  }

  return (
    <fieldset className="fd-fieldset" disabled={disabled}>
      <legend>{label}</legend>
      <div className="fd-actions">
        <label>
          Search {label.toLowerCase()}
          <input
            className="input"
            type="search"
            value={query}
            maxLength={128}
            placeholder="Enter at least 2 characters"
            onChange={(event) => {
              searchVersion.current++;
              setQuery(event.target.value);
              setBusy(false);
              setError('');
              setItems([]);
              setSearched(false);
              setNextOffset(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <Button
          type="button"
          disabled={busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? 'Searching…' : `Search ${label.toLowerCase()}`}
        </Button>
      </div>
      {error && (
        <Notice tone="warning">
          BC directory unavailable. Saved selections were not changed. {error}
        </Notice>
      )}
      {searched && !items.length && (
        <p>No matching {label.toLowerCase()} in this directory tenant.</p>
      )}
      {items.length > 0 && (
        <ul aria-label={`${label} search results`}>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong> {item.email && <span>{item.email}</span>}
              <Button
                type="button"
                disabled={busy || ids.includes(item.id) || ids.length >= 20}
                onClick={() => onChange([...ids, item.id])}
              >
                Add {item.email ?? item.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {nextOffset !== null && (
        <Button type="button" disabled={busy} onClick={() => void search(nextOffset)}>
          Next {label.toLowerCase()} results
        </Button>
      )}
      {resolveError && (
        <Notice tone="warning">Labels unavailable; saved IDs are preserved. {resolveError}</Notice>
      )}
      <ul aria-label={`Selected ${label.toLowerCase()}`}>
        {ids.map((id) => {
          const item =
            resolved.find((entry) => entry.id === id) ?? items.find((entry) => entry.id === id);
          return (
            <li key={id}>
              <span>
                {item
                  ? `${item.label}${item.email ? ` · ${item.email}` : ''}`
                  : `Unavailable label · ${id}`}
              </span>
              <Button
                type="button"
                onClick={() => {
                  setRemoved(id);
                  onChange(ids.filter((value) => value !== id));
                }}
              >
                Remove {item?.email ?? item?.label ?? id}
              </Button>
            </li>
          );
        })}
      </ul>
      {removed && !ids.includes(removed) && (
        <Button
          type="button"
          disabled={ids.length >= 20}
          onClick={() => {
            onChange([...ids, removed]);
            setRemoved(null);
          }}
        >
          Undo removal
        </Button>
      )}
      <p className="fd-help">
        {ids.length}/20 selected · Stable IDs are saved, not directory membership copies.
      </p>
    </fieldset>
  );
}
