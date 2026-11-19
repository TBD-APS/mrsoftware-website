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

test('readiness ignores the Cloudflare WebMCP bridge and retries a dropped connection', async t => {
  const app = await productionCommercial(t);
  const { commercialReadiness } = await import('../tools/commercial-readiness.mjs');
  const requests = [];
  let dropped = false;
  let injected = 0;
  await commercialReadiness((url, options) => {
    requests.push(String(url));
    if (!dropped && String(url).endsWith('/api/catalog')) {
      dropped = true;
      return Promise.reject(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }));
    }
    return app.mf.dispatchFetch(url, options).then(async response => {
      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('text/html')) return response;
      const html = (await response.text()).replace('</head>', '<script type="module" src="https://demos.mrsoftware.dk/.webmcp/bridge.js" data-packs="c2pa,mcp-server-client"></script></head>');
      if (html.includes('/.webmcp/bridge.js')) injected++;
      return new Response(html, { status: response.status, headers: response.headers });
    });
  }, { sleep: async () => {} });
  assert.equal(requests.filter(url => url.endsWith('/api/catalog')).length, 2);
  assert.ok(injected > 0);
  assert.equal(requests.some(url => url.includes('/.webmcp/')), false);
});

test('readiness accepts a same-host Access return path and rejects a foreign one', async () => {
  const { commercialReadiness } = await import('../tools/commercial-readiness.mjs');
  const catalog = {
    revision: 1,
    currency: 'DKK',
    packages: [{ id: 'workslip-core', product: 'workslip', name: 'Core', monthlyMinor: 1, includes: ['Jobs'], active: true }],
    demos: ['workslip', 'tradey', 'shippy'].map(id => ({ id, title: id, summary: 'Demo', active: true })),
  };
  const request = redirect => async url => {
    const href = String(url);
    if (href.endsWith('/api/catalog')) return Response.json({ catalog });
    if (href === 'https://demos.mrsoftware.dk/backoffice/') return new Response('Not found', { status: 404 });
    if (href.endsWith('/manifest.webmanifest')) {
      const product = new URL(href).pathname.split('/')[1];
      return Response.json({ id: `/${product}/`, scope: `/${product}/`, start_url: `/${product}/` });
    }
    if (href.includes('/_astro/')) return new Response('ok', { headers: { 'Content-Type': 'text/javascript' } });
    if (href.startsWith('https://backoffice.mrsoftware.dk/')) {
      const location = new URL('https://mr-saasy.cloudflareaccess.com/cdn-cgi/access/login/backoffice.mrsoftware.dk');
      location.searchParams.set('redirect_url', redirect === 'same-path' ? new URL(href).pathname : redirect);
      return new Response(null, { status: 302, headers: { Location: location.href, 'Cache-Control': 'private, no-store' } });
    }
    return new Response('<html><head><script src="/_astro/app.js"></script></head><body><h1>Demo</h1>MR Software</body></html>', { headers: { 'Content-Type': 'text/html' } });
  };
  const receipt = await commercialReadiness(request('same-path'), { sleep: async () => {} });
  assert.ok(receipt.some(item => item.url === 'https://backoffice.mrsoftware.dk/api/backoffice/state' && item.status === 302));
  await assert.rejects(commercialReadiness(request('https://evil.example/steal'), { sleep: async () => {} }), /wrong-host return address/);
  await assert.rejects(commercialReadiness(request('http://['), { sleep: async () => {} }), /wrong-host return address/);
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
