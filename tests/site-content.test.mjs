import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { applyHomepageCtaHtml, mergeHomepageCta, renderHomepageCtaBlock } from '../tools/render-content.mjs';

const original = { homepageCta: mergeHomepageCta({}), unrelated: 'keep this' };
const html = '<main><!-- CTA:homepage:start -->old<!-- CTA:homepage:end --></main>';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'site-content-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data/site-content.json'), JSON.stringify(original));
  await writeFile(join(root, 'index.html'), html);
  const previousRoot = process.env.LINKS_ROOT;
  let config;
  try {
    process.env.LINKS_ROOT = root;
    ({ default: config } = await import(`../backoffice/vite.config.js?root=${encodeURIComponent(root)}`));
  } finally {
    if (previousRoot === undefined) delete process.env.LINKS_ROOT;
    else process.env.LINKS_ROOT = previousRoot;
  }
  let middleware;
  config.plugins[0].configureServer({ middlewares: { use: handler => { middleware = handler; } } });
  async function api(method, data, headers = {}) {
    const request = Readable.from(data ? [JSON.stringify(data)] : [], { objectMode: false });
    request.url = '/api/site-content';
    request.method = method;
    request.headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json', ...headers };
    const result = {};
    await middleware(request, {
      writeHead(status, responseHeaders) { Object.assign(result, { status, headers: responseHeaders }); return this; },
      end(body) { result.body = body; },
    }, () => assert.fail('The content API must handle its route'));
    return result;
  }
  return { root, api, content: async () => JSON.parse(await readFile(join(root, 'data/site-content.json'), 'utf8')) };
}

test('CTA rendering rejects executable URLs in either button and accepts ordinary links', () => {
  for (const field of ['primaryHref', 'secondaryHref']) {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///tmp/private', null, {}]) {
      assert.throws(() => renderHomepageCtaBlock({ ...original.homepageCta, [field]: href }), /link|URL/i);
    }
    for (const href of ['/demo/', 'https://example.com/path?a=1&b=2', 'mailto:hello@example.com', 'tel:+4512345678']) {
      assert.match(renderHomepageCtaBlock({ ...original.homepageCta, [field]: href }), /<a /);
    }
  }
});

test('CTA rendering keeps replacement syntax and HTML text literal', () => {
  const result = applyHomepageCtaHtml(html, { ...original.homepageCta, heading: 'Price $& <script> $`' });
  assert.match(result, /Price \$&amp; &lt;script&gt; \$`/);
  assert.equal(result.split('<!-- CTA:homepage:start -->').length, 2);
});

test('content writes reject executable links, cross-origin requests and non-JSON requests without changing files', async t => {
  const { root, api, content } = await fixture(t);
  const loaded = await api('GET');
  const headers = { 'if-match': loaded.headers.etag };
  for (const field of ['primaryHref', 'secondaryHref']) {
    assert.equal((await api('POST', { ...original.homepageCta, [field]: 'javascript:alert(1)' }, headers)).status, 400);
  }
  assert.equal((await api('POST', original.homepageCta, { ...headers, origin: 'https://example.com' })).status, 403);
  assert.equal((await api('POST', original.homepageCta, { ...headers, origin: 'null' })).status, 403);
  assert.equal((await api('POST', original.homepageCta, { ...headers, 'content-type': 'text/plain' })).status, 415);
  assert.deepEqual(await content(), original);
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), html);
});

test('content saves require the loaded version and reject stale or concurrent edits', async t => {
  const { root, api, content } = await fixture(t);
  const loaded = await api('GET');
  assert.equal(loaded.status, 200);
  assert.ok(loaded.headers.etag);
  const first = { ...JSON.parse(loaded.body), heading: 'Newer heading' };
  assert.equal((await api('POST', first)).status, 428);
  const headers = { 'if-match': loaded.headers.etag };
  const saved = await api('POST', first, headers);
  assert.equal(saved.status, 200);
  assert.notEqual(saved.headers.etag, loaded.headers.etag);
  assert.equal((await api('POST', original.homepageCta, headers)).status, 412);
  assert.equal((await content()).homepageCta.heading, first.heading);
  assert.equal((await content()).unrelated, original.unrelated);
  assert.match(await readFile(join(root, 'index.html'), 'utf8'), /Newer heading/);
  const simultaneous = await Promise.all(['One', 'Two'].map(heading => api('POST', { ...first, heading }, { 'if-match': saved.headers.etag })));
  assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 412]);
});

test('a page without CTA markers fails before changing saved content', async t => {
  const { root, api, content } = await fixture(t);
  const loaded = await api('GET');
  await writeFile(join(root, 'index.html'), '<main>Keep this page</main>');
  assert.equal((await api('POST', { ...original.homepageCta, heading: 'New' }, { 'if-match': loaded.headers.etag })).status, 400);
  assert.deepEqual(await content(), original);
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), '<main>Keep this page</main>');
});
