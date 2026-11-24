import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../commercial/server/application.mjs';
import { createCommercialHarness, customerInput, enquiryInput, opportunityInput, quoteInput } from './helpers/commercial.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const addCustomer = async h => {
  const result = await h.call('POST', '/api/backoffice/customers', customerInput);
  assert.equal(result.status, 201);
  return result.body.item;
};
const noStore = response => assert.equal(response.headers.get('Cache-Control'), 'private, no-store');

test('Public catalogue supplies initial DKK quote guidance through real D1', async t => {
  const h = await createCommercialHarness(t);
  const result = await h.call('GET', '/api/catalog');
  assert.equal(result.status, 200);
  const { catalog } = result.body;
  assert.equal(catalog.revision, 1);
  assert.equal(catalog.currency, 'DKK');
  assert.deepEqual(catalog.packages.map(({ id, monthlyMinor }) => [id, monthlyMinor]), [
    ['workslip-core', 89900], ['workslip-drift', 189600], ['workslip-complete', 244400], ['tradey-custom', null], ['shippy-custom', null],
  ]);
  assert.ok(catalog.packages[1].includes.includes('KLS'));
  assert.ok(catalog.packages[2].includes.includes('Employee insights'));
  assert.deepEqual(catalog.demos.map(demo => demo.id), ['workslip', 'tradey', 'shippy']);
});

test('Private API and HTML require the private host, configured identity and allowed email', async t => {
  const h = await createCommercialHarness(t);
  for (const path of ['/api/backoffice/session', '/api/backoffice/state', '/backoffice/', '/backoffice/index.html', '/_astro/private.js']) {
    const denied = await h.request('GET', path, undefined, { host: h.env.BACKOFFICE_HOST, omitHeaders: ['Cf-Access-Jwt-Assertion'] });
    assert.equal(denied.status, 401, path);
    noStore(denied);
  }
  for (const path of ['/api/backoffice/state', '/backoffice/', '/backoffice.html', '/%62ackoffice/', '/backoffice%2findex.html']) {
    const denied = await h.request('GET', path, undefined, { host: h.env.DEMO_HOST });
    assert.equal(denied.status, 404, path);
    noStore(denied);
  }
  assert.equal((await h.request('GET', '/', undefined, { host: 'unexpected.workers.dev' })).status, 404);
  const session = await h.call('GET', '/api/backoffice/session');
  assert.deepEqual(session.body, { email: 'william@example.test' });
  noStore(session);
  for (const setting of ['ACCESS_ISSUER', 'ACCESS_AUDIENCE', 'ALLOWED_EMAILS', 'BACKOFFICE_HOST']) {
    const denied = await h.request('GET', '/api/backoffice/session', undefined, { env: { [setting]: '' } });
    assert.ok([401, 404].includes(denied.status), setting);
    noStore(denied);
  }
  const disallowed = await createCommercialHarness(t, { verifyIdentity: async () => ({ sub: 'other', email: 'other@example.test' }) });
  assert.equal((await disallowed.request('GET', '/api/backoffice/session')).status, 403);
  assert.equal((await disallowed.request('GET', '/backoffice/')).status, 403);
  const production = createApplication();
  const denied = await production.fetch(new Request('https://backoffice.mrsoftware.dk/api/backoffice/session'), { ...h.env, TEST_AUTH: true, AUTH_BYPASS: true });
  assert.equal(denied.status, 401);
});

test('Only GET and HEAD reach assets and private asset responses never cache', async t => {
  const h = await createCommercialHarness(t);
  assert.equal(await (await h.request('GET', '/workslip/')).text(), 'Static /workslip/');
  assert.equal(await (await h.request('HEAD', '/workslip/')).text(), '');
  assert.equal((await h.request('POST', '/workslip/', {})).status, 405);
  const privatePage = await h.request('GET', '/backoffice/');
  assert.equal(privatePage.status, 200);
  noStore(privatePage);
  assert.equal((await h.request('OPTIONS', '/api/enquiries')).status, 405);
  assert.equal((await h.request('GET', '/api/unknown')).status, 404);
});

test('Mutations reject wrong origins, non-JSON and missing request markers before writing', async t => {
  const h = await createCommercialHarness(t);
  for (const [path, body] of [['/api/enquiries', enquiryInput()], ['/api/backoffice/customers', customerInput]]) {
    for (const options of [
      { headers: { Origin: 'https://attacker.example' } },
      { headers: { Origin: 'null' } },
      { headers: { Origin: 'https://demo.mrsoftware.dk.attacker.example' } },
      { omitHeaders: ['Origin'] },
      { omitHeaders: ['X-Requested-With'] },
      { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
      { headers: { 'Content-Type': 'text/plain' } },
      { headers: { 'Content-Type': 'application/jsonp' } },
    ]) {
      const denied = await h.call('POST', path, body, options);
      assert.equal(denied.status, 403, JSON.stringify(options));
      assert.equal(typeof denied.body.error, 'string');
      assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
      assert.equal(denied.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
      noStore(denied);
    }
  }
  assert.equal(await h.count('sales_customers'), 0);
});

test('the company site can post one enquiry and no other route', async t => {
  const h = await createCommercialHarness(t);
  const company = { Origin: 'https://mrsoftware.dk' };
  const bare = await h.request('OPTIONS', '/api/enquiries');
  assert.equal(bare.status, 405);
  assert.equal(bare.headers.get('Access-Control-Allow-Origin'), null);
  for (const headers of [
    { Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'POST' },
    { Origin: 'https://mrsoftware.dk.attacker.example', 'Access-Control-Request-Method': 'POST' },
    { Origin: 'http://mrsoftware.dk', 'Access-Control-Request-Method': 'POST' },
    { Origin: 'https://mrsoftware.dk', 'Access-Control-Request-Method': 'GET' },
    { Origin: 'https://mrsoftware.dk' },
  ]) {
    const denied = await h.request('OPTIONS', '/api/enquiries', undefined, { headers });
    assert.equal(denied.status, 405, JSON.stringify(headers));
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null, JSON.stringify(headers));
  }
  const preflight = await h.request('OPTIONS', '/api/enquiries', undefined, { headers: { ...company, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://mrsoftware.dk');
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type, X-Requested-With');
  assert.equal(preflight.headers.get('Vary'), 'Origin');
  assert.equal(preflight.headers.get('Cross-Origin-Resource-Policy'), null);
  const backoffice = await h.call('POST', '/api/backoffice/customers', customerInput, { headers: company });
  assert.equal(backoffice.status, 403);
  assert.equal(backoffice.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(backoffice.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  const created = await h.call('POST', '/api/enquiries', enquiryInput(), { headers: company });
  assert.equal(created.status, 201);
  assert.equal(created.body.received, true);
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), 'https://mrsoftware.dk');
  assert.equal(created.headers.get('Vary'), 'Origin');
  assert.equal(created.headers.get('Cross-Origin-Resource-Policy'), null);
  noStore(created);
  const invalid = await h.call('POST', '/api/enquiries', enquiryInput({ product: 'greeny' }), { headers: company });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('Access-Control-Allow-Origin'), 'https://mrsoftware.dk');
  assert.equal(invalid.headers.get('Cross-Origin-Resource-Policy'), null);
  assert.equal(await h.count('sales_customers'), 1);
});

test('Customers and opportunities persist with server ids, revisions and protected actor events', async t => {
  const h = await createCommercialHarness(t);
  const customer = await addCustomer(h);
  assert.match(customer.id, uuid);
  assert.equal(customer.revision, 1);
  assert.match(customer.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(customer.updatedAt, customer.createdAt);
  assert.equal(customer.name, "Example O'Brien Ltd");
  const created = await h.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id));
  assert.equal(created.status, 201);
  const opportunity = created.body.item;
  assert.equal(opportunity.customerId, customer.id);
  const edited = await h.call('PUT', `/api/backoffice/opportunities/${opportunity.id}`, opportunityInput(customer.id, { revision: 1, stage: 'won', nextFollowUp: null }));
  assert.equal(edited.status, 200);
  assert.equal(edited.body.item.revision, 2);
  assert.equal(edited.body.item.stage, 'won');
  assert.equal(edited.body.item.nextFollowUp, null);
  assert.deepEqual((await h.call('GET', `/api/backoffice/opportunities/${opportunity.id}`)).body.item, edited.body.item);
  const state = await h.call('GET', '/api/backoffice/state');
  noStore(state);
  assert.equal(state.body.customers.length, 1);
  assert.equal(state.body.opportunities.length, 1);
  assert.equal(state.body.truncated, false);
  assert.equal(state.body.events.length, 3);
  assert.deepEqual(state.body.events[0].actor, { sub: 'synthetic-owner', email: 'william@example.test' });
  assert.ok(state.body.events.every(event => event.recordId && event.recordType && event.operation));
  assert.equal((await h.call('GET', `/api/backoffice/customers/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await h.call('POST', '/api/backoffice/opportunities', opportunityInput(crypto.randomUUID()))).status, 404);
});

test('Concurrent customer and opportunity edits reject stale revisions without extra events', async t => {
  const h = await createCommercialHarness(t);
  const customer = await addCustomer(h);
  const updates = await Promise.all(['First change', 'Second change'].map(name => h.call('PUT', `/api/backoffice/customers/${customer.id}`, { ...customerInput, name, revision: 1 })));
  assert.deepEqual(updates.map(update => update.status).sort(), [200, 409]);
  assert.equal((await h.call('GET', `/api/backoffice/customers/${customer.id}`)).body.item.revision, 2);
  assert.equal(await h.count('sales_events'), 2);
  const opportunity = (await h.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id))).body.item;
  const changes = await Promise.all(['contacted', 'demo'].map(stage => h.call('PUT', `/api/backoffice/opportunities/${opportunity.id}`, opportunityInput(customer.id, { stage, revision: 1 }))));
  assert.deepEqual(changes.map(change => change.status).sort(), [200, 409]);
  assert.equal(await h.count('sales_events'), 4);
});

test('Catalogue first-write races use the initial revision and later stale edits conflict', async t => {
  const h = await createCommercialHarness(t);
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  const updates = await Promise.all([99900, 109900].map(price => h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages: catalog.packages.map(pkg => ({ ...pkg, monthlyMinor: pkg.id === 'workslip-core' ? price : pkg.monthlyMinor })), demos: catalog.demos })));
  assert.deepEqual(updates.map(update => update.status).sort(), [200, 409]);
  const saved = (await h.call('GET', '/api/catalog')).body.catalog;
  assert.equal(saved.revision, 2);
  assert.ok([99900, 109900].includes(saved.packages[0].monthlyMinor));
  const stale = await h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages: catalog.packages, demos: catalog.demos });
  assert.equal(stale.status, 409);
  assert.equal(await h.count('sales_events'), 1);
});

test('Quotes retain agreed prices and customer/package snapshots after catalogue and customer edits', async t => {
  const h = await createCommercialHarness(t);
  const customer = await addCustomer(h);
  const opportunity = (await h.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id))).body.item;
  const created = await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { opportunityId: opportunity.id, setupMinor: 12300 }));
  assert.equal(created.status, 201);
  const original = created.body.item;
  assert.equal(original.monthlyMinor, 89900);
  assert.equal(original.setupMinor, 12300);
  assert.equal(original.currency, 'DKK');
  assert.equal(original.status, 'draft');
  assert.equal(original.snapshot.customer.name, "Example O'Brien Ltd");
  assert.equal(original.snapshot.package.id, 'workslip-core');
  assert.equal(original.snapshot.package.monthlyMinor, 89900);
  assert.equal(original.snapshot.catalogRevision, 1);
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  const updatedCatalog = await h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages: catalog.packages.map(pkg => ({ ...pkg, name: pkg.id === 'workslip-core' ? 'Renamed Core' : pkg.name, monthlyMinor: pkg.id === 'workslip-core' ? 99900 : pkg.monthlyMinor })), demos: catalog.demos });
  assert.equal(updatedCatalog.status, 200);
  assert.equal((await h.call('PUT', `/api/backoffice/customers/${customer.id}`, { ...customerInput, revision: 1, name: 'Changed customer', contacts: [], notes: 'Changed note' })).status, 200);
  assert.deepEqual((await h.call('GET', `/api/backoffice/quotes/${original.id}`)).body.item, original);
  const fresh = (await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id))).body.item;
  assert.equal(fresh.monthlyMinor, 99900);
  assert.equal(fresh.snapshot.customer.name, 'Changed customer');
  assert.equal(fresh.snapshot.catalogRevision, 2);
  assert.equal(fresh.snapshot.package.name, 'Renamed Core');
  const changed = await h.call('PUT', `/api/backoffice/quotes/${original.id}`, { revision: 1, status: 'accepted' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.item.status, 'accepted');
  assert.deepEqual(changed.body.item.snapshot, original.snapshot);
  assert.equal(changed.body.item.monthlyMinor, 89900);
  assert.equal((await h.call('PUT', `/api/backoffice/quotes/${original.id}`, { revision: 1, status: 'sent' })).status, 409);
  assert.equal((await h.call('PUT', `/api/backoffice/quotes/${original.id}`, { revision: 2, status: 'sent', monthlyMinor: 1 })).status, 400);
});

test('Quote creation validates custom prices, active packages and linked customer/opportunity ownership', async t => {
  const h = await createCommercialHarness(t);
  const customer = await addCustomer(h);
  assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { packageId: 'tradey-custom' }))).status, 400);
  const agreed = await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { packageId: 'tradey-custom', monthlyMinor: 0 }));
  assert.equal(agreed.status, 201);
  assert.equal(agreed.body.item.monthlyMinor, 0);
  assert.equal(agreed.body.item.snapshot.package.monthlyMinor, null);
  for (const overrides of [{ monthlyMinor: -1 }, { monthlyMinor: 1.5 }, { setupMinor: 1e12 }, { packageId: 'missing-package' }, { validUntil: '2030-02-31' }]) {
    assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, overrides))).status, 400, JSON.stringify(overrides));
  }
  assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(crypto.randomUUID()))).status, 404);
  assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { opportunityId: crypto.randomUUID() }))).status, 404);
  const other = (await h.call('POST', '/api/backoffice/customers', { ...customerInput, name: 'Other company' })).body.item;
  const opportunity = (await h.call('POST', '/api/backoffice/opportunities', opportunityInput(other.id))).body.item;
  assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { opportunityId: opportunity.id }))).status, 400);
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  assert.equal((await h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages: catalog.packages.map(pkg => ({ ...pkg, active: false })), demos: catalog.demos })).status, 200);
  assert.equal((await h.call('POST', '/api/backoffice/quotes', quoteInput(customer.id))).status, 400);
});

test('State declares its bounded collections and record URLs still retrieve older customers', async t => {
  const h = await createCommercialHarness(t);
  const customers = Array.from({ length: 105 }, (_, index) => ({ ...customerInput, id: crypto.randomUUID(), revision: 1, createdAt: new Date(Date.UTC(2030, 0, 1, 0, index)).toISOString(), updatedAt: new Date(Date.UTC(2030, 0, 1, 0, index)).toISOString() }));
  await h.db.batch(customers.map(item => h.db.prepare('INSERT INTO sales_customers (id, revision, created_at, updated_at, document) VALUES (?, ?, ?, ?, ?)').bind(item.id, 1, item.createdAt, item.updatedAt, JSON.stringify(item))));
  const state = (await h.call('GET', '/api/backoffice/state')).body;
  assert.equal(state.customers.length, 100);
  assert.equal(state.truncated, true);
  assert.ok(!state.customers.some(item => item.id === customers[0].id));
  assert.equal((await h.call('GET', `/api/backoffice/customers/${customers[0].id}`)).body.item.id, customers[0].id);
});

test('Enquiries create a customer and enquiry opportunity once across exact concurrent retries', async t => {
  const h = await createCommercialHarness(t);
  const input = enquiryInput();
  const results = await Promise.all(Array.from({ length: 6 }, () => h.call('POST', '/api/enquiries', input)));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 200).length, 5);
  assert.ok(results.every(result => result.body.received === true));
  assert.equal(new Set(results.map(result => result.body.reference)).size, 1);
  assert.match(results[0].body.reference, uuid);
  assert.deepEqual(Object.keys(results[0].body).sort(), ['received', 'reference']);
  assert.equal(await h.count('sales_customers'), 1);
  assert.equal(await h.count('sales_opportunities'), 1);
  assert.equal(await h.count('sales_enquiries'), 1);
  assert.equal(await h.count('sales_events'), 2);
  const state = (await h.call('GET', '/api/backoffice/state')).body;
  assert.equal(state.customers[0].name, input.company);
  assert.equal(state.customers[0].contacts[0].email, input.email);
  assert.equal(state.opportunities[0].customerId, state.customers[0].id);
  assert.equal(state.opportunities[0].title, 'Workslip enquiry: Core');
  assert.equal(state.opportunities[0].stage, 'enquiry');
  assert.ok(state.opportunities[0].notes.includes('Please contact us.'));
  assert.equal((await h.call('POST', '/api/enquiries', { ...input, message: 'Changed request' })).status, 409);
});

test('Enquiries use the current catalogue package names and allow no selected package', async t => {
  const h = await createCommercialHarness(t);
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  assert.equal((await h.call('PUT', '/api/backoffice/catalog', { revision: catalog.revision, packages: catalog.packages.map(pkg => ({ ...pkg, name: pkg.id === 'tradey-custom' ? 'Tradey Growth' : pkg.name })), demos: catalog.demos })).status, 200);
  for (const [product, packageId, title] of [
    ['workslip', 'workslip-core', 'Workslip enquiry: Core'],
    ['tradey', 'tradey-custom', 'Tradey enquiry: Tradey Growth'],
    ['shippy', 'shippy-custom', 'Shippy enquiry: Shippy'],
    ['tradey', null, 'Tradey enquiry'],
  ]) {
    const input = enquiryInput({ company: `${product} ${packageId ?? 'no package'}`, product, packageId });
    assert.equal((await h.call('POST', '/api/enquiries', input)).status, 201);
    const state = (await h.call('GET', '/api/backoffice/state')).body;
    const customer = state.customers.find(item => item.name === input.company);
    const opportunity = state.opportunities.find(item => item.customerId === customer.id);
    assert.equal(opportunity.title, title);
  }
});

test('Enquiry failures roll back the receipt, rate counter and every sales record', async t => {
  const h = await createCommercialHarness(t);
  await h.db.prepare("CREATE TRIGGER fail_opportunity BEFORE INSERT ON sales_opportunities BEGIN SELECT RAISE(ABORT, 'synthetic private SQL failure'); END").run();
  const input = enquiryInput();
  const failure = await h.call('POST', '/api/enquiries', input);
  assert.equal(failure.status, 503);
  assert.equal(JSON.stringify(failure.body).includes('synthetic private SQL'), false);
  for (const table of ['sales_customers', 'sales_opportunities', 'sales_enquiries', 'sales_enquiry_limits', 'sales_events']) assert.equal(await h.count(table), 0, table);
  await h.db.prepare('DROP TRIGGER fail_opportunity').run();
  assert.equal((await h.call('POST', '/api/enquiries', input)).status, 201);
});

test('Maximum-length enquiries and package names stay within editable opportunity field bounds', async t => {
  const h = await createCommercialHarness(t);
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  assert.equal((await h.call('PUT', '/api/backoffice/catalog', { revision: catalog.revision, packages: catalog.packages.map(pkg => ({ ...pkg, name: pkg.id === 'workslip-core' ? 'Core ' + 'c'.repeat(195) : pkg.name })), demos: catalog.demos })).status, 200);
  const input = enquiryInput({ message: 'x'.repeat(4000) });
  assert.equal((await h.call('POST', '/api/enquiries', input)).status, 201);
  const { opportunities } = (await h.call('GET', '/api/backoffice/state')).body;
  assert.equal(opportunities[0].notes, input.message);
  assert.ok(opportunities[0].title.startsWith('Workslip enquiry: Core '));
  assert.ok(opportunities[0].title.length <= 200);
  const opportunity = opportunities[0];
  assert.equal((await h.call('PUT', `/api/backoffice/opportunities/${opportunity.id}`, opportunityInput(opportunity.customerId, { revision: opportunity.revision, title: opportunity.title, stage: opportunity.stage, nextFollowUp: null, notes: input.message }))).status, 200);
});

test('Concurrent enquiries enforce a per-network limit while exact retries keep their receipt', async t => {
  const h = await createCommercialHarness(t);
  const inputs = Array.from({ length: 8 }, () => enquiryInput());
  const results = await Promise.all(inputs.map(input => h.call('POST', '/api/enquiries', input)));
  assert.equal(results.filter(result => result.status === 201).length, 5);
  assert.equal(results.filter(result => result.status === 429).length, 3);
  assert.equal(await h.count('sales_customers'), 5);
  const index = results.findIndex(result => result.status === 201);
  const retry = await h.call('POST', '/api/enquiries', inputs[index]);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.reference, results[index].body.reference);
  assert.equal((await h.call('POST', '/api/enquiries', { ...inputs[index], company: 'Different company' })).status, 409);
  assert.equal((await h.call('POST', '/api/enquiries', enquiryInput(), { headers: { 'CF-Connecting-IP': '198.51.100.8' } })).status, 201);
  assert.equal((await h.call('POST', '/api/enquiries', enquiryInput(), { headers: { 'CF-Connecting-IP': '203.0.113.99' } })).status, 429);
});

test('Validation bounds strings, arrays, money, stages, dates, catalogue ids and request bytes', async t => {
  const h = await createCommercialHarness(t);
  for (const body of [null, [], { ...customerInput, id: crypto.randomUUID() }, { ...customerInput, name: '' }, { ...customerInput, name: 'x'.repeat(201) }, { ...customerInput, notes: 'x'.repeat(4001) }, { ...customerInput, contacts: Array.from({ length: 21 }, () => customerInput.contacts[0]) }, { ...customerInput, contacts: [{ name: 'Name', email: 'invalid', phone: '' }] }]) {
    assert.equal((await h.call('POST', '/api/backoffice/customers', body)).status, 400);
  }
  for (const overrides of [{ requestId: 'invalid' }, { website: 'https://spam.test' }, { product: 'unknown' }, { packageId: 'tradey-custom' }, { email: 'invalid' }, { message: 'x'.repeat(4001) }]) {
    assert.equal((await h.call('POST', '/api/enquiries', enquiryInput(overrides))).status, 400, JSON.stringify(overrides));
  }
  assert.equal((await h.call('POST', '/api/enquiries', enquiryInput(), { rawBody: '{bad' })).status, 400);
  assert.equal((await h.call('POST', '/api/enquiries', enquiryInput(), { rawBody: JSON.stringify({ padding: 'x'.repeat(65537) }) })).status, 400);
  const customer = await addCustomer(h);
  for (const overrides of [{ stage: 'unknown' }, { nextFollowUp: '2030-02-31' }, { product: 'unknown' }]) {
    assert.equal((await h.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id, overrides))).status, 400);
  }
  const { catalog } = (await h.call('GET', '/api/catalog')).body;
  for (const packages of [[...catalog.packages, catalog.packages[0]], catalog.packages.map(pkg => ({ ...pkg, product: 'unknown' })), catalog.packages.map(pkg => ({ ...pkg, id: '../escape' })), catalog.packages.map(pkg => ({ ...pkg, includes: Array(31).fill('Feature') })), catalog.packages.map(pkg => ({ ...pkg, monthlyMinor: 12.5 })), catalog.packages.map(pkg => ({ ...pkg, active: 'true' }))]) {
    assert.equal((await h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages, demos: catalog.demos })).status, 400);
  }
  assert.equal((await h.call('PUT', '/api/backoffice/catalog', { revision: 1, packages: catalog.packages, demos: [...catalog.demos, { id: 'evil', title: 'Title', summary: 'Summary', active: true, path: 'https://attacker.example' }] })).status, 400);
});

test('Missing or broken D1 returns a plain 503 without false empty state or SQL details', async t => {
  const h = await createCommercialHarness(t);
  for (const [method, path, body] of [['GET', '/api/catalog'], ['GET', '/api/backoffice/state'], ['POST', '/api/enquiries', enquiryInput()], ['POST', '/api/backoffice/customers', customerInput]]) {
    const unavailable = await h.call(method, path, body, { env: { DB: undefined } });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(Object.keys(unavailable.body), ['error']);
    assert.equal(typeof unavailable.body.error, 'string');
    noStore(unavailable);
  }
  await h.db.prepare('DROP TABLE sales_events').run();
  const failed = await h.call('POST', '/api/backoffice/customers', customerInput);
  assert.equal(failed.status, 503);
  assert.equal(await h.count('sales_customers'), 0);
  const state = await h.call('GET', '/api/backoffice/state');
  assert.equal(state.status, 503);
  assert.ok(!('customers' in state.body));
  assert.equal(JSON.stringify(state.body).includes('sales_events'), false);
});
