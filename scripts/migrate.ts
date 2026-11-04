import { migrate } from '../server/database.ts';

const databaseUrl = process.env.FLIGHTDECK_MIGRATION_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Set FLIGHTDECK_MIGRATION_DATABASE_URL to the schema-owner database URL.');
}
await migrate(databaseUrl);
console.log('Flightdeck migrations applied.');
