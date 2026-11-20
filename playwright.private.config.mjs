import commercial from './playwright.commercial.config.mjs';
export default {
  ...commercial,
  testMatch: ['tests/commercial-ux/backoffice.pw.mjs', 'commercial/private/tests/ux/*.pw.mjs'],
  outputDir: '.ux-gate/private/results',
  reporter: [ ...(process.env.CI ? [['github']] : []), ['list'], ['html', { outputFolder: '.ux-gate/private/report', open: 'never' }], ['json', { outputFile: '.ux-gate/private/report.json' }] ],
};
