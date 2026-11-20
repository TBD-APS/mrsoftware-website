import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { changeLinks, checkGraph, renderRelatedLinks } from '../js/linking.js';
import { graph } from '../js/site-links.js';

test('the public link module matches the catalogue', async () => {
  const { sitemapPages, ...file } = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
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

test('the link editor API preserves sitemap metadata when saving the link graph', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-links-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data'));
  const original = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
  await writeFile(join(root, 'data/links.json'), JSON.stringify(original));
  const previousRoot = process.env.LINKS_ROOT;
  let config;
  try {
    process.env.LINKS_ROOT = root;
    ({ default: config } = await import('../backoffice/vite.config.js'));
  } finally {
    if (previousRoot === undefined) delete process.env.LINKS_ROOT;
    else process.env.LINKS_ROOT = previousRoot;
  }
  let middleware;
  config.plugins[0].configureServer({ middlewares: { use: handler => { middleware = handler; } } });
  async function api(method, data) {
    const request = Readable.from(data ? [JSON.stringify(data)] : [], { objectMode: false });
    request.url = '/api/links';
    request.method = method;
    let status;
    let body;
    await middleware(request, {
      writeHead(code) { status = code; return this; },
      end(text) { body = text; },
    }, () => assert.fail('The links API must handle its route'));
    assert.equal(status, 200, body);
    return JSON.parse(body);
  }
  assert.deepEqual(await api('GET'), graph);
  const edited = changeLinks(graph, { type: 'add', fromId: 'the-offer', toId: 'roadmap' });
  assert.deepEqual(await api('POST', edited), edited);
  assert.deepEqual(await api('GET'), edited);
  const saved = JSON.parse(await readFile(join(root, 'data/links.json'), 'utf8'));
  assert.deepEqual(saved, { ...edited, sitemapPages: original.sitemapPages });
  const source = await readFile(join(root, 'js/site-links.js'), 'utf8');
  const published = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  assert.deepEqual(published.graph, edited);
});
