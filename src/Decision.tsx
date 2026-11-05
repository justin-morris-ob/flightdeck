import type { Evaluation } from '../shared/contracts.ts';

import { Badge, Properties } from '@onebrief/atlas-ui';

import { ValueDisplay } from './TargetingForms.tsx';

export function Decision({ decision, title }: { decision: Evaluation; title: string }) {
  return (
    <section className="fd-decision-panel" aria-label={title}>
      <h3>{title}</h3>
      <ValueDisplay value={decision.value} />
      <Properties
        items={[
          [
            'Environment gate',
            <Badge tone={decision.enabled ? 'success' : 'secondary'}>
              {decision.enabled ? 'Enabled' : 'Disabled'}
            </Badge>,
          ],
          ['Reason', decision.reason],
          ['Flag revision', `r${decision.revision}`],
          ['Pinned catalog', `r${decision.catalogRevision}`],
          ['Matched rule', decision.matchedRuleId ?? 'None'],
          ['Variant', decision.variantId ?? 'None · fixed value'],
          ['Subject override', decision.matchedOverrideId ?? 'None'],
        ]}
      />
      <details>
        <summary>Decision trace · {decision.trace.length} steps</summary>
        {decision.trace.length ? (
          <ol className="fd-trace">
            {decision.trace.map((step, index) => (
              <li key={index}>
                <strong>{step.source}</strong> · {step.code}
                {step.id && (
                  <>
                    {' '}
                    · <code>{step.id}</code>
                  </>
                )}
                {step.attribute && (
                  <>
                    {' '}
                    · Attribute <code>{step.attribute}</code>
                  </>
                )}
                {step.bucket !== undefined && <> · Bucket {step.bucket} / 10000</>}
              </li>
            ))}
          </ol>
        ) : (
          <p>No trace steps.</p>
        )}
        <p className="fd-help">
          Trace excludes raw context values. An enabled gate may select boolean false; assignment is
          not exposure, experiment results, authorization or entitlement.
        </p>
      </details>
    </section>
  );
}
