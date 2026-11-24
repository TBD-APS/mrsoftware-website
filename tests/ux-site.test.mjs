import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startSite } from '../tools/ux-site.mjs';

test('the audit server serves selected base assets and the real public crawler responses', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'website-seo-base-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dashboard'));
  await mkdir(path.join(root, 'data'));
  for (const name of ['index.html', 'app.js', 'code-graph.js', 'styles.css']) await writeFile(path.join(root, 'dashboard', name), 'test-only dashboard');
  await writeFile(path.join(root, 'index.html'), '<h1>Base public assets</h1>');
  await writeFile(path.join(root, 'data/links.json'), JSON.stringify({ places: [{ href: '/' }, { href: '/demos/' }] }));
  const site = await startSite({ publicRoot: root });
  t.after(() => site.close());
  const base = 'http://127.0.0.1:' + new URL(site.base).port;
  assert.match(await (await fetch(base)).text(), /Base public assets/);
  const sitemap = await fetch(base + '/sitemap.xml');
  assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.doesNotMatch(await sitemap.text(), /\/demos\//);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/_development\//);
  assert.equal((await fetch(base + '/robots.txt', { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(base + '/robots.txt', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/.git/config')).status, 403);
  const missing = await fetch(base + '/no-such-page');
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');
});

test('a missing company address returns the styled 404 page and the icon', async t => {
  const site = await startSite();
  t.after(() => site.close());
  const base = 'http://127.0.0.1:' + new URL(site.base).port;
  const missing = await fetch(base + '/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
  assert.match(await missing.text(), /This page is not on the site/);
  const icon = await fetch(base + '/favicon.ico');
  assert.equal(icon.status, 200);
  assert.ok((await icon.arrayBuffer()).byteLength > 16);
});
