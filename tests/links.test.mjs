import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { changeLinks, checkGraph, renderRelatedLinks } from '../js/linking.js';
import { graph } from '../js/site-links.js';
import { renderLinkSlots, publicLinkUpdates } from '../tools/prerender-links.mjs';

test('related links are present in the checked-in HTML before scripts run', async () => {
  const root = new URL('..', import.meta.url);
  assert.deepEqual(await publicLinkUpdates(root, graph), [], 'Regenerate public links with npm run build:links');
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /id="related-home"[^>]*>Research and use cases<\/h2>/);
  assert.match(home, /class="related-link" href="\/research\/"/);
});

test('prerendering updates nested link content while preserving the rest of the page', () => {
  const source = '<main><div data-related-from="the-offer" data-related-heading="Next &amp; more"><section><p>Old links</p></section></div><p>Keep this</p></main>';
  const result = renderLinkSlots(source, graph);
  assert.match(result, /Next &amp; more<\/h2>/);
  assert.match(result, /href="\/stories\/the-job\/"/);
  assert.doesNotMatch(result, /Old links/);
  assert.ok(result.endsWith('</div><p>Keep this</p></main>'));
  assert.equal(renderLinkSlots(result, graph), result);
  assert.throws(() => renderLinkSlots('<div data-related-from="missing"></div>', graph), /Unknown related-link source/);
});

test('compact link lists use the catalogue and escape names before scripts run', () => {
  const catalogue = {
    places: [{ id: 'cases', title: 'Use cases', href: '/#solutions' }, { id: 'example', title: 'One & more', href: '/example/' }],
    links: { cases: [{ id: 'to:example', toId: 'example' }] },
  };
  const source = '<footer><div data-link-list-from="cases" data-link-list-heading="Use cases"><p>Old links</p></div><p>Keep this</p></footer>';
  const result = renderLinkSlots(source, catalogue);
  assert.match(result, /<h2>Use cases<\/h2><a href="\/example\/">One &amp; more<\/a>/);
  assert.doesNotMatch(result, /Old links/);
  assert.ok(result.endsWith('</div><p>Keep this</p></footer>'));
  assert.equal(renderLinkSlots(result, catalogue), result);
});

test('prerendering includes public footer lists on sitemap-only pages and demo snapshots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'site-footer-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data'));
  await mkdir(join(root, 'privacy-policy'));
  await mkdir(join(root, 'demo/snapshot'), { recursive: true });
  const catalogue = { places: [{ id: 'home', title: 'Home', href: '/' }, { id: 'case', title: 'Case', href: '/case/' }], links: { home: [{ id: 'to:case', toId: 'case' }] } };
  await writeFile(join(root, 'data/links.json'), JSON.stringify({ ...catalogue, sitemapPages: ['/privacy-policy/'] }));
  await writeFile(join(root, 'privacy-policy/index.html'), '<footer data-link-list-from="home" data-link-list-heading="Use cases">Old links</footer>');
  await writeFile(join(root, 'demo/snapshot/index.html'), '<footer data-link-list-from="home" data-link-list-heading="Use cases">Old links</footer>');
  const updates = await publicLinkUpdates(root, catalogue);
  assert.equal(updates.length, 2);
  for (const update of updates) assert.match(update.html, /href="\/case\/">Case<\/a>/);
});

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
  await mkdir(join(root, 'stories/the-offer'), { recursive: true });
  await writeFile(join(root, 'stories/the-offer/index.html'), '<div data-related-from="the-offer"></div>');
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
  const page = await readFile(join(root, 'stories/the-offer/index.html'), 'utf8');
  assert.match(page, /class="related-link" href="\/roadmap\/"/);
});
