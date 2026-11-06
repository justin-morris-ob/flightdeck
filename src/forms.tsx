import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import { createFlagSchema, type Flag } from '../shared/contracts.ts';
import { errorMessage } from './api.ts';
import { lifecycleLabels } from './lifecycle.ts';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="fd-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="fd-modal-head">
        <h2 id={titleId}>{title}</h2>
        <Button aria-label="Close dialog" onClick={onClose}>
          Close
        </Button>
      </div>
      {children}
    </dialog>
  );
}

interface FlagFormProps {
  flag?: Flag;
  busy: boolean;
  onCancel: () => void;
  environmentName?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (data: {
    key: string;
    name: string;
    description: string;
    owner: string;
    lifecycle: Flag['lifecycle'];
  }) => Promise<void>;
}
const lifecycleGroups = [
  {
    title: 'Delivery · Temporary',
    help: 'Typical path · Development → Release',
    options: [
      { value: 'development', description: 'Build and test before controlled release.' },
      { value: 'release', description: 'Roll out to an audience, then review for removal.' },
    ],
  },
  {
    title: 'Long-lived',
    help: 'No delivery progression or automatic age-based cleanup.',
    options: [
      { value: 'system', description: 'Ongoing operational behavior or system control.' },
      { value: 'permissions', description: 'Ongoing feature eligibility or entitlement.' },
    ],
  },
] as const;

export function FlagForm({
  flag,
  busy,
  environmentName,
  onCancel,
  onSave,
  onDirtyChange,
}: FlagFormProps) {
  const id = useId();
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const initialValues = useRef('');
  const keyInput = useRef<HTMLInputElement>(null);
  const customKey = useRef(false);
  useEffect(() => {
    if (form.current) initialValues.current = JSON.stringify([...new FormData(form.current)]);
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const data = new FormData(event.currentTarget);
    const parsed = createFlagSchema.safeParse(Object.fromEntries(data.entries()));
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
      );
      return;
    }
    try {
      await onSave(parsed.data);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <form
      ref={form}
      className="fd-form"
      onSubmit={submit}
      onChange={(event) =>
        onDirtyChange?.(
          JSON.stringify([...new FormData(event.currentTarget)]) !== initialValues.current
        )
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="fd-flag-identity">
        <label htmlFor={`${id}-name`}>
          Name
          <input
            id={`${id}-name`}
            name="name"
            className="input"
            required
            maxLength={120}
            defaultValue={flag?.name}
            autoFocus
            onChange={(event) => {
              if (flag || customKey.current || !keyInput.current) return;
              keyInput.current.value = event.target.value
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '_')
                .replace(/^[^a-z]+/, '')
                .slice(0, 100);
            }}
          />
        </label>
        <div>
          <label htmlFor={`${id}-key`}>
            Flag key
            <input
              id={`${id}-key`}
              ref={keyInput}
              name="key"
              className="input fd-mono"
              required
              maxLength={100}
              pattern="[a-z][a-z0-9_-]*"
              readOnly={Boolean(flag)}
              defaultValue={flag?.key}
              aria-describedby={`${id}-key-help`}
              onChange={() => {
                customKey.current = true;
              }}
            />
          </label>
          <p id={`${id}-key-help`} className="fd-help">
            Lowercase letters, digits, underscores and hyphens; start with a letter.
            {!flag && ' Generated from Name until you edit it. Immutable after creation.'}
          </p>
        </div>
      </div>
      <label htmlFor={`${id}-owner`}>
        Owner
        <input
          id={`${id}-owner`}
          name="owner"
          className="input"
          required
          maxLength={120}
          defaultValue={flag?.owner}
        />
      </label>
      <label htmlFor={`${id}-description`}>
        Description
        <textarea
          id={`${id}-description`}
          name="description"
          className="textarea"
          rows={4}
          maxLength={1000}
          defaultValue={flag?.description ?? ''}
        />
      </label>
      {!flag && (
        <fieldset className="fd-fieldset fd-lifecycle-options">
          <legend>Lifecycle</legend>
          <p className="fd-help">Default · Development</p>
          <div className="fd-lifecycle-groups">
            {lifecycleGroups.map((group, index) => (
              <section
                className="fd-lifecycle-group"
                key={group.title}
                aria-labelledby={`${id}-lifecycle-group-${index}`}
              >
                <h3 id={`${id}-lifecycle-group-${index}`}>{group.title}</h3>
                {group.options.map(({ value, description }) => (
                  <label className="fd-lifecycle-card" key={value}>
                    <input
                      type="radio"
                      name="lifecycle"
                      value={value}
                      defaultChecked={value === 'development'}
                    />
                    <span>
                      <strong>{lifecycleLabels[value]}</strong>
                      <span className="fd-table-sub">{description}</span>
                    </span>
                  </label>
                ))}
                <p className="fd-help">{group.help}</p>
              </section>
            ))}
          </div>
        </fieldset>
      )}
      <p className="fd-help">
        {flag
          ? `Metadata is local to ${environmentName ?? 'this environment'}. Current configuration revision: ${flag.revision}.`
          : `Created Off in ${environmentName ?? 'this environment'} only. Lifecycle does not activate a flag or select an audience.`}
      </p>
      <div className="fd-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : flag ? 'Save metadata' : 'Create flag'}
        </Button>
      </div>
    </form>
  );
}

interface ConfirmProps {
  title: string;
  children: ReactNode;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function Confirm({ title, children, action, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="fd-form">
        {error && <Notice tone="danger">{error}</Notice>}
        {children}
        <div className="fd-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Saving…' : action}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
