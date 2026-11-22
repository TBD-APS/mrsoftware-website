import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createDashboardHandler } from '../dashboard/handler.mjs';
import { verifyTestAccess, testToken } from './ux/access-fixture.mjs';

const files = { 'index.html': '<h1>Private overview</h1>', 'graphs.js': 'private graph', 'data.js': 'private data' };
const handle = createDashboardHandler({ files, verifyAccess: verifyTestAccess });
const assets = { ASSETS: { fetch: () => new Response('Public homepage') } };
const request = async (host, path, token, method = 'GET') => handle(new Request('https://' + host + path, { method, headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} }), assets);

test('Private content requires both the dashboard host and a valid Access token', async () => {
  const valid = await testToken();
  for (const host of ['mrsoftware.dk', 'mrsoftware.rasmusvm6.workers.dev', 'preview-mrsoftware.rasmusvm6.workers.dev']) {
    for (const path of ['/_development/', '/_development/data.js', '/_development/graphs.js']) assert.equal((await request(host, path, valid)).status, 404);
  }
  const parts = valid.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  for (const token of [null, 'forged', parts.join('.'), await testToken({ aud: 'different-app' }), await testToken({ iss: 'https://example.invalid' }), await testToken({ exp: 1 }), await testToken({ nbf: Math.floor(Date.now()/1000) + 3600 })]) {
    assert.equal((await request('dashboard.mrsoftware.dk', '/_development/graphs.js', token)).status, 401);
  }
  const response = await request('dashboard.mrsoftware.dk', '/_development/graphs.js', valid);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), files['graphs.js']);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
});

test('Private routes do not list files, accept writes or expose unknown objects', async () => {
  const valid = await testToken();
  assert.equal((await request('dashboard.mrsoftware.dk', '/_development/__proto__', valid)).status, 404);
  assert.equal((await request('dashboard.mrsoftware.dk', '/_development/data.js', valid, 'POST')).status, 405);
  assert.equal(await (await request('dashboard.mrsoftware.dk', '/_development/data.js', valid, 'HEAD')).text(), '');
  const redirect = await request('dashboard.mrsoftware.dk', '/_development?view=code', valid);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), 'https://dashboard.mrsoftware.dk/_development/?view=code');
});

test('Company pages use the existing public asset binding', async () => {
  assert.equal(await (await request('mrsoftware.dk', '/privacy-policy/')).text(), 'Public homepage');
});

test('Cacheable hero filenames identify the exact encoded bytes', async () => {
  const directory = new URL('../assets/hero/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.webp'))) {
    const bytes = await readFile(new URL(name, directory));
    const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    assert.ok(name.endsWith('.' + fingerprint + '.webp'), 'Changing image bytes requires a new cache key: ' + name);
  }
});

test('Fingerprinted hero images keep asset validators and may be cached for one year', async () => {
  for (const [method, status] of [['GET', 200], ['HEAD', 200], ['GET', 206], ['GET', 304]]) {
    const response = await handle(new Request('https://mrsoftware.dk/assets/hero/workflow-800.012345abcdef.webp', { method }), {
      ASSETS: { fetch: () => new Response(method === 'HEAD' || status === 304 ? null : 'image bytes', {
        status, headers: { 'Content-Type': 'image/webp', ETag: '"asset-hash"', 'CF-Cache-Status': 'HIT', 'Cache-Control': 'public, max-age=0, must-revalidate' },
      }) },
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('ETag'), '"asset-hash"');
    assert.equal(response.headers.get('CF-Cache-Status'), 'HIT');
    assert.equal(response.headers.get('Content-Type'), 'image/webp');
    assert.equal(await response.text(), method === 'HEAD' || status === 304 ? '' : 'image bytes');
  }
});

test('Hero cache policy excludes failures, writes, mutable assets and HTML', async () => {
  for (const [pathname, method, status] of [
    ['/assets/hero/workflow-800.012345abcdef.webp', 'GET', 404],
    ['/assets/hero/workflow-800.012345abcdef.webp', 'GET', 500],
    ['/assets/hero/workflow-800.012345abcdef.webp', 'POST', 200],
    ['/assets/hero/workflow.webp', 'GET', 200],
    ['/assets/images/brand/mr-mark.svg', 'GET', 200],
    ['/', 'GET', 200],
  ]) {
    const response = await handle(new Request('https://mrsoftware.dk' + pathname, { method }), {
      ASSETS: { fetch: () => new Response('unchanged', { status, headers: { 'Cache-Control': 'no-cache' } }) },
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-cache', pathname + ' ' + method + ' ' + status);
  }
});
