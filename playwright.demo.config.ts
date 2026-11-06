import { spawnSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

if (process.env.NODE_ENV === 'production')
  throw new Error('Demo recording refuses NODE_ENV=production.');
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0)
  throw new Error('Demo recording requires ffmpeg on PATH to export MP4 files.');

export default defineConfig({
  testDir: './demo/recordings',
  testMatch: '**/*.demo.ts',
  outputDir: '.local/demos/results',
  globalSetup: './demo/recordings/setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['./demo/recordings/reporter.ts']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4722',
    viewport: { width: 1440, height: 1000 },
    video: { mode: 'on', size: { width: 1440, height: 1000 } },
    trace: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm start',
      url: 'http://localhost:4721/healthz',
      env: {
        PORT: '4721',
        NODE_ENV: 'development',
        FLIGHTDECK_DASHBOARD_MODE: 'local',
        FLIGHTDECK_ENVIRONMENT_KEY: 'development',
        FLIGHTDECK_ENVIRONMENT_NAME: 'Development',
      },
      reuseExistingServer: true,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'pnpm demo:seed && pnpm demo',
      url: 'http://localhost:4722/healthz',
      env: {
        DEMO_PORT: '4722',
        NODE_ENV: 'development',
        FLIGHTDECK_BASE_URL: 'http://localhost:4721',
      },
      reuseExistingServer: true,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
