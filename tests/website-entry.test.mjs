import test from 'node:test';
import assert from 'node:assert/strict';

test('company entry redirects keep only valid public product/package context and never run on dashboard hosts', async () => {
  const module = await import('../website-entry.mjs').catch(() => ({}));
  assert.equal(typeof module.publicCommercialEntry, 'function', 'Public company entry routing is required');
  const route = (pathname, host = 'mrsoftware.dk', method = 'GET') => module.publicCommercialEntry(new Request(`https://${host}${pathname}`, { method }));
  for (const [from, to] of [
    ['/demos/', '/'], ['/demos/workslip/', '/workslip/jobs/ws-1042/'], ['/demos/tradey/', '/tradey/offers/offer-1048/'], ['/demos/shippy/', '/shippy/shipments/shp-2048/'],
    ['/pricing/', '/pricing/'], ['/pricing/workslip/', '/pricing/?product=workslip'],
    ['/pricing/?product=workslip&package=workslip-core&return=https://wrong.example.test', '/pricing/?product=workslip&package=workslip-core'],
    ['/pricing/?product=tradey&package=workslip-core', '/pricing/?product=tradey'], ['/pricing/?product=unknown&package=unknown', '/pricing/'],
  ]) assert.equal(route(from).headers.get('Location'), 'https://demos.mrsoftware.dk' + to);
  for (const host of ['dashboard.mrsoftware.dk', 'backoffice.mrsoftware.dk', 'unknown.example.test']) assert.equal(route('/pricing/', host), null);
  assert.equal(route('/_development/'), null);
  assert.equal(route('/pricing/', 'mrsoftware.dk', 'POST').status, 405);
  assert.equal(await route('/demos/', 'mrsoftware.dk', 'HEAD').text(), '');
});
