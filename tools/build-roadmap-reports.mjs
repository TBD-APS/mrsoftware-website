import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { parseFragment } from 'parse5';
import { roadmapReport } from './roadmap-report.mjs';
import { verifyContentModule } from './verify-content-module.mjs';
import { danishRoadmapReport, danishRenderedRoadmap, danishRoadmapCsv, danishOfficeExport } from './roadmap-report-locale.mjs';

function findElement(node, attribute, value) {
  if (node?.attrs?.some(item => item.name === attribute && item.value === value)) return node;
  for (const child of node?.childNodes ?? []) {
    const found = findElement(child, attribute, value);
    if (found) return found;
  }
}

export async function buildRoadmapReports({ locales = ['en', 'da'] } = {}) {
  if (!locales.length || locales.some(locale => !['en', 'da'].includes(locale)) || new Set(locales).size !== locales.length) throw Error('Expected unique supported report locales');
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
  const browser = await chromium.launch({ ...(process.env.UX_CHROME ? { executablePath: process.env.UX_CHROME } : { channel: 'chrome' }), headless: true });
  const results = {};
  try {
    for (const locale of locales) {
      const danish = locale === 'da', directory = join(root, danish ? 'da/roadmap/report' : 'roadmap/report');
      const current = danish ? danishRoadmapReport(report) : report;
      const downloads = [['pdf', 'PDF'], ['docx', 'Word'], ['xlsx', 'Excel'], ['pptx', 'PowerPoint'], ['csv', 'CSV data'], ['html', 'Web page (HTML)']].map(([extension, label]) => ({ label, href: `/roadmap/report/roadmap.${extension}` }));
      for (const chart of report.blocks.filter(block => block.type === 'chart')) downloads.push({ label: `${chart.measure === 'developed' ? 'Developed' : 'Pipeline'} graph (SVG)`, href: `/roadmap/report/${chart.id}.svg` });
      if (danish) for (const download of downloads) {
        download.href = '/da' + download.href;
        download.label = ({ 'CSV data': 'CSV-data', 'Web page (HTML)': 'Webside (HTML)', 'Developed graph (SVG)': 'Graf over udviklede funktioner (SVG)', 'Pipeline graph (SVG)': 'Graf over funktioner på vej (SVG)' })[download.label] ?? download.label;
      }
      const localize = danish ? danishRenderedRoadmap : value => value;
      const rendered = localize(await renderReport(current, { downloads }));
      const standalone = localize(await renderReport(current));
      if (standalone.hash !== rendered.hash) throw Error('Standalone report must use the same snapshot');
      const files = new Map([
        ['index.html', template.replace('<!-- content:styles -->', () => `<style>${rendered.css}</style>`).replace('<!-- content:report -->', () => rendered.fragment)],
        ['roadmap.html', standalone.html], ['roadmap.csv', danish ? danishRoadmapCsv(rendered.report.datasets.products, toCsv) : toCsv(rendered.report.datasets.products)], ['snapshot.json', rendered.json],
      ]);
      for (const chart of rendered.charts) if (chart.svg) files.set(`${chart.id}.svg`, chart.svg);
      // Reuse the renderer's existing phone layout, preserving its exact SVG bytes.
      const tree = parseFragment(rendered.fragment, { sourceCodeLocationInfo: true });
      const graph = findElement(tree, 'aria-labelledby', 'content-developed-by-package');
      const phone = findElement(graph, 'class', 'content-small');
      const location = phone?.childNodes?.find(node => node.tagName === 'svg')?.sourceCodeLocation;
      if (!location) throw Error('The shared report must provide its responsive roadmap graph');
      files.set('developed-by-package-compact.svg', rendered.fragment.slice(location.startOffset, location.endOffset));
      const context = await browser.newContext();
      try {
        await context.route('**/*', route => route.abort());
        const page = await context.newPage();
        const images = await renderChartImages(rendered, { page });
        const exports = [
          ['pdf', await exportPdf(danish ? standalone : rendered, { page })], ['docx', await exportDocx(rendered, { images })],
          ['xlsx', await exportXlsx(rendered)], ['pptx', await exportPptx(rendered, { images })],
        ];
        for (const [kind, result] of exports) {
          if (result.snapshotHash !== rendered.hash) throw Error('Export snapshot differs from rendered report');
          files.set(`roadmap.${kind}`, danish && kind !== 'pdf' ? danishOfficeExport(result.bytes, kind) : result.bytes);
        }
      } finally { await context.close(); }
      await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
      for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
      await writeFile(join(directory, 'export-receipt.json'), JSON.stringify({
        schemaVersion: 1, module: moduleInfo, snapshotHash: rendered.hash, source: rendered.report.source,
        metrics: rendered.metrics,
        ...(danish ? { hostPresentation: { adapter: 'roadmap-report-da-v1', locale: 'da-DK', adaptedOffice: ['roadmap.docx', 'roadmap.xlsx', 'roadmap.pptx'] } } : {}),
        files: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) }])),
      }, null, 2) + '\n');
      results[locale] = { snapshot: rendered.hash, metrics: rendered.metrics, directory };
    }
  } finally { await browser.close(); }
  return { ...(results.en ?? results.da), locales: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildRoadmapReports().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
