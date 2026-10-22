import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/mobile-navigation',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  outputDir: 'test-results/mobile-navigation',
  use: {
    browserName: 'chromium', headless: true, hasTouch: true,
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
});
