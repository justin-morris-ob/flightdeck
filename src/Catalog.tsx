import type { Role } from '../shared/contracts.ts';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import { Button, Empty, Notice, PageHeader } from '@onebrief/atlas-ui';

import {
  catalogSchema,
  catalogUpdateSchema,
  type Catalog as ProjectCatalog,
} from '../shared/targeting.ts';
import { errorMessage, get, send, type Request } from './api.ts';
import { useDraftNavigation, useDraftSource } from './draft-context.ts';
import { Modal } from './forms.tsx';
import { ConditionsEditor, newCondition } from './TargetingForms.tsx';

interface Props {
  request: Request;
  scope: string;
  projectName: string;
  role: Role;
}

type Draft = z.infer<typeof catalogUpdateSchema>['catalog'];
type SegmentDraft = Draft['segments'][number];
interface Editor {
  segment: SegmentDraft;
  original: SegmentDraft;
  creating: boolean;
}

function input(catalog: ProjectCatalog): Draft {
  return {
    attributes: catalog.attributes,
    segments: catalog.segments.map(({ revision: _revision, ...segment }) => segment),
  };
}

export function Catalog(props: Props) {
  return <CatalogEditor key={props.scope} {...props} />;
}

function CatalogEditor({ request, scope, role }: Props) {
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [version, setVersion] = useState(0);
  const [invalidFields, setInvalidFields] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const readonly = role === 'viewer';
  const { confirmTransition } = useDraftNavigation();
  const dirty = Boolean(
    editor && (invalidFields || JSON.stringify(editor.original) !== JSON.stringify(editor.segment))
  );
  useDraftSource(dirty, close, busy);

  useEffect(() => {
    setInvalidFields(form.current?.matches(':invalid') ?? false);
  }, [editor?.segment]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setCatalog(null);
    setError('');
    get(request, `${scope}/catalog`, catalogSchema)
      .then((result) => {
        if (!current) return;
        setCatalog(result);
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

  function close() {
    setEditor(null);
    setIssues([]);
    setError('');
    setInvalidFields(false);
  }

  function open(segment: SegmentDraft, creating = false) {
    confirmTransition(() => {
      setEditor({ segment, original: segment, creating });
      setError('');
      setIssues([]);
      setSaved('');
      setInvalidFields(false);
    });
  }

  function change(segment: SegmentDraft) {
    if (!editor || readonly || busy) return;
    setEditor({ ...editor, segment });
    setIssues([]);
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || !editor || readonly || busy) return;
    setError('');
    setSaved('');
    const current = input(catalog);
    const parsed = catalogUpdateSchema.safeParse({
      expectedRevision: catalog.revision,
      catalog: {
        attributes: current.attributes,
        segments: editor.creating
          ? [...current.segments, editor.segment]
          : current.segments.map((segment) =>
              segment.id === editor.original.id ? editor.segment : segment
            ),
      },
    });
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      const result = await send(request, `${scope}/catalog`, 'PUT', parsed.data, catalogSchema);
      setCatalog(result);
      setEditor(null);
      setInvalidFields(false);
      setSaved(
        'Segment saved. Editing a segment does not automatically update saved flag targeting.'
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="fd-poc-list" aria-label="Segments">
        <PageHeader
          title="Segments"
          actions={
            <>
              <Button
                disabled={loading || busy}
                onClick={() =>
                  confirmTransition(() => {
                    close();
                    setVersion((value) => value + 1);
                  })
                }
              >
                Reload
              </Button>
              {!readonly && (
                <Button
                  variant="primary"
                  disabled={loading || busy || !catalog || catalog.segments.length >= 50}
                  onClick={() => {
                    if (!catalog) return;
                    open(
                      {
                        id: crypto.randomUUID(),
                        key: '',
                        name: '',
                        conditions: [newCondition(catalog.attributes)],
                      },
                      true
                    );
                  }}
                >
                  Create segment
                </Button>
              )}
            </>
          }
        />
        {!editor && error && <Notice tone="danger">{error}</Notice>}
        {saved && <Notice tone="primary">{saved}</Notice>}
        <div className="fd-poc-card">
          {loading ? (
            <p role="status">Loading segments…</p>
          ) : !catalog ? (
            <Empty>Segments unavailable. Reload to try again.</Empty>
          ) : catalog.segments.length === 0 ? (
            <Empty>
              {readonly
                ? 'No saved segments.'
                : 'No segments yet. Create a segment to reuse an audience across flags.'}
            </Empty>
          ) : (
            <div className="fd-table-wrap">
              <table className="fd-table">
                <caption className="fd-sr-only">Saved segments</caption>
                <thead>
                  <tr>
                    <th scope="col">Segment</th>
                    <th scope="col">Conditions</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.segments.map(({ revision: _revision, ...segment }) => (
                    <tr key={segment.id}>
                      <td>
                        <button
                          className="fd-flag-link"
                          type="button"
                          aria-label={`${readonly ? 'View' : 'Edit'} segment ${segment.name}`}
                          disabled={busy}
                          onClick={() => open(segment)}
                        >
                          {segment.name}
                        </button>
                        <span className="fd-table-sub">{segment.key}</span>
                      </td>
                      <td>
                        {segment.conditions.length}{' '}
                        {segment.conditions.length === 1 ? 'condition' : 'conditions'} · All must
                        match
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {editor && catalog && (
        <Modal
          title={
            readonly ? editor.segment.name : editor.creating ? 'Create segment' : 'Edit segment'
          }
          onClose={() => confirmTransition(close)}
        >
          <form
            ref={form}
            className="fd-form"
            onSubmit={save}
            onChange={() => setInvalidFields(form.current?.matches(':invalid') ?? false)}
          >
            {error && <Notice tone="danger">{error}</Notice>}
            {issues.length > 0 && (
              <Notice tone="danger">
                <ul>
                  {issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <fieldset className="fd-fieldset" disabled={readonly || busy}>
              <legend>Segment details</legend>
              <label>
                Name
                <input
                  className="input"
                  required
                  maxLength={120}
                  value={editor.segment.name}
                  onChange={(event) => change({ ...editor.segment, name: event.target.value })}
                />
              </label>
              <label>
                Segment key
                <input
                  className="input"
                  required
                  maxLength={100}
                  pattern="[a-z][a-z0-9_-]*"
                  readOnly={!editor.creating}
                  value={editor.segment.key}
                  onChange={(event) => change({ ...editor.segment, key: event.target.value })}
                />
              </label>
              {editor.creating && (
                <p className="fd-help">
                  Use lowercase letters, digits, underscores or hyphens, starting with a letter. The
                  key cannot change after creation.
                </p>
              )}
              <ConditionsEditor
                label="Conditions · All must match"
                conditions={editor.segment.conditions}
                attributes={catalog.attributes}
                disabled={readonly || busy}
                onChange={(conditions) => change({ ...editor.segment, conditions })}
              />
            </fieldset>
            <div className="fd-actions">
              <Button type="button" disabled={busy} onClick={() => confirmTransition(close)}>
                {readonly ? 'Close' : 'Cancel'}
              </Button>
              {!readonly && (
                <Button type="submit" variant="primary" disabled={busy || !dirty}>
                  {busy ? 'Saving…' : editor.creating ? 'Create segment' : 'Save segment'}
                </Button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
