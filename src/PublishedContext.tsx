import type { z } from 'zod';

import { useEffect, useRef, useState } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import { previewSchema, type Flag } from '../shared/contracts.ts';
import { previewRequestSchema } from '../shared/targeting.ts';
import { errorMessage, send, type Request } from './api.ts';
import { Decision } from './Decision.tsx';
type Preview = z.infer<typeof previewSchema>;
export function PublishedContext({
  request,
  path,
  flag,
}: {
  request: Request;
  path: string;
  flag: Flag;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setResult(null);
    setError('');
    setBusy(false);
  }, [path, flag.revision, flag.configuration]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    []
  );
  return (
    <section className="fd-published-card fd-context-panel" aria-label="Test a context">
      <h2>Test a context</h2>
      <p className="fd-help">
        Synthetic input · No directory lookup · Published configuration only
      </p>
      <form
        className="fd-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const current = ++sequence.current;
          setResult(null);
          setError('');
          setBusy(true);
          try {
            const input = previewRequestSchema.parse({
              expectedRevision: flag.revision,
              context: JSON.parse(text),
            });
            const next = await send(request, `${path}/preview`, 'POST', input, previewSchema);
            if (current === sequence.current) setResult(next);
          } catch (cause) {
            if (current === sequence.current) setError(errorMessage(cause));
          } finally {
            if (current === sequence.current) setBusy(false);
          }
        }}
      >
        <label>
          Evaluation context (JSON)
          <textarea
            className="textarea fd-mono"
            rows={4}
            placeholder={'{"tenantId":"…","subjectId":"…","attributes":{}}'}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              sequence.current++;
              setResult(null);
              setError('');
              setBusy(false);
            }}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
          {busy ? 'Evaluating…' : 'Evaluate published'}
        </Button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {result ? (
        <Decision decision={result.current} title="Published decision · This context only" />
      ) : (
        !error && <p className="fd-help">No result until a context is supplied and evaluated.</p>
      )}
    </section>
  );
}
