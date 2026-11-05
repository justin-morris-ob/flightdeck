import type { z } from 'zod';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import { flagSchema, type Flag } from '../shared/contracts.ts';
import {
  createOverrideSchema,
  overridesSchema,
  type Outcome,
  type SubjectOverride,
} from '../shared/targeting.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { useDraftNavigation, useDraftSource } from './draft-context.ts';
import { Confirm } from './forms.tsx';
import { OutcomeEditor, ValueDisplay } from './TargetingForms.tsx';

interface Props {
  request: Request;
  path: string;
  flag: Flag;
  writable: boolean;
  environmentName: string;
  onChanged: (flag: Flag) => void;
}

type Creation = z.infer<typeof createOverrideSchema>;

export function Overrides({ request, path, flag, writable, environmentName, onChanged }: Props) {
  const id = useId();
  const [items, setItems] = useState<SubjectOverride[]>([]);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({
    kind: 'value',
    value: flag.configuration.offValue,
  });
  const [creation, setCreation] = useState<Creation | null>(null);
  const [revocation, setRevocation] = useState<{
    item: SubjectOverride;
    expectedRevision: number;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const [dirtyFields, setDirtyFields] = useState(false);
  const [invalidOutcomeFields, setInvalidOutcomeFields] = useState(false);
  const [writing, setWriting] = useState(false);
  const { confirmTransition } = useDraftNavigation();
  const dirty =
    dirtyFields ||
    invalidOutcomeFields ||
    JSON.stringify(outcome) !==
      JSON.stringify({ kind: 'value', value: flag.configuration.offValue });
  const sourceId = useDraftSource(dirty, discard, refreshing || writing);
  const after = cursors[cursors.length - 1];

  useEffect(() => {
    setCursors([null]);
    discard();
  }, [path]);

  useEffect(formChanged, [outcome]);

  function discard() {
    setCreation(null);
    setRevocation(null);
    setOutcome({ kind: 'value', value: flag.configuration.offValue });
    setFormKey((key) => key + 1);
    setFormError('');
    setDirtyFields(false);
    setInvalidOutcomeFields(false);
  }

  function formChanged() {
    if (!form.current) return;
    const data = new FormData(form.current);
    setDirtyFields(
      ['tenantId', 'subjectId', 'owner', 'reason', 'expiresAt'].some(
        (field) => String(data.get(field) ?? '') !== ''
      )
    );
    setInvalidOutcomeFields(
      Array.from(
        form.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input:not([name]), select:not([name]), textarea:not([name])'
        )
      ).some((field) => !field.validity.valid)
    );
  }

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setItems([]);
    setNextCursor(null);
    void get(
      request,
      `${path}/overrides?limit=20${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      overridesSchema
    )
      .then((page) => {
        if (current) {
          setItems(page.items);
          setNextCursor(page.nextCursor);
        }
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
  }, [request, path, after, refresh, flag.revision]);

  async function reload() {
    setRefreshing(true);
    setError('');
    try {
      const latest = await get(request, path, flagSchema);
      onChanged(latest);
      setCursors([null]);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);
    const expiry = new Date(String(data.get('expiresAt')));
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      setFormError('Expiry must be a valid future local date and time.');
      return;
    }
    const parsed = createOverrideSchema.safeParse({
      expectedRevision: flag.revision,
      override: {
        tenantId: data.get('tenantId'),
        subjectId: data.get('subjectId'),
        owner: data.get('owner'),
        reason: data.get('reason'),
        expiresAt: expiry.toISOString(),
        outcome,
      },
    });
    if (!parsed.success) {
      setFormError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
      );
      return;
    }
    if (outcome.kind === 'value' && outcome.value.type !== flag.configuration.offValue.type) {
      setFormError('Outcome type must match the current configuration. Select a matching value.');
      return;
    }
    confirmTransition(() => setCreation(parsed.data), sourceId);
  }

  function changed(updated: Flag) {
    onChanged(updated);
    setCursors([null]);
    setRefresh((value) => value + 1);
  }

  function displayOutcome(value: SubjectOverride['outcome']) {
    if (value.kind === 'value')
      return (
        <>
          <span>Fixed value · {value.value.type}</span>
          <ValueDisplay value={value.value} />
        </>
      );
    const variant = flag.configuration.variants.find((entry) => entry.id === value.variantId);
    return (
      <>
        <span>
          Fixed variant · {value.variantId}
          {variant
            ? ` · ${variant.name} · ${variant.value.type}`
            : ' · not in current configuration'}
        </span>
        {variant && <ValueDisplay value={variant.value} />}
      </>
    );
  }

  return (
    <section className="fd-form" aria-label="Subject overrides">
      <h3>Subject overrides · {environmentName}</h3>
      <p className="fd-help">
        Priority: archived → environment disabled → active exact tenant/subject override → rules →
        default. Archive and disable always return the off value, even with an override.
      </p>
      <p className="fd-help">
        One non-revoked override per exact tenant/subject in this flag and environment. Expired
        overrides must be revoked before replacement. Changes create server audit entries in flag
        activity.
      </p>
      {!writable && (
        <Notice tone="primary">Read-only access. You can inspect all overrides.</Notice>
      )}
      <div className="fd-actions">
        <Button
          onClick={() => confirmTransition(() => void reload())}
          disabled={loading || refreshing || writing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh overrides and flag revision'}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading ? (
        <p role="status">Loading overrides…</p>
      ) : (
        !error &&
        (items.length === 0 ? (
          <p>No overrides on this page.</p>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <caption>Environment overrides · page {cursors.length} · at most 20 per page</caption>
              <thead>
                <tr>
                  <th>Tenant / subject</th>
                  <th>Owner / reason</th>
                  <th>Outcome</th>
                  <th>Expiry / status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expired = new Date(item.expiresAt).getTime() <= Date.now();
                  return (
                    <tr key={item.id}>
                      <td>
                        <div>{item.tenantId}</div>
                        <div>{item.subjectId}</div>
                        <small>{item.id}</small>
                      </td>
                      <td>
                        <div>{item.owner}</div>
                        <div>{item.reason}</div>
                        <small>Created {dateTime(item.createdAt)}</small>
                      </td>
                      <td>{displayOutcome(item.outcome)}</td>
                      <td>
                        <div>{dateTime(item.expiresAt)}</div>
                        <div>Expired: {expired ? 'yes' : 'no'}</div>
                        <div>Revoked: {item.revokedAt ? dateTime(item.revokedAt) : 'no'}</div>
                      </td>
                      <td>
                        {writable && !item.revokedAt ? (
                          <Button
                            onClick={() =>
                              confirmTransition(() =>
                                setRevocation({ item, expectedRevision: flag.revision })
                              )
                            }
                          >
                            Revoke
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
      <div className="fd-actions">
        <Button
          disabled={loading || cursors.length <= 1}
          onClick={() => setCursors((values) => values.slice(0, -1))}
        >
          Previous page
        </Button>
        <Button
          disabled={loading || !nextCursor || Boolean(error)}
          onClick={() => {
            if (nextCursor) setCursors((values) => [...values, nextCursor]);
          }}
        >
          Next page
        </Button>
      </div>
      {writable && (
        <form
          key={`${path}-${formKey}`}
          ref={form}
          className="fd-form"
          onSubmit={prepare}
          onChange={formChanged}
        >
          <h4>Create exact subject override</h4>
          {formError && <Notice tone="danger">{formError}</Notice>}
          <fieldset className="fd-fieldset" disabled={Boolean(creation) || writing}>
            <legend>
              Target · {flag.key} · {environmentName}
            </legend>
            <div className="fd-inline-fields">
              <label htmlFor={`${id}-tenant`}>
                Tenant ID
                <input
                  id={`${id}-tenant`}
                  className="input"
                  name="tenantId"
                  required
                  maxLength={200}
                />
              </label>
              <label htmlFor={`${id}-subject`}>
                Subject ID
                <input
                  id={`${id}-subject`}
                  className="input"
                  name="subjectId"
                  required
                  maxLength={200}
                />
              </label>
            </div>
            <label htmlFor={`${id}-owner`}>
              Owner
              <input id={`${id}-owner`} className="input" name="owner" required maxLength={120} />
            </label>
            <label htmlFor={`${id}-reason`}>
              Reason
              <textarea
                id={`${id}-reason`}
                className="textarea"
                name="reason"
                required
                maxLength={500}
              />
            </label>
            <label htmlFor={`${id}-expiry`}>
              Expiry (your local time)
              <input
                id={`${id}-expiry`}
                className="input"
                name="expiresAt"
                type="datetime-local"
                required
              />
            </label>
            <p className="fd-help">
              Expiry is converted to UTC before saving. Only fixed values or fixed variants are
              allowed.
            </p>
            <OutcomeEditor
              label="Override outcome"
              outcome={outcome}
              type={flag.configuration.offValue.type}
              variants={flag.configuration.variants}
              onChange={setOutcome}
              weighted={false}
            />
          </fieldset>
          <div className="fd-actions">
            <Button type="submit" variant="primary" disabled={Boolean(creation) || writing}>
              Review override
            </Button>
          </div>
        </form>
      )}
      {writable && creation && (
        <Confirm
          title="Confirm subject override"
          action="Create override"
          onClose={() => setCreation(null)}
          onConfirm={async () => {
            setWriting(true);
            try {
              const updated = await send(
                request,
                `${path}/overrides`,
                'POST',
                creation,
                flagSchema
              );
              discard();
              changed(updated);
            } finally {
              setWriting(false);
            }
          }}
        >
          <p>
            Create an override for flag <strong>{flag.key}</strong> in environment{' '}
            <strong>{environmentName}</strong> (project {flag.projectId}, environment{' '}
            {flag.environmentId}) at revision {creation.expectedRevision}.
          </p>
          <p>
            Tenant: {creation.override.tenantId} · Subject: {creation.override.subjectId}
          </p>
          <p>
            Owner: {creation.override.owner} · Reason: {creation.override.reason}
          </p>
          <p>
            Expires: {dateTime(creation.override.expiresAt)} · {creation.override.expiresAt}
          </p>
          <div>{displayOutcome(creation.override.outcome)}</div>
          <p>Archive and environment disable take precedence. This action is audited.</p>
        </Confirm>
      )}
      {writable && revocation && (
        <Confirm
          title="Revoke subject override"
          action="Revoke override"
          onClose={() => setRevocation(null)}
          onConfirm={async () => {
            setWriting(true);
            try {
              const updated = await send(
                request,
                `${path}/overrides/${encodeURIComponent(revocation.item.id)}/revoke`,
                'POST',
                { expectedRevision: revocation.expectedRevision },
                flagSchema
              );
              changed(updated);
            } finally {
              setWriting(false);
            }
          }}
        >
          <p>
            Revoke override {revocation.item.id} for <strong>{flag.key}</strong> in{' '}
            <strong>{environmentName}</strong> (project {flag.projectId}, environment{' '}
            {flag.environmentId}) at revision {revocation.expectedRevision}?
          </p>
          <p>
            Tenant: {revocation.item.tenantId} · Subject: {revocation.item.subjectId}
          </p>
          <p>
            The subject will fall through to rules/default unless the flag is archived or disabled.
            This action is audited.
          </p>
        </Confirm>
      )}
    </section>
  );
}
