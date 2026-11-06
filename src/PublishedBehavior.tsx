import type { Flag } from '../shared/contracts.ts';
import type { Request } from './api.ts';
import type { ReactNode } from 'react';

import { Badge } from '@onebrief/atlas-ui';

import { readSimpleAudience } from '../shared/simple-targeting.ts';
import { AudiencePicker } from './AudiencePicker.tsx';

export function PublishedBehavior({
  flag,
  environmentName,
  request,
  scope,
  writable,
  gateAction,
  audienceAction,
  exceptionsAction,
  contextPanel,
  editing,
  audienceEditor,
}: {
  flag: Flag;
  environmentName: string;
  request: Request;
  scope: string;
  writable: boolean;
  gateAction: ReactNode;
  audienceAction: ReactNode;
  exceptionsAction: ReactNode;
  contextPanel: ReactNode;
  editing: boolean;
  audienceEditor: ReactNode;
}) {
  const audience = readSimpleAudience(flag.configuration);
  const names =
    audience?.segmentIds.map(
      (id) => flag.configuration.segments.find((segment) => segment.id === id)?.name ?? id
    ) ?? [];
  if (audience)
    names.push(
      ...audience.directoryTargets.map((target) => `${target.ids.length} selected ${target.kind}`)
    );
  return (
    <>
      <section
        className="fd-published-card fd-behavior-panel"
        aria-label={`Published behavior · ${environmentName}`}
      >
        <div className="fd-config-state">
          <h2 className="fd-eyebrow">Published behavior · {environmentName}</h2>
          <Badge tone={flag.archived ? 'warning' : flag.enabled ? 'success' : 'secondary'}>
            {flag.archived ? 'Archived' : flag.enabled ? 'Gate On' : 'Gate Off'}
          </Badge>
        </div>
        <div className="fd-behavior-statement">
          {flag.archived || !flag.enabled ? (
            <>
              <p>
                {flag.archived ? 'Archived: ' : 'Gate Off: '}everyone receives{' '}
                <code>{JSON.stringify(flag.configuration.offValue.value)}</code>.
              </p>
              {audience && (
                <p className="fd-help">
                  Saved audience ·{' '}
                  {audience.mode === 'everyone'
                    ? 'Everyone'
                    : names.length
                      ? names.join(' OR ')
                      : 'Nobody selected'}
                </p>
              )}
            </>
          ) : audience ? (
            audience.mode === 'everyone' ? (
              <p>
                Everyone receives <strong>true</strong>.
              </p>
            ) : (
              <>
                <p>
                  {names.length
                    ? `${names.join(' OR ')} receive true.`
                    : 'Nobody qualifies through audience targeting.'}
                </p>
                <p>
                  Otherwise <strong>false</strong>.
                </p>
              </>
            )
          ) : (
            <>
              <p>
                {flag.configuration.rules.length} ordered rules · {flag.configuration.offValue.type}{' '}
                configuration
              </p>
              <p>
                First eligible rule determines the result. Default:{' '}
                {flag.configuration.defaultOutcome.kind === 'value' ? (
                  <code>{JSON.stringify(flag.configuration.defaultOutcome.value.value)}</code>
                ) : flag.configuration.defaultOutcome.kind === 'variant' ? (
                  `Variant ${flag.configuration.defaultOutcome.variantId}`
                ) : (
                  'Weighted variant assignment'
                )}
                .
              </p>
            </>
          )}
        </div>
        <div className="fd-published-footer fd-behavior-footer">
          <div>
            <p>
              Gate Off → <code>{JSON.stringify(flag.configuration.offValue.value)}</code> for
              everyone.
            </p>
            <p>Flag configuration r{flag.revision} · Published</p>
            {flag.configuration.segments.map((segment) => (
              <p key={segment.id}>
                Following {segment.name} · Current v{segment.revision}
              </p>
            ))}
          </div>
          {gateAction}
        </div>
        <p className="fd-help">
          Publication is configuration, not proof of SDK delivery or exposure.
        </p>
      </section>
      <div className="fd-detail-secondary">
        <section className="fd-published-card fd-audience-panel" aria-label="Audience">
          <div className="fd-config-state">
            <h2>Audience</h2>
            {audienceAction || <Badge>Published</Badge>}
          </div>
          {audienceEditor}
          <div className="fd-audience-snapshot" hidden={editing}>
            {audience ? (
              audience.mode === 'everyone' ? (
                <p>Everyone · No audience restriction</p>
              ) : !names.length ? (
                <p>No audiences selected · Nobody qualifies through audience targeting.</p>
              ) : (
                <>
                  <ul className="fd-published-audiences">
                    {audience.segmentIds.map((id) => {
                      const segment = flag.configuration.segments.find((item) => item.id === id);
                      return (
                        <li key={id}>
                          <strong>{segment?.name ?? id}</strong>
                          <span className="fd-table-sub">
                            Follows published segment
                            {segment ? ` · Current v${segment.revision}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {audience.directoryTargets.length > 0 && (
                    <AudiencePicker
                      request={request}
                      scope={scope}
                      selected={audience.directoryTargets}
                      disabled={!writable}
                      readOnly
                      compact
                    />
                  )}
                </>
              )
            ) : (
              <ol className="fd-published-audiences">
                {flag.configuration.rules.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.name}</strong>
                    <span className="fd-table-sub">
                      {rule.conditions.length} conditions · {rule.segmentIds.length} segment
                      references · {rule.rolloutBasisPoints / 100}% rollout · {rule.outcome.kind}{' '}
                      outcome
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {audience && (
              <p className="fd-help">
                {audience.mode === 'everyone'
                  ? 'Everyone → true while the gate is On.'
                  : 'While the gate is On · Matching audience → true · Otherwise → false.'}
              </p>
            )}
            <details>
              <summary>Inspect full published configuration</summary>
              <p className="fd-help">
                Read-only ordered rules, predicates, typed values and variant payloads. This is
                saved configuration, not an evaluated audience estimate.
              </p>
              <p className="fd-help">
                {environmentName} remains unchanged while editing. People and memberships qualify
                across organizations within their trusted tenant/source.
              </p>
              <pre>{JSON.stringify(flag.configuration, null, 2)}</pre>
            </details>
          </div>
          <div className="fd-published-footer fd-audience-footer">
            <p className="fd-help">Exceptions take precedence while the gate is On.</p>
            {exceptionsAction}
          </div>
        </section>
        {contextPanel}
      </div>
    </>
  );
}
