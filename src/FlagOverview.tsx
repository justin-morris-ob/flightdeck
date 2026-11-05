import { useEffect, useState } from 'react';

import {
  Badge,
  Block,
  Button,
  CollectionPage,
  Empty,
  Notice,
  PageHeader,
  Properties,
} from '@onebrief/atlas-ui';

import { flagSummarySchema, type FlagSummary, type Project } from '../shared/contracts.ts';
import { dateTime, errorMessage, get, type Request } from './api.ts';

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
    <CollectionPage
      title="Flag overview"
      icon="flag"
      header={
        <PageHeader
          title={flag?.name ?? flagKey}
          crumbs={[project.name, 'Flag overview']}
          meta="Project-wide identity · Choose an environment to inspect its configuration"
          badges={
            flag && (
              <Badge tone={flag.archived ? 'warning' : 'secondary'}>
                {flag.archived ? 'Archived' : 'Active'}
              </Badge>
            )
          }
          actions={
            <>
              <Button onClick={onBack}>Back to flags</Button>
              <Button onClick={() => setVersion((value) => value + 1)}>Refresh overview</Button>
            </>
          }
        />
      }
    >
      {loading ? (
        <div className="fd-table-loading" role="status">
          Loading flag overview…
        </div>
      ) : error ? (
        <Notice tone="danger">{error}</Notice>
      ) : flag ? (
        <>
          <Block name="content" label="Shared flag information" icon="flag">
            <Properties
              items={[
                ['Key', <code>{flag.key}</code>],
                ['Project', project.name],
                ['Owner', flag.owner],
                ['Project-wide version', flag.revision],
                ['Updated', <time dateTime={flag.updatedAt}>{dateTime(flag.updatedAt)}</time>],
              ]}
            />
            {flag.description && <p>{flag.description}</p>}
            <p className="fd-help">
              Identity, metadata and archival are shared across all project environments. This
              overview is read-only.
            </p>
          </Block>
          <Block name="content" label="Environment configurations" icon="sliders">
            <p className="fd-help">
              Each environment configures the same flag independently. Status opens the
              configuration; it does not change the gate.
            </p>
            {flag.archived && (
              <Notice>
                Archived in every environment · Saved gates are retained, but evaluation returns
                each configuration's typed off value.
              </Notice>
            )}
            <div className="fd-table-wrap">
              <table className="fd-table">
                <caption className="fd-sr-only">{flag.name} environment configurations</caption>
                <thead>
                  <tr>
                    <th scope="col">Environment</th>
                    <th scope="col">Saved gate</th>
                    <th scope="col">Configuration</th>
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
                            {configuration ? 'Open configuration' : 'Unavailable'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Block>
        </>
      ) : (
        <Empty>Flag overview is unavailable.</Empty>
      )}
    </CollectionPage>
  );
}
