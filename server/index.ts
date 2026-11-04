import { assertLocalDevelopment } from './auth.ts';
import { connectDatabase } from './database.ts';
import { createApplication } from './http.ts';

assertLocalDevelopment();
const databaseUrl = process.env.FLIGHTDECK_DATABASE_URL;
const sessionSecret = process.env.FLIGHTDECK_SESSION_SECRET;
const port = Number(process.env.PORT ?? 4721);
if (!databaseUrl || !sessionSecret) throw new Error('Run pnpm db:setup, then pnpm start');
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer between 1024 and 65535');
const pool = connectDatabase(databaseUrl);
await pool.query('SELECT 1');
const server = createApplication({
  pool,
  sessionSecret,
  port,
  shellOrigin: process.env.ATLAS_SHELL_ORIGIN ?? 'http://localhost:4720',
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Flightdeck local-development http://localhost:${port}`);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    void pool.end();
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('error', () => {
  console.error('Flightdeck could not start. Check the local port and database setup.');
  void pool.end();
  process.exitCode = 1;
});
