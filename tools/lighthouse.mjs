import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { startSite } from './ux-site.mjs';

const exec = promisify(execFile);
export const budgets = { performance: 0.90, accessibility: 1, 'best-practices': 1, seo: 1 };
const establishedPages = ['/', '/products/workslip/', '/research/'];
const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'speed-index', 'total-blocking-time', 'cumulative-layout-shift'];

export async function auditPages(baselineRoot) {
  if (baselineRoot) {
    try { await access(path.join(baselineRoot, 'da/index.html')); }
    catch (error) { if (error.code === 'ENOENT') return establishedPages; throw error; }
  }
  return [...establishedPages, '/da/'];
}

function evidence(value, depth = 0, found = { nodes: [], sources: [] }) {
  if (!value || typeof value !== 'object' || depth > 6) return found;
  if (value.type === 'node' && typeof value.selector === 'string') found.nodes.push(value.selector);
  if (value.type === 'source-location' && typeof value.url === 'string') {
    try {
      const url = new URL(value.url);
      const component = url.pathname.startsWith('/cdn-cgi/challenge-platform/') ? 'cloudflare-challenge'
        : url.pathname.startsWith('/.webmcp/') ? 'webmcp' : undefined;
      if (['https:', 'http:'].includes(url.protocol)) found.sources.push({ host: url.hostname, file: path.posix.basename(url.pathname), line: value.line,
        ...(component ? { component } : {}) });
    } catch { /* Inline sources do not need a URL in the stored summary. */ }
  }
  for (const child of Object.values(value)) if (typeof child === 'object') evidence(child, depth + 1, found);
  return found;
}

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
      .map(([id, audit]) => {
        const details = evidence(audit.details);
        return { id, title: audit.title, score: audit.score,
          ...(details.nodes.length ? { nodes: [...new Set(details.nodes)] } : {}),
          ...(details.sources.length ? { sources: details.sources } : {}) };
      }),
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
    const pages = await auditPages(label === 'base' ? publicRoot : undefined);
    for (const formFactor of ['mobile', 'desktop']) {
      for (const page of pages) {
        const args = [fileURLToPath(new URL('../node_modules/lighthouse/cli/index.js', import.meta.url)), base + page,
          '--quiet', '--output=json', '--output-path=stdout', '--chrome-flags=--headless --no-sandbox',
          '--only-categories=' + Object.keys(budgets).join(',')];
        if (formFactor === 'desktop') args.push('--preset=desktop');
        let measured;
        try {
          const { stdout } = await exec(process.execPath, args, { timeout: 120_000, maxBuffer: 12 * 1024 * 1024,
            env: { ...process.env, ...(process.env.UX_CHROME ? { CHROME_PATH: process.env.UX_CHROME } : {}) } });
          measured = summarize(JSON.parse(stdout));
        } catch {
          // Do not print raw browser/CLI output or persist raw reports, traces or headers.
          measured = { error: 'Lighthouse could not complete. Check Chrome availability and the public HTTP response.', scores: {}, metrics: {}, failedAudits: [] };
        }
        const report = { label, page, formFactor, ...measured };
        reports.push(report);
        console.log(`${label} ${formFactor} ${page}: ${report.error ?? Object.entries(report.scores).map(([key, value]) => `${key} ${Math.round(value * 100)}`).join(', ')}`);
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
  const rows = reports.map(report => `| ${report.label} | ${report.formFactor} | ${report.page} | ${Object.keys(budgets).map(key => typeof report.scores[key] === 'number' ? Math.round(report.scores[key] * 100) : 'error').join(' | ')} |`);
  await writeFile(path.join(output, 'summary.md'), '# Lighthouse lab audit\n\n' + (live ? 'Public production pages.' : 'Base and candidate public assets use the same local server, Lighthouse version and runner.') + ' One run per page/profile. Lab scores are not field Core Web Vitals or proof of Google indexing.\n\n| Source | Profile | Page | Performance | Accessibility | Best practices | SEO |\n|---|---|---|---:|---:|---:|---:|\n' + rows.join('\n') + '\n');
  const failures = reports.flatMap(report => (report.error ? [report.error] : report.label === 'base' ? [] : violations(report))
    .map(message => `${report.label} ${report.formFactor} ${report.page}: ${message}`));
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
