import type { OperatorPrincipal } from './contracts.ts';

export const localOrganizations = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Flightdeck development' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Isolation test organization' },
];
export const localProjects = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: localOrganizations[0].id,
    key: 'flightdeck',
    name: 'Flightdeck',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    organizationId: localOrganizations[0].id,
    key: 'sandbox',
    name: 'Sandbox',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    organizationId: localOrganizations[1].id,
    key: 'isolated',
    name: 'Isolated project',
  },
];
export const localEnvironments = localProjects.flatMap((project, index) => [
  {
    id: `30000000-0000-4000-8000-00000000000${index * 2 + 1}`,
    projectId: project.id,
    key: 'development',
    name: 'Development',
  },
  {
    id: `30000000-0000-4000-8000-00000000000${index * 2 + 2}`,
    projectId: project.id,
    key: 'production',
    name: 'Production (local simulation)',
  },
]);
export const localOperators: OperatorPrincipal[] = [
  {
    kind: 'operator',
    id: 'local-admin',
    name: 'Alex Morgan',
    role: 'administrator',
    organizationId: localOrganizations[0].id,
  },
  {
    kind: 'operator',
    id: 'local-editor',
    name: 'Ellis Chen',
    role: 'editor',
    organizationId: localOrganizations[0].id,
  },
  {
    kind: 'operator',
    id: 'local-viewer',
    name: 'Vera Singh',
    role: 'viewer',
    organizationId: localOrganizations[0].id,
  },
  {
    kind: 'operator',
    id: 'local-outsider',
    name: 'Jordan Rivera',
    role: 'administrator',
    organizationId: localOrganizations[1].id,
  },
];
