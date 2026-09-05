import { defineConfig } from '@playwright/test';
import { callBrowserLaunchOptions } from './tests/calls/browser-options';

// Never fall back to .env.local: it may point at a real shared database.
const databaseURL = process.env.CALL_TEST_DATABASE_URL;
if (!databaseURL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseURL).hostname)) {
  throw new Error('Set CALL_TEST_DATABASE_URL to a disposable LOCAL PostgreSQL database. See VIDEO_CALL_CHECKS.md.');
}
const baseURL = process.env.CALL_TEST_BASE_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('Call regression tests must run against a local test server, not a deployed app.');
}

export default defineConfig({
  testDir: './tests/calls',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  outputDir: 'test-results/calls',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: callBrowserLaunchOptions,
  },
  webServer: process.env.CALL_TEST_BASE_URL ? undefined : {
    command: 'npm run dev -- --hostname 0.0.0.0 --port 3100',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseURL,
      DATABASE_SSL: 'false',
      FORCE_OFFLINE_MODE: 'false',
      DB_MODE: 'postgres',
      S3_BUCKET: '',
      RAPIDAPI_KEY: '',
    },
  },
});
