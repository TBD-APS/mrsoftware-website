import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { wranglerAssetManifest } from './helpers/wrangler-manifest.mjs';
import { renderRelatedLinks } from '../js/linking.js';
import { graph } from '../js/site-links.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('the actual company upload manifest excludes commercial source, builds and internal evidence', async t => {
  const sentinel = path.join(root, 'test-results/task4-private-sentinel.txt');
  await mkdir(path.dirname(sentinel), { recursive: true });
  await writeFile(sentinel, 'Synthetic private test evidence');
  t.after(() => rm(sentinel, { force: true }));
  const manifest = await wranglerAssetManifest(root);
  assert.ok(manifest['/index.html'] || manifest['index.html'], 'Company homepage is still uploaded');
  const leaked = Object.keys(manifest).filter(file => /(?:^|\/)(?:backoffice|commercial|\.commercial-dist|\.superpowers|\.astro|docs|qa|tests|test-results|tools|\.local|node_modules)(?:\/|$)|(?:^|\/)(?:wrangler[^/]*|astro\.[^/]*|commercial\.[^/]*|playwright\.[^/]*|AGENTS\.md|package[^/]*)$/.test(file));
  assert.deepEqual(leaked, [], 'The company upload must contain public company assets only');
  await mkdir(path.join(root, '.local'), { recursive: true });
  await writeFile(path.join(root, '.local/company-asset-manifest.json'), JSON.stringify(manifest, null, 2));
});

test('commercial packaging contains only compiled application assets, without preview seed or source files', async () => {
  let config;
  try { config = JSON.parse(await readFile(path.join(root, 'wrangler.commercial.jsonc'), 'utf8')); } catch {}
  assert.equal(config?.assets?.directory, '.commercial-dist', 'A dedicated commercial assets root is required');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.name, 'mrsoftware-commercial');
  const manifest = await wranglerAssetManifest(path.join(root, config.assets.directory));
  const files = Object.keys(manifest).map(file => file.replace(/^\//, ''));
  assert.ok(files.includes('backoffice/index.html'));
  assert.ok(files.includes('pricing/index.html'));
  assert.deepEqual(files.filter(file => /(?:^|\/)(?:server|migrations|tests|docs|\.local)(?:\/|$)|\.(?:astro|sql|map)$/.test(file)), []);
  for (const file of files) {
    const bytes = await readFile(path.join(root, config.assets.directory, file));
    assert.doesNotMatch(bytes.toString('utf8'), /Local preview customer|preview-owner@example\.test|Synthetic sales note:|sales_customers|CREATE TABLE sales_/);
  }
  await writeFile(path.join(root, '.local/commercial-asset-manifest.json'), JSON.stringify(manifest, null, 2));
});

test('company homepage and product pages offer direct public demo and pricing entry points', async () => {
  assert.ok(renderRelatedLinks(graph, 'home').includes('href="/demos/"'), 'Home offers the demo directory from the link catalogue');
  assert.ok(renderRelatedLinks(graph, 'home').includes('href="/pricing/"'), 'Home offers prices from the link catalogue');
  for (const product of ['workslip', 'tradey', 'shippy']) {
    const html = renderRelatedLinks(graph, product);
    assert.ok(html.includes(`href="/demos/${product}/"`), `${product} opens its exact demo record`);
    assert.ok(html.includes(`href="/pricing/${product}/"`), `${product} offers prices`);
  }
});
