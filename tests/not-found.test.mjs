import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDashboardHandler } from '../dashboard/handler.mjs';

const origin = 'https://mrsoftware.dk';
const page = '<!DOCTYPE html><title>Page not found</title><meta name="robots" content="noindex">';
const icon = Buffer.from([0, 0, 1, 0, 1]);

function assets(files) {
  return {
    fetch: async request => {
      const path = new URL(request.url).pathname;
      if (!Object.hasOwn(files, path)) return new Response('Not found', { status: 404 });
      return new Response(files[path], { headers: { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/x-icon' } });
    },
  };
}

const handle = createDashboardHandler({ files: {}, verifyAccess: () => assert.fail('A missing public page must not ask for Access') });

function request(path, { method = 'GET', accept = 'text/html', files = { '/404.html': page, '/favicon.ico': icon } } = {}) {
  return handle(new Request(origin + path, { method, headers: accept ? { Accept: accept } : {} }), { ASSETS: assets(files) });
}

test('an unknown address returns the styled page with status 404 and noindex', async () => {
  const response = await request('/does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.match(await response.text(), /Page not found/);
  const head = await request('/does-not-exist/', { method: 'HEAD' });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('X-Robots-Tag'), 'noindex');
});

test('a missing file keeps its own 404 and the icon is served', async () => {
  const script = await request('/missing.js', { accept: '*/*' });
  assert.equal(script.status, 404);
  assert.equal(await script.text(), 'Not found');
  assert.equal(script.headers.get('X-Robots-Tag'), null);
  const data = await request('/api/unknown', { accept: 'application/json' });
  assert.equal(data.status, 404);
  assert.equal(await data.text(), 'Not found');
  const iconResponse = await request('/favicon.ico', { accept: '*/*' });
  assert.equal(iconResponse.status, 200);
  assert.equal(Buffer.from(await iconResponse.arrayBuffer()).subarray(0, 4).toString('hex'), '00000100');
});

test('the checked-in 404 page and icon match the worker contract', async () => {
  const html = await readFile(new URL('../404.html', import.meta.url), 'utf8');
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/#solutions"/);
  const catalogue = await readFile(new URL('../data/links.json', import.meta.url), 'utf8');
  assert.equal(catalogue.includes('/404'), false);
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"not_found_handling": "404-page"/);
  const file = await readFile(new URL('../favicon.ico', import.meta.url));
  assert.equal(file.subarray(0, 4).toString('hex'), '00000100');
  assert.ok(file.length > 16);
});
