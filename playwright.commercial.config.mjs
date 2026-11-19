import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/commercial-ux/*.pw.mjs', 'commercial/tests/ux/*.pw.mjs', 'commercial/private/tests/ux/*.pw.mjs'],
  outputDir: '.ux-gate/commercial/results', fullyParallel: true, workers: 2,
  forbidOnly: !!process.env.CI, retries: 0, timeout: 120_000,
  expect: { timeout: 5_000 },
  reporter: [ ...(process.env.CI ? [['github']] : []), ['list'], ['html', { outputFolder: '.ux-gate/commercial/report', open: 'never' }], ['json', { outputFile: '.ux-gate/commercial/report.json' }] ],
  use: {
    ...(process.env.UX_CHROME ? { launchOptions: { executablePath: process.env.UX_CHROME } } : { channel: 'chrome' }),
    headless: true, deviceScaleFactor: 2, actionTimeout: 5_000, trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
