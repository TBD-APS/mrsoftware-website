// UX gate runner (the shared ux-flows gate on Playwright Test). The gate itself is tests/ux/ux-gate.pw.mjs;
// everything app-specific stays in ux.config.mjs and tests/ux/journeys.mjs. Copied unchanged between projects.
//
//   npm run ux-gate                          every journey and the screen audit, on desktop and phone
//   npm run ux-gate -- -g <journey-id>       one journey
//   npm run ux-gate -- --project phone       one viewport
//   npx playwright show-report .ux-gate/report
//   npx playwright show-trace .ux-gate/results/<test>/trace.zip
import { defineConfig } from '@playwright/test';
import config from './ux.config.mjs';

const output = config.output ?? '.ux-gate';
const viewports = config.viewports ?? {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

export default defineConfig({
  testDir: 'tests/ux',
  // Not *.spec.*, so the unit test runner never picks the gate up.
  testMatch: '*.pw.mjs',
  outputDir: `${output}/results`,
  // Every journey starts its own app, so two run side by side without sharing state.
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  // No retries: a journey that only passes on a second try is a flow a person can hit, and the gate says so.
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 5_000 },
  reporter: [
    // On GitHub each failure is also an annotation on the pull request.
    ...(process.env.CI ? [['github']] : []),
    ['list'],
    ['html', { outputFolder: `${output}/report`, open: 'never' }],
    ['json', { outputFile: `${output}/report.json` }],
  ],
  use: {
    // The installed Google Chrome, or UX_CHROME; Playwright downloads no browser.
    ...(process.env.UX_CHROME ? { launchOptions: { executablePath: process.env.UX_CHROME } } : { channel: 'chrome' }),
    headless: true,
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(viewports).map(([name, use]) => ({ name, use })),
});
