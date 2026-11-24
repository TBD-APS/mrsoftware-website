import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { createStore } from '../commercial/server/store.mjs';
import { cvrClientFromEnv } from '../commercial/server/cvr.mjs';
import { HttpError } from '../commercial/server/validation.mjs';

const owner = { sub: 'synthetic-owner', email: 'william@example.test' };
const searchPath = '/api/backoffice/leads?product=workslip&regions=1082';

async function events(harness, recordType) {
  const { results } = await harness.db.prepare('SELECT document FROM sales_events').all();
  return results.map(row => JSON.parse(row.document)).filter(item => item.recordType === recordType);
}

test('search returns scored, sorted leads and marks companies already saved', async t => {
  const harness = await createCommercialHarness(t);
  const saved = await createStore(harness.db).createCustomer({ name: 'Holm Byg A/S', cvr: '23456789', contacts: [], notes: '' }, owner);
  const response = await harness.call('GET', searchPath);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(response.body.results.map(lead => [lead.cvr, lead.score, lead.customerId]), [['12345678', 100, null], ['23456789', 75, saved.id]]);
  const [first] = response.body.results;
  assert.equal(first.reason, 'Tømrerforretninger (433200), 10–19 employees, Aarhus C, founded 2014, website listed');
  assert.equal(first.linkedinUrl, 'https://www.linkedin.com/search/results/companies/?keywords=Lund%20T%C3%B8mrer%20ApS');
  assert.ok(!('allowedForm' in first));
  assert.deepEqual(response.body.search, { product: 'workslip', codes: ['41', '43'], regions: ['1082'], municipalities: [], sizes: [] });
});

test('search writes one event with parameters and count, never results', async t => {
  const harness = await createCommercialHarness(t);
  await harness.call('GET', `${searchPath}&sizes=ANTAL_10_19,ANTAL_20_49&codes=43`);
  const [event, ...rest] = await events(harness, 'leadSearch');
  assert.equal(rest.length, 0);
  assert.equal(event.operation, 'searched');
  assert.deepEqual(event.actor, owner);
  assert.deepEqual(event.details, { product: 'workslip', codes: ['43'], regions: ['1082'], municipalities: [], sizes: ['ANTAL_10_19', 'ANTAL_20_49'], count: 2 });
  assert.doesNotMatch(JSON.stringify(event), /Lund|Holm|12345678/);
});

test('search needs Access and validates its parameters', async t => {
  const harness = await createCommercialHarness(t);
  assert.equal((await harness.call('GET', searchPath, undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  for (const [query, message] of [
    ['product=other&regions=1082', 'Product is invalid.'],
    ['product=workslip', 'Choose at least one region or municipality.'],
    ['product=workslip&regions=9999', 'Region is invalid.'],
    ['product=workslip&municipalities=999', 'Municipality is invalid.'],
    ['product=workslip&regions=1082&codes=4a', 'Industry codes must be 2 to 6 digits.'],
    ['product=workslip&regions=1082&sizes=ANTAL_7', 'Company size is invalid.'],
    ['product=workslip&regions=1082&extra=1', 'The lead search link has invalid fields.'],
    ['product=workslip&product=tradey&regions=1082', 'The lead search link has invalid fields.'],
  ]) {
    const response = await harness.call('GET', `/api/backoffice/leads?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal(response.body.error, message, query);
  }
  assert.equal((await harness.call('GET', `/api/backoffice/leads?product=workslip&codes=${Array.from({ length: 31 }, (_, index) => String(10 + index)).join(',')}&regions=1082`)).status, 400);
  assert.equal((await harness.call('GET', '/api/backoffice/leads?product=workslip&municipalities=751')).status, 200);
});

test('missing CVR settings answer 503 with a plain message', async t => {
  const harness = await createCommercialHarness(t, { cvrClient: cvrClientFromEnv });
  const response = await harness.call('GET', searchPath);
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'Company search is not connected yet.');
});

test('a failing register answers 502, is not an empty list, and records no search', async t => {
  const failing = () => ({ search: async () => { throw new HttpError(502, 'The company register did not answer. Try again in a moment.'); }, company: async () => null });
  const harness = await createCommercialHarness(t, { cvrClient: failing });
  const response = await harness.call('GET', searchPath);
  assert.equal(response.status, 502);
  assert.equal(response.body.error, 'The company register did not answer. Try again in a moment.');
  assert.ok(!('results' in response.body));
  assert.equal((await events(harness, 'leadSearch')).length, 0);
});

test('detail returns one scored lead, and 404 for unknown, protected or excluded companies', async t => {
  const harness = await createCommercialHarness(t);
  const found = await harness.call('GET', '/api/backoffice/leads/12345678?product=workslip');
  assert.equal(found.status, 200);
  assert.equal(found.body.lead.name, 'Lund Tømrer ApS');
  assert.equal(found.body.lead.score, 100);
  assert.equal(found.body.lead.customerId, null);
  assert.ok(!('allowedForm' in found.body.lead));
  for (const cvr of ['99999999', '34567890', '45678901', '56789012']) {
    const response = await harness.call('GET', `/api/backoffice/leads/${cvr}?product=workslip`);
    assert.equal(response.status, 404, cvr);
    assert.equal(response.body.error, 'Company was not found in the register.', cvr);
  }
  assert.equal((await harness.call('GET', '/api/backoffice/leads/12345678')).status, 400, 'product is required');
  assert.equal((await harness.call('GET', '/api/backoffice/leads/12345678?product=workslip', undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
});

test('lead searches do not crowd the workspace activity or mark it truncated', async t => {
  const harness = await createCommercialHarness(t);
  const store = createStore(harness.db);
  const customer = await store.createCustomer({ name: 'Lund Services', contacts: [], notes: '' }, owner);
  for (let index = 0; index < 101; index += 1) await store.recordLeadSearch({ product: 'workslip', count: 0 }, owner);
  const state = await harness.call('GET', '/api/backoffice/state');
  assert.equal(state.body.truncated, false);
  assert.ok(state.body.events.some(event => event.recordId === customer.id));
  assert.ok(!state.body.events.some(event => event.recordType === 'leadSearch'));
});

test('search returns the register total and uses only usable companies', async t => {
  const harness = await createCommercialHarness(t);
  const response = await harness.call('GET', searchPath);
  assert.equal(response.body.total, 5);
  const loose = () => ({ search: async () => ({ total: 1, companies: [{ cvr: '12345678', name: 'Loose ApS', active: true }] }), company: async () => ({ cvr: '12345678', name: 'Loose ApS', active: true }) });
  const strict = await createCommercialHarness(t, { cvrClient: loose });
  assert.deepEqual((await strict.call('GET', searchPath)).body.results, []);
  assert.equal((await strict.call('GET', '/api/backoffice/leads/12345678?product=workslip')).status, 404);
});

// Task 4: save as lead.
const saveBody = (overrides = {}) => ({ cvr: '23456789', product: 'workslip', nextFollowUp: '2030-11-20', ...overrides });
const customersWithCvr = async (harness, cvr) => (await harness.db.prepare("SELECT count(*) AS count FROM sales_customers WHERE json_extract(document, '$.cvr') = ?").bind(cvr).first()).count;

test('saving a lead creates the customer and a lead opportunity due on the chosen date', async t => {
  const harness = await createCommercialHarness(t);
  const saved = await harness.call('POST', '/api/backoffice/leads', saveBody());
  assert.equal(saved.status, 201);
  assert.equal(saved.body.created, true);
  const { customer, opportunity } = saved.body;
  assert.equal(customer.name, 'Holm Byg A/S');
  assert.equal(customer.cvr, '23456789');
  assert.deepEqual(customer.contacts, [{ name: '', email: 'kontakt@holm-byg.example', phone: '+45 22222222' }]);
  assert.match(customer.notes, /^Found with the lead finder on \d{4}-\d{2}-\d{2}\. Reason: Virksomhedsrådgivning og anden rådgivning om driftsledelse \(702200\), 20–49 employees, Aarhus N, founded 2008, phone listed$/);
  assert.deepEqual([opportunity.customerId, opportunity.title, opportunity.product, opportunity.stage, opportunity.nextFollowUp, opportunity.notes], [customer.id, 'Workslip lead', 'workslip', 'lead', '2030-11-20', '']);
  const today = await harness.call('GET', '/api/backoffice/today?date=2030-11-20');
  assert.ok(today.body.followUps.items.some(item => item.id === opportunity.id));
  const types = (await harness.db.prepare('SELECT document FROM sales_events').all()).results.map(row => JSON.parse(row.document)).map(event => `${event.recordType}:${event.operation}`);
  assert.deepEqual(types.sort(), ['customer:created', 'opportunity:created']);
  const search = await harness.call('GET', searchPath);
  assert.equal(search.body.results.find(lead => lead.cvr === '23456789').customerId, customer.id);
});

test('a company without public contact details is saved without a contact', async t => {
  const harness = await createCommercialHarness(t);
  const saved = await harness.call('POST', '/api/backoffice/leads', saveBody({ cvr: '12345678' }));
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.body.customer.contacts, []);
});

test('two concurrent saves for one CVR number give one customer', async t => {
  const harness = await createCommercialHarness(t);
  const [a, b] = await Promise.all([harness.call('POST', '/api/backoffice/leads', saveBody()), harness.call('POST', '/api/backoffice/leads', saveBody())]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  const second = a.status === 200 ? a.body : b.body;
  assert.equal(second.created, false);
  assert.equal(second.opportunity, null);
  assert.equal(await customersWithCvr(harness, '23456789'), 1);
  assert.equal(await harness.count('sales_opportunities'), 1);
});

test('a company that is protected, inactive or another form at save time is refused and nothing is written', async t => {
  const hits = (await import('./fixtures/cvr/search-workslip.json', { with: { type: 'json' } })).default.hits.hits;
  const holm = hits[1];
  const variant = change => { const copy = structuredClone(holm); change(copy._source.Vrvirksomhed); return copy; };
  const cases = [
    [variant(company => { company.reklamebeskyttet = true; }), 422, 'This company has asked not to receive marketing in CVR. Nothing was saved.'],
    [variant(company => { company.virksomhedMetadata.sammensatStatus = 'Ophørt'; }), 422, 'This company is no longer active in CVR. Nothing was saved.'],
    [variant(company => { company.virksomhedMetadata.nyesteVirksomhedsform.virksomhedsformkode = 10; }), 422, 'This company form is not included in the lead finder. Nothing was saved.'],
  ];
  const { fixtureCvrClient } = await import('./helpers/cvr-fixture.mjs');
  for (const [hit, status, message] of cases) {
    const harness = await createCommercialHarness(t, { cvrClient: fixtureCvrClient(new Map([['23456789', hit]])) });
    const response = await harness.call('POST', '/api/backoffice/leads', saveBody());
    assert.equal(response.status, status, message);
    assert.equal(response.body.error, message);
    assert.equal(await harness.count('sales_customers'), 0);
    assert.equal(await harness.count('sales_events'), 0);
  }
  const harness = await createCommercialHarness(t);
  const unknown = await harness.call('POST', '/api/backoffice/leads', saveBody({ cvr: '99999999' }));
  assert.equal(unknown.status, 404);
  const failing = await createCommercialHarness(t, { cvrClient: () => ({ search: async () => ({ companies: [], total: 0 }), company: async () => { throw new HttpError(502, 'The company register did not answer. Try again in a moment.'); } }) });
  assert.equal((await failing.call('POST', '/api/backoffice/leads', saveBody())).status, 502);
  assert.equal(await failing.count('sales_customers'), 0);
});

test('saving validates the body and needs a same-origin JSON write', async t => {
  const harness = await createCommercialHarness(t);
  for (const body of [saveBody({ cvr: '123' }), saveBody({ product: 'roady' }), saveBody({ nextFollowUp: '2030-02-30' }), { ...saveBody(), extra: 1 }, { cvr: '23456789', product: 'workslip' }]) {
    assert.equal((await harness.call('POST', '/api/backoffice/leads', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await harness.call('POST', '/api/backoffice/leads', saveBody(), { headers: { 'X-Requested-With': 'other' } })).status, 403);
  assert.equal(await harness.count('sales_customers'), 0);
});

test('editing the customer keeps its CVR number, which cannot be changed', async t => {
  const harness = await createCommercialHarness(t);
  const { customer } = (await harness.call('POST', '/api/backoffice/leads', saveBody())).body;
  const edit = overrides => harness.call('PUT', `/api/backoffice/customers/${customer.id}`, { name: 'Holm Byg A/S', contacts: [], notes: 'Called.', revision: customer.revision, ...overrides });
  const withoutCvr = await edit({});
  assert.equal(withoutCvr.status, 200);
  assert.equal(withoutCvr.body.item.cvr, '23456789');
  const same = await edit({ cvr: '23456789', revision: withoutCvr.body.item.revision });
  assert.equal(same.status, 200);
  assert.equal(same.body.item.cvr, '23456789');
  const changed = await edit({ cvr: '12345678', revision: same.body.item.revision });
  assert.equal(changed.status, 400);
  assert.equal(changed.body.error, 'CVR number cannot be changed.');
  assert.equal((await harness.call('POST', '/api/backoffice/customers', { name: 'Manual ApS', contacts: [], notes: '', cvr: '34567890' })).status, 400, 'manual customers cannot claim a CVR number');
});

test('the lead stage is accepted on opportunities', async t => {
  const harness = await createCommercialHarness(t);
  const { opportunity } = (await harness.call('POST', '/api/backoffice/leads', saveBody())).body;
  const moved = await harness.call('PUT', `/api/backoffice/opportunities/${opportunity.id}`, { customerId: opportunity.customerId, title: opportunity.title, product: 'workslip', stage: 'contacted', nextFollowUp: null, notes: '', revision: opportunity.revision });
  assert.equal(moved.status, 200);
  const back = await harness.call('PUT', `/api/backoffice/opportunities/${opportunity.id}`, { customerId: opportunity.customerId, title: opportunity.title, product: 'workslip', stage: 'lead', nextFollowUp: '2030-11-21', notes: '', revision: moved.body.item.revision });
  assert.equal(back.status, 200);
});
