import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CommandExitError, runCommand } from './process.ts';

async function main(): Promise<void> {
  const checkout = process.env.ATLAS_CHECKOUT;
  if (!checkout) {
    throw new Error(
      'Set ATLAS_CHECKOUT to a separately installed and built compatible Atlas checkout.'
    );
  }
  const shellDirectory = resolve(checkout, 'src/apps/shell');
  try {
    await access(resolve(shellDirectory, 'bff/server.mjs'));
    await access(resolve(shellDirectory, 'dist/index.html'));
  } catch {
    throw new Error('ATLAS_CHECKOUT must contain an installed and built shell at src/apps/shell.');
  }
  await runCommand(process.execPath, ['bff/server.mjs'], {
    cwd: shellDirectory,
    env: {
      PORT: '4720',
      ATLAS_SHELL_ORIGIN: 'http://localhost:4720',
      ATLAS_SHELL_INTERNAL_URL: 'http://localhost:4720',
      ATLAS_ENABLED_APPS: 'flightdeck',
      ATLAS_FLIGHTDECK_URL: 'http://localhost:4721',
      ATLAS_FLIGHTDECK_INTERNAL_URL: 'http://localhost:4721',
      ATLAS_SLOT_GRANTS: await readFile(resolve(shellDirectory, 'chart/slot-grants.json'), 'utf8'),
    },
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Shell startup failed.');
  process.exitCode = error instanceof CommandExitError ? error.exitCode : 1;
}
