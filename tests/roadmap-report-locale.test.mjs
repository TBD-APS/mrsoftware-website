import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { renderReport, sha256, toCsv } from '@mr-software/content';
import { exportXlsx } from '@mr-software/content/office';
import { roadmapReport } from '../tools/roadmap-report.mjs';
import { danishRoadmapReport, danishRenderedRoadmap, danishRoadmapCsv, danishOfficeExport } from '../tools/roadmap-report-locale.mjs';

const source = await readFile(new URL('../roadmap/index.html', import.meta.url), 'utf8');
const original = roadmapReport(source, { at: '2026-11-20T12:00:00Z' });

test('Danish presentation keeps authoritative product data, statuses and source identity', () => {
  const before = structuredClone(original), translated = danishRoadmapReport(original);
  assert.deepEqual(original, before, 'The English report is not mutated');
  assert.deepEqual(translated.datasets, original.datasets);
  assert.equal(translated.source.version, original.source.version);
  assert.equal(translated.source.at, original.source.at);
  assert.equal(translated.source.url, 'https://mrsoftware.dk/da/roadmap/#roadmap-packages');
  assert.equal(translated.locale, 'da-DK');
  assert.equal(translated.title, 'Roadmapoverblik');
  assert.deepEqual(translated.blocks.slice(0, 4).map(block => block.title), ['Pakker', 'Udviklet', 'Under udvikling', 'Planlagt']);
  assert.match(translated.blocks.at(-1).text, /ikke et mål for kundeaktivering eller færdiggørelsesprocent/);
  assert.deepEqual(translated.blocks.map(block => block.id), original.blocks.map(block => block.id));
  const unknown = structuredClone(original); unknown.blocks[0].title = 'An unreviewed new label';
  assert.throws(() => danishRoadmapReport(unknown), /Missing Danish/);
});

test('localized renderer chrome cannot change snapshot identity, metrics or graph values', async () => {
  const report = danishRoadmapReport(original);
  const raw = await renderReport(report, { downloads: [{ label: 'PDF', href: '/da/roadmap/report/roadmap.pdf' }] });
  const rendered = danishRenderedRoadmap(raw), english = await renderReport(original);
  assert.equal(rendered.json, raw.json);
  assert.equal(rendered.hash, raw.hash);
  assert.equal(sha256(rendered.json), rendered.hash);
  assert.deepEqual(rendered.metrics.map(metric => metric.value), english.metrics.map(metric => metric.value));
  const chartValues = output => output.charts.map(chart => chart.data.map(({ category, value }) => ({ category, value })));
  assert.deepEqual(chartValues(rendered), chartValues(english));
  assert.match(rendered.fragment, /aria-label="Rapportdownloads"/);
  assert.match(rendered.fragment, />Kilde<\/a>/);
  assert.doesNotMatch(rendered.html, /Report downloads|>Source<\/a>/);
  assert.match(rendered.html, /lang="da"/);
  assert.match(rendered.charts[0].svg, /Offentliggjorte funktioner/);
  assert.match(rendered.charts[0].svg, /X-akse med titlen/);
  assert.doesNotMatch(rendered.charts[0].svg, /X-axis titled|ending with|aria-roledescription="bar"/);
  assert.throws(() => danishRenderedRoadmap({ ...raw, json: '{}' }), /intact/);
});

test('Danish CSV localizes display headers while preserving every source data cell', () => {
  const data = original.datasets.products, english = toCsv(data), danish = danishRoadmapCsv(data, toCsv);
  assert.equal(danish.split('\r\n')[0], '\uFEFF"Produkt";"Pakker";"Udviklet";"Under udvikling";"Planlagt";"På vej"');
  assert.deepEqual(danish.split('\r\n').slice(1), english.split('\r\n').slice(1));
});

test('Office adaptation keeps a valid native workbook, translated labels, chart references and exact data', async () => {
  const rendered = await renderReport(danishRoadmapReport(original));
  const exported = await exportXlsx(rendered);
  const bytes = danishOfficeExport(exported.bytes, 'xlsx');
  // Python's independent standard-library ZIP/XML readers validate the package.
  const parsed = JSON.parse(execFileSync('python3', ['-c', `
import sys,io,json,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ss=E.fromstring(z.read('xl/sharedStrings.xml')); strings=[''.join(i.itertext()) for i in ss]
wb=E.fromstring(z.read('xl/workbook.xml'))
names=[s.attrib['name'] for s in wb.find('s:sheets',ns)]
data=E.fromstring(z.read('xl/worksheets/sheet2.xml'))
rows=[]
for row in data.find('s:sheetData',ns):
 values=[]
 for cell in row:
  v=cell.find('s:v',ns); value=v.text if v is not None else ''
  values.append(strings[int(value)] if cell.attrib.get('t')=='s' else int(value))
 rows.append(values)
charts=[z.read(p).decode() for p in z.namelist() if p.startswith('xl/charts/chart') and p.endswith('.xml')]
print(json.dumps({'strings':strings,'sheets':names,'rows':rows,'charts':charts}))
`], { input: bytes, encoding: 'utf8', maxBuffer: 2_000_000 }));
  assert.deepEqual(parsed.sheets, ['Rapport', 'Data 1', 'Diagram 1', 'Diagram 2']);
  assert.ok(parsed.strings.includes('Kildeversion'));
  assert.ok(parsed.strings.includes('Kildetidspunkt'));
  assert.ok(parsed.strings.includes('Øjebliksbillede SHA-256'));
  assert.ok(parsed.strings.includes(rendered.hash));
  assert.ok(parsed.strings.includes(original.source.version));
  assert.deepEqual(parsed.rows[0], ['Produkt', 'Pakker', 'Udviklet', 'Under udvikling', 'Planlagt', 'På vej']);
  assert.deepEqual(parsed.rows.slice(1), original.datasets.products.rows.map(row => Object.values(row)));
  for (const [index, chart] of parsed.charts.entries()) {
    assert.match(chart, new RegExp(`'Diagram ${index + 1}'!`));
    assert.doesNotMatch(chart, /'Chart \d+'!/);
  }
  assert.throws(() => danishOfficeExport(Buffer.from('not a ZIP'), 'xlsx'), /Invalid/);
  assert.throws(() => danishOfficeExport(bytes, 'html'), /Unsupported/);
});

test('generated Danish documents and receipts identify the final localized bytes and the same source data', async () => {
  const directory = new URL('../da/roadmap/report/', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL('export-receipt.json', directory), 'utf8'));
  const json = await readFile(new URL('snapshot.json', directory), 'utf8');
  const snapshot = JSON.parse(json);
  assert.equal(sha256(json), receipt.snapshotHash);
  assert.deepEqual(snapshot.datasets, original.datasets);
  assert.equal(snapshot.source.version, original.source.version);
  assert.equal(receipt.hostPresentation.locale, 'da-DK');
  assert.equal(receipt.hostPresentation.adapter, 'roadmap-report-da-v1');
  for (const [file, expected] of Object.entries(receipt.files)) {
    const bytes = await readFile(new URL(file, directory));
    assert.equal(sha256(bytes), expected.sha256, file);
    assert.equal(bytes.length, expected.bytes, file);
  }
  const standalone = await readFile(new URL('roadmap.html', directory), 'utf8');
  assert.match(standalone, /lang="da"/);
  assert.match(standalone, new RegExp(receipt.snapshotHash));
  assert.match(standalone, /Hvad tallene betyder/);
  const checked = execFileSync('python3', ['-c', `
import sys,zipfile,xml.etree.ElementTree as E
from pathlib import Path
for extension in ['docx','xlsx','pptx']:
 z=zipfile.ZipFile(Path(sys.argv[1])/('roadmap.'+extension)); assert z.testzip() is None
 texts=[]
 for name in z.namelist():
  if name.endswith('.xml'): texts.extend(E.fromstring(z.read(name)).itertext())
 text=' '.join(texts)
 assert all(label in text for label in ['Roadmapoverblik','Under udvikling','Planlagt','MR Softwares offentlige roadmap'])
 assert 'Published features' not in text and 'Content snapshot ' not in text
 if extension=='docx': assert 'w:val="da-DK"' in z.read('word/styles.xml').decode()
 if extension=='pptx':
  for name in z.namelist():
   if name.startswith('ppt/slides/slide') and name.endswith('.xml'): assert 'lang="da-DK"' in z.read(name).decode()
  assert 'Click to edit Master text styles' not in text
print('All localized Office archives verified')
`, directory.pathname], { encoding: 'utf8' });
  assert.match(checked, /All localized Office archives verified/);
});
