import '@onebrief/ux-kit/styles.css';
import '@onebrief/atlas-ui/styles.css';
import './styles.css';

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Badge, Button, Card, Notice } from '@onebrief/atlas-ui';

import {
  demoFlags,
  demoPersonas,
  demoResultSchema,
  demoScenarios,
  type DemoRequest,
  type DemoResult,
} from './contracts.ts';

const plans = ['Alpha readiness brief', 'Coastal response brief', 'Training overview'];
function ConsumerDemo() {
  const [selection, setSelection] = useState<DemoRequest>({
    personaId: 'pilot',
    flagKey: 'bc-homepage-title-filter',
    scenario: 'live',
  });
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(false);
  const requestVersion = useRef(0);
  function change(next: Partial<DemoRequest>) {
    requestVersion.current += 1;
    setSelection((previous) => ({ ...previous, ...next }));
    setResult(null);
    setError('');
    setQuery('');
    setBusy(false);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  async function evaluate() {
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    setResult(null);
    setQuery('');
    try {
      const response = await fetch('/api/demo/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'Consumer evaluation failed.';
        throw new Error(message);
      }
      const parsed = demoResultSchema.parse(payload);
      if (version === requestVersion.current) setResult(parsed);
    } catch (cause) {
      if (version === requestVersion.current)
        setError(cause instanceof Error ? cause.message : 'Consumer evaluation failed.');
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  const filterEnabled = result?.flagKey === 'bc-homepage-title-filter' && result.value === true;
  const visible = filterEnabled
    ? plans.filter((plan) => plan.toLowerCase().includes(query.trim().toLowerCase()))
    : plans;
  return (
    <main className="consumer-demo">
      <header className="demo-heading">
        <div>
          <p className="demo-eyebrow">Flightdeck · OpenFeature consumer</p>
          <h1>Consumer contract lab</h1>
          <p>Exercise a real backend-to-Flightdeck evaluation without browser credentials.</p>
        </div>
        <Button onClick={() => setDark(!dark)}>{dark ? 'Light theme' : 'Dark theme'}</Button>
      </header>
      <Notice tone="warning">
        Local demonstration only. All people, memberships and briefs below are synthetic. This is
        not BC sign-in or a directory connection.
      </Notice>
      <div className="demo-grid">
        <section className="demo-controls">
          <Card
            title="Evaluate as a consumer"
            meta="Only known scenario IDs cross the browser boundary. The demo backend constructs the context."
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void evaluate();
              }}
            >
              <label>
                Demo person
                <select
                  className="input"
                  value={selection.personaId}
                  onChange={(event) =>
                    change({ personaId: event.target.value as DemoRequest['personaId'] })
                  }
                >
                  {demoPersonas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Capability
                <select
                  className="input"
                  value={selection.flagKey}
                  onChange={(event) =>
                    change({ flagKey: event.target.value as DemoRequest['flagKey'] })
                  }
                >
                  {demoFlags.map((flag) => (
                    <option key={flag.key} value={flag.key}>
                      {flag.name} · {flag.type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Service scenario
                <select
                  className="input"
                  value={selection.scenario}
                  onChange={(event) =>
                    change({ scenario: event.target.value as DemoRequest['scenario'] })
                  }
                >
                  {demoScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Evaluating…' : 'Evaluate capability'}
              </Button>
            </form>
            <p>
              Each click evaluates afresh. No decision cache, retries, directory calls or exposure
              events.
            </p>
            <p>
              Unavailable and malformed-response scenarios use an explicitly simulated transport.
              Denied-tenant and invalid-credential scenarios call the real Flightdeck service.
            </p>
          </Card>
          {result && (
            <Card
              title="Backend-owned context"
              meta="Canonical subject, fixed source and tenant binding, effective memberships. No singular current organization is asserted."
            >
              <pre>{JSON.stringify(result.context, null, 2)}</pre>
            </Card>
          )}
        </section>
        <section className="demo-surface" aria-live="polite">
          {error && <Notice tone="danger">{error}</Notice>}
          {!result && !error && (
            <Notice>
              Choose a person and evaluate to load the consumer view. Changing the person,
              capability or scenario clears the previous decision.
            </Notice>
          )}
          {result && (
            <>
              <Card
                title="Evaluation result"
                status={
                  <Badge tone={result.errorCode ? 'warning' : 'success'}>
                    {result.errorCode
                      ? 'Caller fallback · not a service decision'
                      : 'Live service decision'}
                  </Badge>
                }
              >
                <div className="demo-value">{JSON.stringify(result.value)}</div>
                <dl>
                  <dt>Reason</dt>
                  <dd>{result.reason}</dd>
                  <dt>Flag</dt>
                  <dd>
                    <code>{result.flagKey}</code>
                  </dd>
                  <dt>Revision</dt>
                  <dd>{String(result.metadata.revision ?? 'None · fallback')}</dd>
                  <dt>Error</dt>
                  <dd>{result.errorCode ?? 'None'}</dd>
                </dl>
                {result.errorCode && (
                  <Notice tone="warning">
                    The caller default is deliberate for this demonstration, not a successful false
                    evaluation. Authorization and rejected-context errors are blocked instead.
                  </Notice>
                )}
                <details>
                  <summary>Provider metadata</summary>
                  <pre>{JSON.stringify(result.metadata, null, 2)}</pre>
                </details>
              </Card>
              {selection.flagKey === 'bc-homepage-title-filter' ? (
                <Card
                  title="Brief workspace"
                  meta="A small consumer surface modeled on the selected BC homepage feature. These are not actual BC records."
                >
                  {filterEnabled ? (
                    <label>
                      Filter briefs by title
                      <input
                        className="input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Try Alpha"
                      />
                    </label>
                  ) : (
                    <p>
                      Title filtering is unavailable for this decision; the existing brief list is
                      preserved.
                    </p>
                  )}
                  <ul>
                    {visible.map((plan) => (
                      <li key={plan}>{plan}</li>
                    ))}
                  </ul>
                  {visible.length === 0 && (
                    <p>No matching briefs. Clear the filter to restore the list.</p>
                  )}
                </Card>
              ) : (
                <Card title="Typed configuration consumed">
                  <pre>{JSON.stringify(result.value, null, 2)}</pre>
                  <p>
                    The value came through the actual OpenFeature typed detail API, with the caller
                    default identified separately on errors.
                  </p>
                </Card>
              )}
            </>
          )}
        </section>
      </div>
      <footer>
        <a href="http://localhost:4721" target="_blank" rel="noreferrer">
          Open Flightdeck management
        </a>
        <span>
          Demo flags live in Sandbox / Development. Managed updates take effect on the next
          evaluation.
        </span>
      </footer>
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Consumer demo root is missing');
createRoot(root).render(<ConsumerDemo />);
