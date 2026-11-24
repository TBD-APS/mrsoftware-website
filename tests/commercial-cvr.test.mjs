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
  const { companies } = await client.search({ codes: ['43'], municipalityCodes: ['751'], sizes: [], limit: 100 });
  assert.deepEqual(companies.map(company => company.cvr), ['12345678', '23456789']);
  assert.deepEqual(companies[0], {
    cvr: '12345678', name: 'Lund Tømrer ApS', industryCode: '433200', industryText: 'Tømrerforretninger', secondaryCodes: [],
    companyForm: 'APS', employees: 'ANTAL_10_19', address: 'Søndergade 1', postcode: '8000', city: 'Aarhus C', municipalityCode: '751',
    founded: '2014-03-01', website: 'www.lund-toemrer.dk', phone: '', email: '', protected: false, active: true, allowedForm: true,
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
  assert.match(text, /"Vrvirksomhed\.virksomhedMetadata\.nyesteVirksomhedsform\.virksomhedsformkode":\[60,80,81\]/);
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

// Final review fixes.
const hitsOf = async () => JSON.parse(await fixture('search-workslip.json')).hits.hits;
const clientFor = (hits, total = hits.length, status = 200) => createCvrClient({ endpoint, username: 'u', password: 'p', fetch: async () => new Response(JSON.stringify({ hits: { total, hits } }), { status }) });
const withCompany = (hit, change) => { const copy = structuredClone(hit); change(copy._source.Vrvirksomhed); return copy; };

test('the query ranks by the score points and filters on an explicit unprotected flag', () => {
  const body = buildSearchQuery({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100, preset: { sweetSpot: ['ANTAL_10_19'], adjacent: ['ANTAL_2_4'] } });
  const text = JSON.stringify(body);
  assert.match(text, /"filter":\[\{"term":\{"Vrvirksomhed\.reklamebeskyttet":false\}\}/);
  assert.doesNotMatch(text, /must_not/);
  assert.match(text, /\{"prefix":\{"Vrvirksomhed\.virksomhedMetadata\.nyesteHovedbranche\.branchekode":\{"value":"43","boost":45\}\}\}/);
  assert.match(text, /\{"prefix":\{"Vrvirksomhed\.virksomhedMetadata\.nyesteBibranche1\.branchekode":\{"value":"43","boost":20\}\}\}/);
  assert.match(text, /"query":"ANTAL_10_19","boost":30/);
  assert.match(text, /"query":"ANTAL_2_4","boost":15/);
  assert.match(text, /stiftelsesDato":\{"lte":"now-2y\/d","boost":15\}/);
});

test('K/S is not an allowed company form', () => {
  assert.match(JSON.stringify(buildSearchQuery({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 1 })), /virksomhedsformkode":\[60,80,81\]/);
});

test('search reports the register total next to the companies', async () => {
  const result = await clientFor(await hitsOf(), 4321).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100 });
  assert.equal(result.total, 4321);
  assert.deepEqual(result.companies.map(company => company.cvr), ['12345678', '23456789']);
  assert.equal((await clientFor(await hitsOf(), { value: 77, relation: 'gte' }).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100 })).total, 77);
});

test('a company without an explicit unprotected flag is never used', async () => {
  const [lund] = await hitsOf();
  for (const flag of [undefined, null, 'false']) {
    const hit = withCompany(lund, company => { if (flag === undefined) delete company.reklamebeskyttet; else company.reklamebeskyttet = flag; });
    assert.deepEqual((await clientFor([hit]).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100 })).companies, [], String(flag));
    assert.equal((await clientFor([hit]).company('12345678')).protected, true, String(flag));
  }
});

test('search drops companies whose shown size or municipality is outside the request', async () => {
  const [lund] = await hitsOf();
  const lagging = withCompany(lund, company => {
    company.virksomhedMetadata.nyesteErstMaanedsbeskaeftigelse.intervalKodeAntalAnsatte = 'ANTAL_50_99';
    company.virksomhedMetadata.nyesteAarsbeskaeftigelse = { intervalKodeAntalAnsatte: 'ANTAL_10_19' };
  });
  assert.deepEqual((await clientFor([lagging]).search({ codes: ['43'], municipalityCodes: [], sizes: ['ANTAL_10_19'], limit: 100 })).companies, []);
  assert.deepEqual((await clientFor([lund]).search({ codes: ['43'], municipalityCodes: ['101'], sizes: [], limit: 100 })).companies, []);
});

test('an answer in the wrong shape is a 502, not an empty list', async () => {
  await assert.rejects(clientFor([{ foo: 1 }, { _source: { other: {} } }]).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100 }), error => error.status === 502);
  const [lund, holm] = await hitsOf();
  const noNumber = withCompany(lund, company => { delete company.cvrNummer; });
  const result = await clientFor([noNumber, holm]).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 100 });
  assert.deepEqual(result.companies.map(company => company.cvr), ['23456789']);
});

test('a refused CVR login reads as not connected', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(clientFor([], 0, status).search({ codes: ['43'], municipalityCodes: [], sizes: [], limit: 1 }), error => error.status === 503 && error.message === 'Company search is not connected yet.');
  }
});

test('form codes are matched as own keys only', async () => {
  const [lund] = await hitsOf();
  const odd = withCompany(lund, company => { company.virksomhedMetadata.nyesteVirksomhedsform.virksomhedsformkode = 'toString'; });
  assert.equal((await clientFor([odd]).company('12345678')).allowedForm, false);
});
