import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkGraph, renderRelatedLinks } from '../js/linking.js';
import { graph } from '../js/site-links.js';

test('the public link module matches the catalogue', async () => {
  const file = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
  const checked = checkGraph(file);
  assert.equal(checked.ok, true);
  assert.deepEqual(graph, checked.graph);
});

test('the offer page links across the other working days', () => {
  const html = renderRelatedLinks(graph, 'the-offer');
  assert.match(html, /href="\/stories\/the-job\/"/);
  assert.match(html, /href="\/stories\/the-shipment\/"/);
  assert.match(html, /href="\/stories\/the-choices\/"/);
  assert.match(html, /href="\/products\/tradey\/"/);
  assert.equal(renderRelatedLinks(graph, 'stories'), '');
});
