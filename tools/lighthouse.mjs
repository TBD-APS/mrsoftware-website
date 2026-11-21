import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { startSite } from './ux-site.mjs';

const exec = promisify(execFile);
export const budgets = { performance: 0.90, accessibility: 1, 'best-practices': 1, seo: 1 };
const pages = ['/', '/products/workslip/', '/research/'];
const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift'];

export function summarize(result) {
  if (result.runtimeError) throw new Error('Lighthouse did not complete; no valid score is available.');
  const scores = Object.fromEntries(Object.keys(budgets).map(category => {
    const score = result.categories?.[category]?.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) throw new Error(`Missing or invalid Lighthouse category: ${category}`);
    return [category, score];
  }));
  return {
    lighthouseVersion: result.lighthouseVersion,
    fetchedAt: result.fetchTime,
    scores,
    metrics: Object.fromEntries(metrics.map(id => [id, result.audits?.[id]?.numericValue ?? null])),
    failedAudits: Object.entries(result.audits ?? {}).filter(([, audit]) => typeof audit.score === 'number' && audit.score < 1)
      .map(([id, audit]) => ({ id, title: audit.title, score: audit.score })),
  };
}

export function violations(report) {
  return Object.entries(budgets).filter(([category, minimum]) => !(report.scores?.[category] >= minimum))
    .map(([category, minimum]) => `${category}: ${report.scores?.[category] ?? 'missing'}; minimum ${minimum}`);
}

async function audit(publicRoot, label, live = false) {
  const site = live ? null : await startSite({ publicRoot });
  const base = live ? 'https://mrsoftware.dk' : `http://127.0.0.1:${new URL(site.base).port}`;
  const reports = [];
  try {
    for (const formFactor of ['mobile', 'desktop']) {
      for (const page of pages) {
        const args = [fileURLToPath(new URL('../node_modules/lighthouse/cli/index.js', import.meta.url)), base + page,
          '--quiet', '--output=json', '--output-path=stdout', '--chrome-flags=--headless --no-sandbox',
          '--only-categories=' + Object.keys(budgets).join(',')];
        if (formFactor === 'desktop') args.push('--preset=desktop');
        let stdout;
        try {
          ({ stdout } = await exec(process.execPath, args, { timeout: 120_000, maxBuffer: 12 * 1024 * 1024,
            env: { ...process.env, ...(process.env.UX_CHROME ? { CHROME_PATH: process.env.UX_CHROME } : {}) } }));
        } catch (error) {
          // Do not print raw browser/CLI output or persist raw reports, traces or headers.
          const code = typeof error.code === 'number' || /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'unknown';
          throw new Error(`Lighthouse could not complete ${label} ${formFactor} ${page} (exit ${code}). Check Chrome availability.`);
        }
        const report = { label, page, formFactor, ...summarize(JSON.parse(stdout)) };
        reports.push(report);
        console.log(`${label} ${formFactor} ${page}: ${Object.entries(report.scores).map(([key, value]) => `${key} ${Math.round(value * 100)}`).join(', ')}`);
      }
    }
  } finally { await site?.close(); }
  return reports;
}

export async function run({ baselineRoot, live = false, output = live ? '.local/lighthouse-live' : '.local/lighthouse' } = {}) {
  if (process.env.DASHBOARD_SNAPSHOT_DIR) throw new Error('Run the public audit without private dashboard inputs.');
  const reports = [];
  if (baselineRoot) reports.push(...await audit(path.resolve(baselineRoot), 'base'));
  reports.push(...await audit(undefined, live ? 'production' : 'candidate', live));
  await mkdir(output, { recursive: true });
  // Persist only selected public scores/metrics. Raw Lighthouse JSON stays in memory.
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({ budgets, reports }, null, 2) + '\n');
  const rows = reports.map(report => `| ${report.label} | ${report.formFactor} | ${report.page} | ${Object.values(report.scores).map(score => Math.round(score * 100)).join(' | ')} |`);
  await writeFile(path.join(output, 'summary.md'), '# Lighthouse lab audit\n\n' + (live ? 'Public production pages.' : 'Base and candidate public assets use the same local server, Lighthouse version and runner.') + ' One run per page/profile. Lab scores are not field Core Web Vitals or proof of Google indexing.\n\n| Source | Profile | Page | Performance | Accessibility | Best practices | SEO |\n|---|---|---|---:|---:|---:|---:|\n' + rows.join('\n') + '\n');
  const failures = reports.filter(report => report.label !== 'base').flatMap(report => violations(report).map(message => `${report.formFactor} ${report.page}: ${message}`));
  if (failures.length) throw new Error('Lighthouse budgets failed:\n' + failures.join('\n'));
  return reports;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf('--baseline-root');
  if (index !== -1 && !process.argv[index + 1]) throw new Error('--baseline-root requires a directory.');
  const live = process.argv.includes('--live');
  if (live && index !== -1) throw new Error('Choose a public production audit or a local comparison.');
  await run({ baselineRoot: index === -1 ? undefined : process.argv[index + 1], live });
}
