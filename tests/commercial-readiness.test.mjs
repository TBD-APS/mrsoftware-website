import test from 'node:test';
import assert from 'node:assert/strict';
import { productionCommercial } from './helpers/production-commercial.mjs';

async function readiness(request) {
  const module = await import('../tools/commercial-readiness.mjs').catch(() => ({}));
  assert.equal(typeof module.commercialReadiness, 'function', 'The commercial readiness gate is required');
  return module.commercialReadiness(request);
}

test('readiness verifies built public catalogue/pages/dependencies and private denial without any sales writes', async t => {
  const app = await productionCommercial(t);
  const requests = [];
  const receipt = await readiness((url, options) => {
    requests.push([url, options]);
    return app.mf.dispatchFetch(url, options);
  });
  assert.ok(receipt.length >= 10);
  assert.ok(requests.some(([url]) => /\/_astro\/.*\.js$/.test(url)));
  assert.ok(requests.some(([url]) => url === 'https://backoffice.mrsoftware.dk/'));
  for (const [url, options] of requests) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.ok(url.startsWith('https://demos.mrsoftware.dk/') || url.startsWith('https://backoffice.mrsoftware.dk/'));
  }
  for (const table of ['sales_customers', 'sales_opportunities', 'sales_quotes', 'sales_enquiries']) assert.equal((await app.db.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count, 0);
});

test('readiness rejects unavailable, malformed, wrong-host and exposed-private responses', async t => {
  const app = await productionCommercial(t);
  for (const mode of ['unavailable', 'catalogue', 'redirect', 'private', 'asset']) {
    await assert.rejects(readiness((url, options) => {
      if (mode === 'unavailable') return Promise.reject(Error('Network unavailable'));
      if (mode === 'catalogue' && url.endsWith('/api/catalog')) return Response.json({ catalog: { revision: 1, currency: 'EUR', packages: [], demos: [] } });
      if (mode === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://wrong.example.test/' } });
      if (mode === 'private' && url.startsWith('https://backoffice.')) return new Response('<h1>Private customer</h1>', { headers: { 'Content-Type': 'text/html' } });
      if (mode === 'asset' && url.includes('/_astro/')) return new Response('Not found', { status: 404 });
      return app.mf.dispatchFetch(url, options);
    }), undefined, mode);
  }
});
