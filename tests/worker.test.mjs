import { test } from 'node:test';
import assert from 'node:assert/strict';
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
