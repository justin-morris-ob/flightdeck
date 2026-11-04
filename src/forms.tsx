import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button, Notice } from '@onebrief/atlas-ui';

import { createFlagSchema, type Flag } from '../shared/contracts.ts';
import { errorMessage } from './api.ts';

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
    <dialog ref={dialog} className="fd-modal" aria-labelledby={titleId} onCancel={onClose}>
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
  onSave: (data: {
    key: string;
    name: string;
    description: string;
    owner: string;
  }) => Promise<void>;
}

export function FlagForm({ flag, busy, onCancel, onSave }: FlagFormProps) {
  const id = useId();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form className="fd-form" onSubmit={submit}>
      {error && <Notice tone="danger">{error}</Notice>}
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
        />
      </label>
      <label htmlFor={`${id}-key`}>
        Flag key
        <input
          id={`${id}-key`}
          name="key"
          className="input fd-mono"
          required
          maxLength={100}
          pattern="[a-z][a-z0-9_-]*"
          readOnly={Boolean(flag)}
          defaultValue={flag?.key}
          aria-describedby={`${id}-key-help`}
        />
      </label>
      <p id={`${id}-key-help`} className="fd-help">
        Immutable identifier · lowercase letters, digits, underscores and hyphens. Start with a
        letter.
      </p>
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
      <p className="fd-help">
        {flag
          ? `Metadata applies to every environment. Saving publishes the next global revision after r${flag.revision}.`
          : 'Created disabled in every project environment. No rollout or targeting rules are applied.'}
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
