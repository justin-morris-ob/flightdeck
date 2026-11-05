import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  Badge,
  Button,
  CollectionPage,
  Empty,
  Notice,
  Notices,
  PageHeader,
} from '@onebrief/atlas-ui';

import {
  createCredentialSchema,
  credentialsSchema,
  issuedCredentialSchema,
} from '../shared/contracts.ts';
import { dateTime, errorMessage, get, send, type Request } from './api.ts';
import { Confirm, Modal } from './forms.tsx';

interface Props {
  request: Request;
  scope: string;
  projectName: string;
  environmentName: string;
}
type Credential = z.infer<typeof credentialsSchema>['items'][number];

export function Credentials({ request, scope, projectName, environmentName }: Props) {
  const [items, setItems] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Credential | null>(null);
  const [issued, setIssued] = useState<{ token: string; name: string } | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    get(request, `${scope}/credentials`, credentialsSchema)
      .then((result) => {
        if (current) setItems(result.items);
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
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const parsed = createCredentialSchema.safeParse({
      name: data.get('name'),
      allowedTenantIds: String(data.get('allowedTenantIds') ?? '')
        .split(/[,\n]/)
        .map((tenant) => tenant.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
      );
      return;
    }
    setBusy(true);
    try {
      const result = await send(
        request,
        `${scope}/credentials`,
        'POST',
        parsed.data,
        issuedCredentialSchema
      );
      setCreating(false);
      setIssued({ token: result.token, name: result.credential.name });
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <CollectionPage
        title="Evaluation credentials"
        icon="approval"
        header={
          <PageHeader
            title="Evaluation credentials"
            crumbs={[projectName, environmentName]}
            meta="Administrator access · Read-only service evaluation"
            actions={
              <>
                <Button onClick={() => setVersion((value) => value + 1)}>Refresh</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setError('');
                    setCreating(true);
                  }}
                >
                  Create credential
                </Button>
              </>
            }
          />
        }
        notices={
          <Notices>
            {error && <Notice tone="danger">{error}</Notice>}
            <Notice>
              Local development credentials · Never place tokens in browser application code. A
              credential is restricted to this project, environment and explicit tenant grant list
              and cannot manage flags.
            </Notice>
          </Notices>
        }
      >
        {loading ? (
          <p role="status">Loading credentials…</p>
        ) : items.length === 0 ? (
          <Empty>No credentials in this scope. Create one for a trusted backend consumer.</Empty>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <caption className="fd-sr-only">
                Credentials for {projectName} · {environmentName}
              </caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th scope="col">Allowed tenant IDs</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span className="fd-table-sub fd-mono">{item.id}</span>
                    </td>
                    <td>
                      <Badge tone={item.revokedAt ? 'warning' : 'success'}>
                        {item.revokedAt ? 'Revoked' : 'Active'}
                      </Badge>
                    </td>
                    <td>
                      <ul>
                        {item.allowedTenantIds.map((tenant) => (
                          <li key={tenant}>
                            <code>{tenant}</code>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
                    </td>
                    <td>
                      {!item.revokedAt && <Button onClick={() => setRevoke(item)}>Revoke</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollectionPage>
      {creating && (
        <Modal
          title="Create evaluation credential"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form className="fd-form" onSubmit={create}>
            {error && <Notice tone="danger">{error}</Notice>}
            <p>
              {projectName} · {environmentName} · Evaluation read-only
            </p>
            <label>
              Credential name
              <input className="input" name="name" maxLength={120} required autoFocus />
            </label>
            <label>
              Allowed tenant IDs (comma or newline separated)
              <textarea
                className="textarea fd-mono"
                name="allowedTenantIds"
                rows={3}
                required
                placeholder="local-tenant"
              />
            </label>
            <p className="fd-help">
              1–20 unique, explicit tenant grants. No wildcard. The trusted backend must send one of
              these tenant IDs in each POST evaluation context; targeting is not an authorization or
              entitlement substitute.
            </p>
            <div className="fd-actions">
              <Button onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create credential'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {issued && (
        <Modal title="Save your credential now" onClose={() => setIssued(null)}>
          <div className="fd-form">
            <Notice>
              This token is shown once. Closing this dialog permanently hides it. Store it in the
              backend consumer’s secret store, not browser storage.
            </Notice>
            <label>
              {issued.name}
              <textarea
                className="textarea fd-mono"
                readOnly
                rows={3}
                value={issued.token}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <p className="fd-help">
              {projectName} · {environmentName} · No management permissions
            </p>
            <div className="fd-actions">
              <Button variant="primary" onClick={() => setIssued(null)}>
                I saved the token · Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {revoke && (
        <Confirm
          title="Revoke credential?"
          action="Revoke credential"
          onClose={() => setRevoke(null)}
          onConfirm={async () => {
            await request(`${scope}/credentials/${encodeURIComponent(revoke.id)}`, {
              method: 'DELETE',
              credentials: 'include',
            });
            setVersion((value) => value + 1);
          }}
        >
          <p>
            <strong>{revoke.name}</strong> · {projectName} · {environmentName}
          </p>
          <p>
            Backend consumers using this token will immediately lose evaluation access. This cannot
            be undone.
          </p>
        </Confirm>
      )}
    </>
  );
}
