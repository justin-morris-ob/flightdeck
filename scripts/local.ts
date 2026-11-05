import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { connectDatabase, migrate, seedDatabase } from '../server/database.ts';
import { CommandExitError, runCommand } from './process.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateDirectory = new URL('../.local/flightdeck/', import.meta.url);
const configFile = new URL('config.json', privateDirectory);
const volumeName = 'flightdeck-local-postgres';
const configSchema = z.strictObject({
  adminPassword: z.string().min(32),
  runtimePassword: z.string().min(32),
  sessionSecret: z.string().min(32),
  evaluationToken: z.string().regex(/^fd_[a-f0-9]{64}$/),
});
type LocalConfig = z.infer<typeof configSchema>;
const usage =
  'Usage: node scripts/local.ts setup|start|test|consumer <key> <tagged-fallback-json> [context-json]|stop-db';

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function readConfig(): Promise<LocalConfig> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    if (hasCode(error, 'ENOENT')) throw error;
    throw new Error(
      'Cannot read private Flightdeck config. Restore the existing config; do not regenerate credentials.'
    );
  }
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      'Invalid private Flightdeck config. Restore the existing config; do not regenerate credentials.'
    );
  }
  await chmod(privateDirectory, 0o700);
  await chmod(configFile, 0o600);
  return parsed.data;
}

async function loadConfig(setup: boolean): Promise<LocalConfig> {
  try {
    return await readConfig();
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
    if (!setup) throw new Error('Run node scripts/local.ts setup first.');
  }
  const volumes = await runCommand(
    'docker',
    ['volume', 'ls', '--filter', `name=^${volumeName}$`, '--format', '{{.Name}}'],
    { cwd: root, captureOutput: true }
  );
  if (volumes.trim()) {
    throw new Error(
      'Existing Flightdeck database volume has no private config. Restore .local/flightdeck/config.json; credentials will not be regenerated.'
    );
  }
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  const secret = () => randomBytes(32).toString('hex');
  const config: LocalConfig = {
    adminPassword: secret(),
    runtimePassword: secret(),
    sessionSecret: secret(),
    evaluationToken: `fd_${secret()}`,
  };
  try {
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error;
    return readConfig();
  }
  return config;
}

function databaseUrl(config: LocalConfig, owner: boolean, test = false): string {
  const user = owner ? 'postgres' : 'flightdeck_runtime';
  const password = owner ? config.adminPassword : config.runtimePassword;
  return `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:55471/flightdeck${test ? '_test' : ''}`;
}

async function setupDatabases(config: LocalConfig): Promise<void> {
  await runCommand(
    'docker',
    ['compose', '-f', `${root}compose.yaml`, 'up', '-d', '--wait', '--wait-timeout', '90'],
    {
      cwd: root,
      env: { FLIGHTDECK_POSTGRES_PASSWORD: config.adminPassword },
    }
  );
  const admin = connectDatabase(databaseUrl(config, true));
  try {
    const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
      'flightdeck_runtime',
    ]);
    if (!existing.rowCount) {
      const { rows } = await admin.query<{ statement: string }>(
        "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text, $2::text) AS statement",
        ['flightdeck_runtime', config.runtimePassword]
      );
      await admin.query(rows[0].statement);
    }
    await admin.query(
      'ALTER ROLE flightdeck_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
    );
    const testDatabase = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      'flightdeck_test',
    ]);
    if (!testDatabase.rowCount) await admin.query('CREATE DATABASE flightdeck_test');
    await admin.query(
      'REVOKE ALL ON DATABASE flightdeck FROM PUBLIC; GRANT CONNECT ON DATABASE flightdeck TO flightdeck_runtime'
    );
    await admin.query(
      'REVOKE ALL ON DATABASE flightdeck_test FROM PUBLIC; GRANT CONNECT ON DATABASE flightdeck_test TO flightdeck_runtime'
    );
  } finally {
    await admin.end();
  }
  for (const test of [false, true]) {
    const ownerUrl = databaseUrl(config, true, test);
    const database = connectDatabase(ownerUrl);
    try {
      await database.query(
        'REVOKE ALL ON SCHEMA public FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM flightdeck_runtime; GRANT USAGE ON SCHEMA public TO flightdeck_runtime'
      );
    } finally {
      await database.end();
    }
    await migrate(ownerUrl);
    await seedDatabase(ownerUrl, config.evaluationToken);
  }
  console.log('PostgreSQL ready. Credentials retained privately in .local/flightdeck/config.json.');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!['setup', 'start', 'test', 'consumer', 'stop-db'].includes(command ?? '')) {
    throw new Error(usage);
  }
  if (command !== 'consumer' && process.argv.length > 3) throw new Error(usage);
  if (command === 'consumer' && (!process.argv[3] || !process.argv[4] || process.argv.length > 6))
    throw new Error(usage);
  const config = await loadConfig(command === 'setup');
  if (command === 'setup') {
    await setupDatabases(config);
  } else if (command === 'start') {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Local development startup refuses NODE_ENV=production.');
    await runCommand(process.execPath, ['server/index.ts'], {
      cwd: root,
      env: {
        NODE_ENV: 'development',
        FLIGHTDECK_MODE: 'local-development',
        FLIGHTDECK_DATABASE_URL: databaseUrl(config, false),
        FLIGHTDECK_SESSION_SECRET: config.sessionSecret,
        PORT: process.env.PORT ?? '4721',
        ATLAS_SHELL_ORIGIN: 'http://localhost:4720',
        ATLAS_SHELL_INTERNAL_URL: 'http://localhost:4720',
      },
    });
  } else if (command === 'test') {
    await runCommand('pnpm', ['exec', 'vitest', 'run'], {
      cwd: root,
      env: {
        FLIGHTDECK_TEST_DATABASE_URL: databaseUrl(config, false, true),
        FLIGHTDECK_TEST_MIGRATION_DATABASE_URL: databaseUrl(config, true, true),
      },
    });
  } else if (command === 'consumer') {
    await runCommand(process.execPath, ['examples/evaluate.ts', ...process.argv.slice(3)], {
      cwd: root,
      env: {
        FLIGHTDECK_EVALUATION_TOKEN: config.evaluationToken,
        FLIGHTDECK_BASE_URL: process.env.FLIGHTDECK_BASE_URL ?? 'http://localhost:4721',
      },
    });
  } else {
    await runCommand('docker', ['compose', '-f', `${root}compose.yaml`, 'stop'], {
      cwd: root,
      env: { FLIGHTDECK_POSTGRES_PASSWORD: config.adminPassword },
    });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local command failed.');
  process.exitCode = error instanceof CommandExitError ? error.exitCode : 1;
}
