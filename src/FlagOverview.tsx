import { useEffect, useState } from 'react';

import { Badge, Button, Empty, Notice, PageHeader } from '@onebrief/atlas-ui';

import { flagSummarySchema, type FlagSummary, type Project } from '../shared/contracts.ts';
import { errorMessage, get, type Request } from './api.ts';

interface Props {
  request: Request;
  project: Project;
  flagKey: string;
  onBack: () => void;
  onOpenEnvironment: (environmentId: string) => void;
}

export function FlagOverview({ request, project, flagKey, onBack, onOpenEnvironment }: Props) {
  const [flag, setFlag] = useState<FlagSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    get(
      request,
      `/api/v1/projects/${encodeURIComponent(project.id)}/flags/${encodeURIComponent(flagKey)}`,
      flagSummarySchema
    )
      .then((next) => {
        if (current) setFlag(next);
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
  }, [request, project.id, flagKey, version]);

  return (
    <section className="fd-poc-detail" aria-label="Flag overview">
      <PageHeader
        title={flag?.name ?? flagKey}
        meta={<code>{flag?.key ?? flagKey}</code>}
        actions={<Button onClick={onBack}>Back to flags</Button>}
      />
      {loading ? (
        <div className="fd-table-loading" role="status">
          Loading flag overview…
        </div>
      ) : error ? (
        <Notice tone="danger">
          {error} <Button onClick={() => setVersion((value) => value + 1)}>Try again</Button>
        </Notice>
      ) : flag ? (
        <div className="fd-poc-card">
          {flag.description && <p>{flag.description}</p>}
          <h2>Environments</h2>
          {flag.archived && (
            <Notice>
              Archived in every environment · Saved gates are retained, but evaluation returns each
              configuration's typed off value.
            </Notice>
          )}
          <div className="fd-table-wrap">
            <table className="fd-table">
              <caption className="fd-sr-only">{flag.name} environment configurations</caption>
              <thead>
                <tr>
                  <th scope="col">Environment</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="fd-sr-only">Open environment</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.environments.map((environment) => {
                  const configuration = flag.environments.find(
                    (item) => item.environmentId === environment.id
                  );
                  return (
                    <tr key={environment.id}>
                      <td>{environment.name}</td>
                      <td>
                        <Badge
                          tone={
                            !configuration
                              ? 'warning'
                              : flag.archived
                                ? 'secondary'
                                : configuration.enabled
                                  ? 'success'
                                  : 'secondary'
                          }
                        >
                          {!configuration ? 'Unavailable' : configuration.enabled ? 'On' : 'Off'}
                        </Badge>
                        {configuration && flag.archived && (
                          <span className="fd-table-sub">Archived · evaluates off</span>
                        )}
                      </td>
                      <td>
                        <Button
                          disabled={!configuration}
                          aria-label={`Open ${flag.name} in ${environment.name}`}
                          onClick={() => onOpenEnvironment(environment.id)}
                        >
                          {configuration ? 'Open' : 'Unavailable'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty>Flag overview is unavailable.</Empty>
      )}
    </section>
  );
}
