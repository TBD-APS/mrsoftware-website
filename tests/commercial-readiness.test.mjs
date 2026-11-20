import test from 'node:test';
import assert from 'node:assert/strict';
import { productionCommercial } from './helpers/production-commercial.mjs';

async function readiness(request, options) {
  const module = await import('../tools/commercial-readiness.mjs').catch(() => ({}));
  assert.equal(typeof module.commercialReadiness, 'function', 'The commercial readiness gate is required');
  return module.commercialReadiness(request, options);
}

test('post-deployment readiness rechecks GET-only probes for a temporarily missing compiled asset', async t => {
  const app = await productionCommercial(t);
  const delays = [], methods = [];
  let failures = 2;
  const receipt = await readiness((url, options) => {
    methods.push(options.method);
    if (url.includes('/_astro/') && failures > 0) { failures--; return new Response('Not propagated', { status: 404 }); }
    return app.mf.dispatchFetch(url, options);
  }, { assetPropagation: true, pause: async ms => { delays.push(ms); } });
  assert.deepEqual(delays, [1000, 3000]);
  assert.ok(receipt.length >= 10);
  assert.ok(methods.every(method => method === 'GET'));
});

test('the asset propagation window is bounded and never delays other readiness failures', async t => {
  const app = await productionCommercial(t);
  const delays = [];
  await assert.rejects(readiness((url, options) => url.includes('/_astro/') ? new Response('Missing', { status: 404 }) : app.mf.dispatchFetch(url, options),
    { assetPropagation: true, pause: async ms => { delays.push(ms); } }), /HTTP 404/);
  assert.deepEqual(delays, [1000, 3000, 10000, 15000, 30000]);
  for (const failure of ['public-page', 'private', 'asset-403', 'asset-foreign-404']) {
    let pauses = 0;
    await assert.rejects(readiness((url, options) => {
      if (failure === 'public-page' && url === 'https://demos.mrsoftware.dk/') return new Response('Missing', { status: 404 });
      if (failure === 'private' && url.startsWith('https://backoffice.')) return new Response('<h1>Exposed</h1>', { headers: { 'Content-Type': 'text/html' } });
      if (failure === 'asset-403' && url.includes('/_astro/')) return new Response('Forbidden', { status: 403 });
      if (failure === 'asset-foreign-404' && url.includes('/_astro/')) return { status: 404, url: 'https://wrong.example.test/missing.css' };
      return app.mf.dispatchFetch(url, options);
    }, { assetPropagation: true, pause: async () => { pauses++; } }));
    assert.equal(pauses, 0, failure);
  }
});

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

async function withEdgeScript(app, url, options, tag, bridgeStatus = 200) {
  if (url === 'https://demos.mrsoftware.dk/.webmcp/bridge.js') return new Response('// Cloudflare WebMCP bridge', { status: bridgeStatus, headers: { 'Content-Type': 'application/javascript' } });
  const response = await app.mf.dispatchFetch(url, options);
  if (!response.headers.get('Content-Type')?.includes('text/html') || !url.startsWith('https://demos.')) return response;
  return new Response((await response.text()).replace('<head>', `<head>${tag}`), { status: response.status, headers: response.headers });
}

test('readiness checks the same-origin Cloudflare WebMCP script injected at the edge', async t => {
  const app = await productionCommercial(t);
  const receipt = await readiness((url, options) => withEdgeScript(app, url, options, '<script type="module" async fetchpriority="low" src="https://demos.mrsoftware.dk/.webmcp/bridge.js" data-packs="c2pa,mcp-server-client"></script>'));
  assert.deepEqual(receipt.filter(item => item.url.includes('/.webmcp/')), [{ url: 'https://demos.mrsoftware.dk/.webmcp/bridge.js', status: 200 }]);
});

test('readiness still rejects other injected dependencies and an unavailable WebMCP bridge', async t => {
  const app = await productionCommercial(t);
  for (const source of ['https://wrong.example.test/.webmcp/bridge.js', '/.webmcp/bridge.js?extra=1', '/.webmcp/bridge.js/extra', '/backoffice/private.js']) {
    await assert.rejects(readiness((url, options) => withEdgeScript(app, url, options, `<script type="module" src="${source}"></script>`)), /unexpected application dependency/);
  }
  await assert.rejects(readiness((url, options) => withEdgeScript(app, url, options, '<script type="module" src="/.webmcp/bridge.js"></script>', 404)));
});

test('readiness accepts Cloudflare Access relative return paths while rejecting off-host returns', async t => {
  const app = await productionCommercial(t);
  const request = returnTo => (url, options) => {
    if (!url.startsWith('https://backoffice.mrsoftware.dk/')) return app.mf.dispatchFetch(url, options);
    const login = new URL('https://sales.cloudflareaccess.com/cdn-cgi/access/login/backoffice.mrsoftware.dk');
    login.searchParams.set('redirect_url', returnTo ?? new URL(url).pathname);
    return new Response(null, { status: 302, headers: { Location: login.href, 'Cache-Control': 'private, no-store' } });
  };
  const receipt = await readiness(request());
  assert.equal(receipt.filter(item => item.url.startsWith('https://backoffice.mrsoftware.dk/') && item.status === 302).length, 3);
  for (const returnTo of ['https://wrong.example.test/', '//wrong.example.test/', 'javascript:alert(1)']) await assert.rejects(readiness(request(returnTo)), /wrong-host return address/);
});
