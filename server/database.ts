import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';

import { localEnvironments, localOrganizations, localProjects } from '../shared/fixtures.ts';

const { Pool } = pg;

export function connectDatabase(url: string): pg.Pool {
  return new Pool({ connectionString: url, max: 10, application_name: 'flightdeck' });
}

export async function migrate(databaseUrl: string): Promise<void> {
  const pool = connectDatabase(databaseUrl);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(637421, 1)');
      await client.query('CREATE SCHEMA IF NOT EXISTS flightdeck');
      await client.query('REVOKE ALL ON SCHEMA flightdeck FROM PUBLIC');
      await client.query(`CREATE TABLE IF NOT EXISTS flightdeck.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(
        'REVOKE ALL ON flightdeck.schema_migrations FROM PUBLIC, flightdeck_runtime'
      );
      const name = '001-initial.sql';
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM flightdeck.schema_migrations WHERE name = $1',
        [name]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${name}`);
        }
      } else {
        await client.query(sql);
        await client.query(
          'INSERT INTO flightdeck.schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/** Synthetic local-development data only. Call with the migration/owner connection. */
export async function seedDatabase(databaseUrl: string, evaluationToken: string): Promise<void> {
  if (!/^fd_[a-f0-9]{64}$/.test(evaluationToken)) {
    throw new Error('The local evaluation token must be fd_ followed by 64 hexadecimal characters');
  }
  const pool = connectDatabase(databaseUrl);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(637421, 2)');
      for (const organization of localOrganizations) {
        await client.query(
          'INSERT INTO flightdeck.organizations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [organization.id, organization.name]
        );
      }
      for (const project of localProjects) {
        await client.query(
          'INSERT INTO flightdeck.projects (id, organization_id, key, name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
          [project.id, project.organizationId, project.key, project.name]
        );
      }
      for (const environment of localEnvironments) {
        await client.query(
          'INSERT INTO flightdeck.environments (id, project_id, key, name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
          [environment.id, environment.projectId, environment.key, environment.name]
        );
      }
      await client.query(
        `INSERT INTO flightdeck.credentials
        (id, organization_id, project_id, environment_id, name, token_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash`,
        [
          '40000000-0000-4000-8000-000000000001',
          localOrganizations[0].id,
          localProjects[0].id,
          localEnvironments[0].id,
          'Local backend consumer',
          createHash('sha256').update(evaluationToken).digest('hex'),
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
