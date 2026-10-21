import { defineConfig } from '@playwright/test';

// Isolated real-component tests. Upload HTTP responses and persistence actions
// are controlled by the fixture; no database or storage credentials required.
export default defineConfig({
  testDir: './tests/uploads',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  outputDir: 'test-results/uploads',
  use: {
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
});
