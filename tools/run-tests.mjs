import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Playwright supplies FORCE_COLOR to its workers. An inherited NO_COLOR would
// otherwise conflict with it. Normalize once for every child of the full gate.
const env = { ...process.env };
delete env.NO_COLOR; delete env.FORCE_COLOR;
const run = args => {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['tools/build-commercial.mjs']);
run(['tools/build-roadmap-reports.mjs']);
run(['--test', ...(await readdir('tests')).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name)]);
run(['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/backoffice/playwright.config.mjs']);
run(['node_modules/@playwright/test/cli.js', 'test']);
run(['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.commercial.config.mjs']);
