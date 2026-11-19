import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productionCommercial } from './helpers/production-commercial.mjs';

test('built production Worker sends the signed-in private root to Today, preserving deep-link context', async t => {
  const app = await productionCommercial(t);
  const jwt = await app.token();
  const denied = await app.request('/?view=customers', { host: 'backoffice.mrsoftware.dk' });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  const entry = await app.request('/?view=customers', { host: 'backoffice.mrsoftware.dk', jwt });
  assert.equal(entry.status, 307);
  assert.equal(entry.headers.get('location'), 'https://backoffice.mrsoftware.dk/backoffice/?view=customers');
  assert.equal(entry.headers.get('cache-control'), 'private, no-store');
  assert.equal((await app.request('/backoffice/?view=customer&id=synthetic', { host: 'backoffice.mrsoftware.dk', jwt })).status, 200);
});

test('production routing protects actual private HTML and private entry assets on every host', async t => {
  const app = await productionCommercial(t);
  const html = await readFile(new URL('../.commercial-dist/backoffice/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const policy = JSON.parse(await readFile(new URL('../.local/commercial-asset-policy.json', import.meta.url), 'utf8'));
  assert.ok(scripts.length > 0);
  const jwt = await app.token();
  for (const route of new Set(['/backoffice/', '/backoffice/index.html', ...scripts, ...policy.protectedAssets])) {
    for (const host of ['demos.mrsoftware.dk', 'unknown.example.test']) assert.equal((await app.request(route, { host, jwt })).status, 404, `${host}${route}`);
    const denied = await app.request(route, { host: 'backoffice.mrsoftware.dk' });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    const response = await app.request(route, { host: 'backoffice.mrsoftware.dk', jwt });
    assert.ok([200, 307, 308].includes(response.status));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal((await app.request('/')).status, 200);
  assert.equal((await app.request('/pricing/')).status, 200);
  assert.equal((await app.request(scripts[0].replace('/_astro/', '/%5Fastro/'))).status, 404);
  for (const claims of [{ aud: 'dashboard-audience' }, { iss: 'https://other.cloudflareaccess.com' }, { exp: 1 }, { sub: '' }, { email: 'other@example.test' }]) {
    assert.equal((await app.request('/backoffice/', { host: 'backoffice.mrsoftware.dk', jwt: await app.token(claims) })).status, claims.email ? 403 : 401);
  }
});
