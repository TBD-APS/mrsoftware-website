import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { roadmapReport } from '../tools/roadmap-report.mjs';
import { renderRoadmap } from '../tools/sync-public-roadmap.mjs';
import { renderReport, sha256 } from '@mr-software/content';

const html = await readFile(new URL('../roadmap/index.html', import.meta.url), 'utf8');
const at = '2026-11-20T12:00:00Z';
test('report counts come only from the reviewed public feature region and retain status meaning', async () => {
  const input = roadmapReport(html, { at });
  const rendered = await renderReport(input);
  assert.equal(input.synthetic, false);
  assert.equal(input.source.url, 'https://mrsoftware.dk/roadmap/#roadmap-packages');
  assert.equal(rendered.metrics[0].value, 8);
  for (const row of input.datasets.products.rows) assert.equal(row.pipeline, row.development + row.planned);
  assert.equal(rendered.charts[0].data.reduce((sum, row) => sum + row.value, 0), rendered.metrics.find(metric => metric.id === 'developed').value);
  assert.match(input.blocks.at(-1).text, /not a measure of customer activation/);
  const polluted = html.replace('<!-- public-features:start -->', '<p>Private fake task: 9999999</p><!-- public-features:start -->');
  assert.deepEqual(roadmapReport(polluted, { at }), input);
});

test('newly published states change every derived export input together', () => {
  const fixture = renderRoadmap(html, [{ id: 'example', name: 'Example & Co', features: [
    { id: 'first-feature', title: 'First feature', summary: 'A reviewed feature.', source: { issue: 'SAS-1' } },
  ] }], new Map([['SAS-1', { archivedAt: null, state: { type: 'started' } }]]));
  const before = roadmapReport(fixture, { at });
  const after = roadmapReport(fixture.replace('>In development</span>', '>Developed</span>'), { at });
  assert.equal(before.datasets.products.rows[0].development, 1); assert.equal(after.datasets.products.rows[0].developed, 1);
  assert.notEqual(before.source.version, after.source.version);
  assert.throws(() => roadmapReport(fixture.replace('>In development</span>', '>Unknown</span>'), { at }), /Unknown/);
});

test('generated exports are bound to one snapshot and the public page contains its hash', async () => {
  const root = new URL('../roadmap/report/', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL('export-receipt.json', root), 'utf8'));
  const snapshot = await readFile(new URL('snapshot.json', root));
  assert.equal(sha256(snapshot), receipt.snapshotHash);
  for (const [name, file] of Object.entries(receipt.files)) assert.equal(sha256(await readFile(new URL(name, root))), file.sha256, name);
  assert.match((await readFile(new URL('index.html', root), 'utf8')), new RegExp(receipt.snapshotHash));
  assert.ok(Object.keys(receipt.files).includes('roadmap.pptx'));
  assert.ok(Object.keys(receipt.files).includes('roadmap.xlsx'));
  assert.equal((await readFile(new URL('roadmap.html', root), 'utf8')).includes('Report downloads'), false, 'The saved web page must not contain server-only download links');
});
