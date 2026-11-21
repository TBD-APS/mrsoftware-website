import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { roadmapReport } from './roadmap-report.mjs';
import { verifyContentModule } from './verify-content-module.mjs';

export async function buildRoadmapReports() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const admission = await verifyContentModule(root);
  const [{ renderReport, toCsv, sha256, moduleInfo }, { exportXlsx, exportPptx, exportDocx }, { exportPdf, renderChartImages }] = await Promise.all([
    import('@mr-software/content'), import('@mr-software/content/office'), import('@mr-software/content/pdf'),
  ]);
  if (moduleInfo.moduleId !== 'mr.content' || moduleInfo.implementationVersion !== admission.artifact.version) throw Error('Loaded content module does not match its admitted identity');
  const [source, template] = await Promise.all([
    readFile(join(root, 'roadmap/index.html'), 'utf8'), readFile(join(root, 'tools/roadmap-report-template.html'), 'utf8'),
  ]);
  const at = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'roadmap/index.html'], { cwd: root, encoding: 'utf8' }).trim();
  const report = roadmapReport(source, { at });
  const downloads = [['pdf', 'PDF'], ['docx', 'Word'], ['xlsx', 'Excel'], ['pptx', 'PowerPoint'], ['csv', 'CSV data'], ['html', 'Web page (HTML)']].map(([extension, label]) => ({ label, href: `/roadmap/report/roadmap.${extension}` }));
  for (const chart of report.blocks.filter(block => block.type === 'chart')) downloads.push({ label: `${chart.measure === 'developed' ? 'Developed' : 'Pipeline'} graph (SVG)`, href: `/roadmap/report/${chart.id}.svg` });
  const rendered = await renderReport(report, { downloads });
  const standalone = await renderReport(report);
  if (standalone.hash !== rendered.hash) throw Error('Standalone report must use the same snapshot');
  const files = new Map([
    ['index.html', template.replace('<!-- content:styles -->', () => `<style>${rendered.css}</style>`).replace('<!-- content:report -->', () => rendered.fragment)],
    ['roadmap.html', standalone.html], ['roadmap.csv', toCsv(rendered.report.datasets.products)], ['snapshot.json', rendered.json],
  ]);
  for (const chart of rendered.charts) if (chart.svg) files.set(`${chart.id}.svg`, chart.svg);
  const browser = await chromium.launch({ ...(process.env.UX_CHROME ? { executablePath: process.env.UX_CHROME } : { channel: 'chrome' }), headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const images = await renderChartImages(rendered, { page });
    files.set('roadmap.pdf', (await exportPdf(rendered, { page })).bytes);
    files.set('roadmap.docx', (await exportDocx(rendered, { images })).bytes);
    files.set('roadmap.xlsx', (await exportXlsx(rendered)).bytes);
    files.set('roadmap.pptx', (await exportPptx(rendered, { images })).bytes);
  } finally { await browser.close(); }
  const directory = join(root, 'roadmap/report');
  await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  await writeFile(join(directory, 'export-receipt.json'), JSON.stringify({
    schemaVersion: 1, module: moduleInfo, snapshotHash: rendered.hash, source: rendered.report.source,
    metrics: rendered.metrics,
    files: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) }])),
  }, null, 2) + '\n');
  return { snapshot: rendered.hash, metrics: rendered.metrics, directory };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildRoadmapReports().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
