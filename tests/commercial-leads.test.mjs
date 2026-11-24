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
