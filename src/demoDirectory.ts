import type { DirectoryBinding, DirectoryItem, DirectoryKind } from '../shared/directory.ts';

// TEMPORARY POC DEMO DATA — intentionally committed synthetic records, not BC identities.
// Keep this binding separate from every real directory; never substitute these records for
// failed live lookups. Segment authoring searches these fixtures by default for the POC.
// Remove this module and the demoData picker option when the POC ends.
export const demoDirectoryBinding: DirectoryBinding = {
  sourceId: 'flightdeck-synthetic-demo',
  tenantId: 'de000000-0000-4000-8000-000000000001',
};

export const demoDirectoryItems: Record<DirectoryKind, DirectoryItem[]> = {
  people: [
    {
      id: 'de000000-0000-4000-8000-000000000101',
      label: 'Alex Pilot',
      email: 'alex.pilot@example.test',
    },
    {
      id: 'de000000-0000-4000-8000-000000000102',
      label: 'Morgan Planner',
      email: 'morgan.planner@example.test',
    },
    {
      id: 'de000000-0000-4000-8000-000000000103',
      label: 'Sam Analyst',
      email: 'sam.analyst@example.test',
    },
  ],
  organizations: [
    { id: '900001', label: 'Example Co', email: null },
    { id: '900002', label: 'Northstar Operations', email: null },
    { id: '900003', label: 'Horizon Planning', email: null },
  ],
  groups: [
    { id: '900101', label: 'Internal Pilots', email: null },
    { id: '900102', label: 'Mission Planners', email: null },
    { id: '900103', label: 'Release Reviewers', email: null },
  ],
};
