import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { createDashboardHandler } from '../dashboard/handler.mjs';
import { publicCommercialEntry } from '../website-entry.mjs';

const origin = 'https://mrsoftware.dk';
const catalogue = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
const internalPath = /^\/(?:qa|dashboard|backoffice|_development)(?:\/|$)/i;
const handle = createDashboardHandler({ files: {}, verifyAccess: () => assert.fail('Crawler files must be public') });

function request(path, data = catalogue, method = 'GET', host = origin) {
  return handle(new Request(host + path, { method }), {
    ASSETS: {
      fetch: async request => new URL(request.url).pathname === '/data/links.json'
        ? Response.json(data)
        : new Response('Not found', { status: 404 }),
    },
  });
}

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
}

test('the sitemap serves XML containing every public catalogue place and additional page', async () => {
  const response = await request('/sitemap.xml');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/xml; charset=utf-8');
  const xml = await response.text();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n/);
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<\/urlset>\s*$/);
  const urls = locations(xml);
  assert.ok(Array.isArray(catalogue.sitemapPages) && catalogue.sitemapPages.length > 0);
  const paths = [...catalogue.places.map(place => place.href), ...catalogue.sitemapPages];
  for (const path of paths.filter(path => !internalPath.test(path))) {
    assert.ok(urls.includes(origin + path), `Missing public page: ${path}`);
  }
  assert.equal(urls.length, new Set(urls).size, 'Sitemap URLs must be unique');
  for (const address of urls) {
    const url = new URL(address);
    assert.equal(url.origin, origin);
    assert.equal(url.hash, '');
    assert.equal(url.search, '');
    assert.equal(internalPath.test(url.pathname), false, `Internal page: ${address}`);
    const entry = publicCommercialEntry(new Request(address));
    if (entry) {
      assert.equal(entry.status, 307);
      assert.equal(new URL(entry.headers.get('Location')).origin, 'https://demos.mrsoftware.dk');
      continue;
    }
    const page = await stat(new URL(`..${url.pathname}index.html`, import.meta.url));
    assert.ok(page.isFile(), `Missing page file for ${address}`);
  }
});

test('sitemap generation follows catalogue changes while excluding internal and external addresses', async () => {
  const privatePaths = ['/qa', '/qa/', '/qa/report.html', '/dashboard', '/dashboard/', '/dashboard/tasks',
    '/backoffice', '/backoffice/', '/backoffice/editor', '/_development', '/_development/', '/_development/data.js'];
  const data = {
    places: [...privatePaths.map(href => ({ href })), { href: '/new-public-page/' }, { href: '/new-public-page/#details' }],
    sitemapPages: [...privatePaths, '/another-public-page/', 'https://example.com/', '//example.com/', '/%71a/', '/public/../qa/'],
  };
  const response = await request('/sitemap.xml', data, 'GET', 'https://preview.example.com');
  assert.equal(response.status, 200);
  assert.deepEqual(locations(await response.text()), [origin + '/new-public-page/', origin + '/another-public-page/']);
});

test('sitemap URL text is XML escaped', async () => {
  const response = await request('/sitemap.xml', { places: [{ href: '/research&development/' }] });
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.ok(xml.includes('<loc>https://mrsoftware.dk/research&amp;development/</loc>'));
  assert.equal(xml.includes('/research&development/'), false);
});

test('robots allows public crawling, disallows internal paths and advertises the canonical sitemap', async () => {
  const response = await request('/robots.txt');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  const text = await response.text();
  assert.match(text, /^User-agent: \*$/m);
  assert.match(text, /^Allow: \/$/m);
  for (const path of ['/qa/', '/dashboard', '/backoffice', '/_development/']) {
    assert.ok(text.split('\n').includes(`Disallow: ${path}`), `Missing robots disallow: ${path}`);
  }
  assert.ok(text.split('\n').includes('Sitemap: https://mrsoftware.dk/sitemap.xml'));
});

test('crawler files support HEAD and reject writes', async () => {
  for (const path of ['/sitemap.xml', '/robots.txt']) {
    const head = await request(path, catalogue, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('Content-Type'), (await request(path)).headers.get('Content-Type'));
    const post = await request(path, catalogue, 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  }
});

test('a missing catalogue does not produce a successful partial sitemap', async () => {
  const response = await handle(new Request(origin + '/sitemap.xml'), {
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /<urlset|<loc>/);
});
