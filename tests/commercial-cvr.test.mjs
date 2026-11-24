import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSearchQuery, createCvrClient, cvrClientFromEnv, mapCompany } from '../commercial/server/cvr.mjs';

const endpoint = 'https://cvr.example.test/cvr-permanent/virksomhed/_search';
const fixture = async name => readFile(new URL(`./fixtures/cvr/${name}`, import.meta.url), 'utf8');

function fixtureFetch(name, calls = []) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(await fixture(name), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

test('search maps the fixture and keeps only fitting, active, unprotected limited companies', async () => {
  const client = createCvrClient({ endpoint, username: 'synthetic-user', password: 'synthetic-secret', fetch: fixtureFetch('search-workslip.json') });
  const companies = await client.search({ codes: ['43'], municipalityCodes: ['751'], sizes: [], limit: 100 });
  assert.deepEqual(companies.map(company => company.cvr), ['12345678', '23456789']);
  assert.deepEqual(companies[0], {
    cvr: '12345678', name: 'Lund Tømrer ApS', industryCode: '433200', industryText: 'Tømrerforretninger', secondaryCodes: [],
    companyForm: 'APS', employees: 'ANTAL_10_19', address: 'Søndergade 1', postcode: '8000', city: 'Aarhus C', municipalityCode: '751',
    founded: '2014-03-01', website: 'www.lund-toemrer.dk', phone: '', email: '', protected: false, active: true,
  });
  assert.equal(companies[1].employees, 'ANTAL_20_49', 'quarterly band is the fallback');
  assert.deepEqual(companies[1].secondaryCodes, ['412000']);
  assert.equal(companies[1].phone, '+45 22222222');
});

test('mapCompany skips secret contact values and reads protection and status', async () => {
  const hits = JSON.parse(await fixture('search-workslip.json')).hits.hits;
  assert.equal(mapCompany(hits[0]._source).phone, '', 'a secret phone number is never used');
  assert.equal(mapCompany(hits[2]._source).protected, true);
  assert.equal(mapCompany(hits[4]._source).active, false);
});

test('the query excludes protected companies and non-allowlisted forms and caps the size', () => {
  const body = buildSearchQuery({ codes: ['43'], municipalityCodes: ['751'], sizes: ['ANTAL_10_19'], limit: 100 });
  const text = JSON.stringify(body);
  assert.equal(body.size, 100);
  assert.match(text, /"must_not":\[\{"term":\{"Vrvirksomhed\.reklamebeskyttet":true\}\}\]/);
  assert.match(text, /"Vrvirksomhed\.virksomhedMetadata\.nyesteVirksomhedsform\.virksomhedsformkode":\[40,60,80,81\]/);
  assert.match(text, /"prefix":\{"Vrvirksomhed\.virksomhedMetadata\.nyesteHovedbranche\.branchekode":"43"\}/);
  assert.match(text, /"prefix":\{"Vrvirksomhed\.virksomhedMetadata\.nyesteBibranche1\.branchekode":"43"\}/);
  assert.match(text, /ANTAL_10_19/);
  assert.match(text, /751/);
  assert.equal(buildSearchQuery({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 5000 }).size, 100, 'limit is capped at 100');
  assert.doesNotMatch(JSON.stringify(buildSearchQuery({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 10 })), /kommuneKode|intervalKode/);
});

test('basic auth is sent and neither the password nor provider text appears in an error', async () => {
  const calls = [];
  const client = createCvrClient({ endpoint, username: 'synthetic-user', password: 'synthetic-secret', fetch: fixtureFetch('search-workslip.json', calls) });
  await client.search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 10 });
  assert.equal(calls[0].url, endpoint);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), `Basic ${btoa('synthetic-user:synthetic-secret')}`);

  const failing = createCvrClient({ endpoint, username: 'synthetic-user', password: 'synthetic-secret', fetch: async () => new Response('Internal provider detail synthetic-secret', { status: 500 }) });
  await assert.rejects(failing.search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 10 }), error => {
    assert.equal(error.status, 502);
    assert.equal(error.message, 'The company register did not answer. Try again in a moment.');
    return true;
  });
  const garbage = createCvrClient({ endpoint, username: 'u', password: 'p', fetch: async () => new Response('<html>', { status: 200 }) });
  await assert.rejects(garbage.search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 10 }), error => error.status === 502);
});

test('a register that does not answer in time rejects with 502', async () => {
  const hanging = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  const client = createCvrClient({ endpoint, username: 'u', password: 'p', fetch: hanging, timeoutMs: 20 });
  await assert.rejects(client.search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 10 }), error => error.status === 502);
});

test('http endpoints and missing settings are refused', () => {
  assert.throws(() => createCvrClient({ endpoint: 'http://distribution.virk.dk/cvr-permanent/virksomhed/_search', username: 'u', password: 'p' }), error => error.status === 503 && error.message === 'Company search is not connected yet.');
  assert.throws(() => createCvrClient({ endpoint, username: '', password: 'p' }), error => error.status === 503);
  assert.throws(() => cvrClientFromEnv({}), error => error.status === 503);
  assert.ok(cvrClientFromEnv({ CVR_ENDPOINT: endpoint, CVR_USERNAME: 'u', CVR_PASSWORD: 'p' }));
});

test('company() returns one company, or null when CVR has no hit', async () => {
  const found = await createCvrClient({ endpoint, username: 'u', password: 'p', fetch: fixtureFetch('company-12345678.json') }).company('12345678');
  assert.equal(found.name, 'Lund Tømrer ApS');
  assert.equal(await createCvrClient({ endpoint, username: 'u', password: 'p', fetch: fixtureFetch('empty.json') }).company('12345678'), null);
});

test('company() returns protected companies so the caller can explain the refusal', async () => {
  const hits = JSON.parse(await fixture('search-workslip.json')).hits.hits;
  const fetch = async () => Response.json({ hits: { total: 1, hits: [hits[2]] } });
  const company = await createCvrClient({ endpoint, username: 'u', password: 'p', fetch }).company('34567890');
  assert.equal(company.protected, true);
});
