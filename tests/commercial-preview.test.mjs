import test from 'node:test';
import assert from 'node:assert/strict';

test('runnable preview is loopback-only, visibly synthetic and uses real local sales storage', async () => {
  const module = await import('../tools/preview-commercial.mjs').catch(() => ({}));
  assert.equal(typeof module.startCommercialPreview, 'function', 'A runnable local commercial preview is required');
  const site = await module.startCommercialPreview();
  try {
    assert.equal(site.address, '127.0.0.1');
    for (const pathname of ['/', '/pricing/', '/workslip/jobs/ws-1042/']) {
      const response = await fetch(new URL(pathname, site.base));
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Local preview · Synthetic examples/);
    }
    const response = await fetch(site.privateBase, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(new URL(response.headers.get('Location')).pathname, '/backoffice/');
    const state = await (await fetch(new URL('/api/backoffice/state', site.privateBase))).json();
    assert.equal(state.customers.length, 1);
    assert.equal(state.opportunities.length, 1);
    assert.equal(state.quotes.length, 1);
    assert.equal(state.customers[0].name, 'Local preview customer');
    assert.equal(state.quotes[0].monthlyMinor, 89900);
    assert.equal(state.quotes[0].setupMinor, 125050);
    assert.equal(await site.count('sales_customers'), 1);
    assert.equal((await site.db.prepare('SELECT document FROM sales_quotes').first()).document, JSON.stringify(state.quotes[0]));
  } finally { await site.close(); }
});
