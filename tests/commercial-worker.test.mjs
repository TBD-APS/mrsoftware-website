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

test('built production Worker authorizes both approved users and attributes their real D1 changes separately', async t => {
  const app = await productionCommercial(t, { allowedEmails: 'owner@example.test,sales@example.test' });
  const save = async (jwt, name) => app.mf.dispatchFetch('https://backoffice.mrsoftware.dk/api/backoffice/customers', {
    method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': jwt, Origin: 'https://backoffice.mrsoftware.dk', 'X-Requested-With': 'MRSoftware', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts: [], notes: '' }),
  });
  for (const [sub, email] of [['synthetic-owner', 'owner@example.test'], ['synthetic-sales', 'Sales@Example.Test']]) {
    const jwt = await app.token({ sub, email });
    const session = await app.request('/api/backoffice/session', { host: 'backoffice.mrsoftware.dk', jwt });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { email: email.toLowerCase() });
    assert.equal(session.headers.get('cache-control'), 'private, no-store');
    assert.equal((await app.request('/backoffice/', { host: 'backoffice.mrsoftware.dk', jwt })).status, 200);
    const today = await app.request('/api/backoffice/today?date=2030-11-20', { host: 'backoffice.mrsoftware.dk', jwt });
    assert.equal(today.status, 200);
    assert.equal(today.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await today.json()).followUps, { items: [], next: null });
    assert.equal((await save(jwt, 'Customer saved by ' + sub)).status, 201);
  }
  const outsider = await save(await app.token({ sub: 'synthetic-outsider', email: 'unknown@example.test' }), 'Unauthorized customer');
  assert.equal(outsider.status, 403);
  assert.equal(outsider.headers.get('cache-control'), 'private, no-store');
  assert.equal((await app.db.prepare('SELECT count(*) AS total FROM sales_customers').first()).total, 2);
  const { results } = await app.db.prepare('SELECT document FROM sales_events').all();
  assert.deepEqual(results.map(row => JSON.parse(row.document).actor).sort((a, b) => a.email.localeCompare(b.email)), [
    { sub: 'synthetic-owner', email: 'owner@example.test' },
    { sub: 'synthetic-sales', email: 'sales@example.test' },
  ]);
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
