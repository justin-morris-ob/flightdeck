import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  useTabs: false,
  tabWidth: 2,
  singleQuote: true,
  trailingComma: 'es5',
  sortImports: {
    internalPattern: [
      'bc-',
      '@backend/',
      '@onebrief/',
      'frontend-systems',
      'repository',
      'tabular-data',
    ],
    sortSideEffects: false,
    newlinesBetween: true,
    groups: [
      ['side_effect', 'side_effect_style'],
      'type',
      'builtin',
      'external',
      ['internal', 'subpath'],
      ['parent', 'sibling', 'index'],
      'style',
      'unknown',
    ],
  },
  sortPackageJson: {
    sortScripts: true,
  },
  ignorePatterns: [
    '**/node_modules',
    '**/build',
    '**/dist',
    '**/coverage',
    '**/coverage-db',
    '**/profiling',
    '**/.turbo',
    '**/test-results',
    'out',
    '**/*.{yml,yaml}',
  ],
});
