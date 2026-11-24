import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { createStore } from '../commercial/server/store.mjs';

const owner = { sub: 'synthetic-owner', email: 'william@example.test' };
const check = (overrides = {}) => ({
  cvr: '12345678',
  description: 'Tømrer i Aarhus siden 2014.',
  systems: [{ name: 'Apacta', url: 'https://www.lund-toemrer.dk/' }],
  jobsPage: 'https://www.lund-toemrer.dk/job/toemrer',
  pages: [{ url: 'https://www.lund-toemrer.dk/', status: 200 }],
  checkedAt: '2026-11-24T10:00:00.000Z',
  ...overrides,
});

test('credits are reserved only while the month stays within the cap', async t => {
  const store = createStore((await createCommercialHarness(t)).db);
  assert.equal(await store.reserveCredits('2026-11', 1, 2), true);
  assert.equal(await store.reserveCredits('2026-11', 1, 2), true);
  assert.equal(await store.reserveCredits('2026-11', 1, 2), false);
  assert.equal(await store.creditsUsed('2026-11'), 2);
  assert.equal(await store.reserveCredits('2026-12', 1, 2), true);
  assert.equal(await store.reserveCredits('2027-01', 3, 2), false);
  assert.equal(await store.creditsUsed('2027-01'), 0);
});

test('parallel reservations never pass the cap', async t => {
  const store = createStore((await createCommercialHarness(t)).db);
  const results = await Promise.all(Array.from({ length: 5 }, () => store.reserveCredits('2026-11', 1, 3)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await store.creditsUsed('2026-11'), 3);
});

test('addCredits adds provider extras even past the cap', async t => {
  const store = createStore((await createCommercialHarness(t)).db);
  assert.equal(await store.reserveCredits('2026-11', 1, 1), true);
  await store.addCredits('2026-11', 2);
  assert.equal(await store.creditsUsed('2026-11'), 3);
  await store.addCredits('2026-10', 0);
  assert.equal(await store.creditsUsed('2026-10'), 0);
});

test('a website check is stored per CVR number, replaced by the next, and recorded as an event', async t => {
  const harness = await createCommercialHarness(t);
  const store = createStore(harness.db);
  await store.saveWebsiteCheck(check(), 3, owner);
  const second = check({ description: 'Ny tekst.', checkedAt: '2026-11-25T10:00:00.000Z' });
  assert.deepEqual(await store.saveWebsiteCheck(second, 3, owner), second);
  const checks = await store.websiteChecks(['12345678', '23456789']);
  assert.equal(checks.size, 1);
  assert.deepEqual(checks.get('12345678'), second);
  assert.equal((await store.websiteChecks([])).size, 0);
  const { results } = await harness.db.prepare('SELECT document FROM sales_events').all();
  const events = results.map(row => JSON.parse(row.document)).filter(item => item.recordType === 'websiteCheck');
  assert.equal(events.length, 2);
  for (const item of events) {
    assert.equal(item.operation, 'checked');
    assert.deepEqual(item.actor, owner);
    assert.deepEqual(item.details, { cvr: '12345678', credits: 3 });
  }
});

test('website-check events stay out of recent activity', async t => {
  const store = createStore((await createCommercialHarness(t)).db);
  await store.saveWebsiteCheck(check(), 1, owner);
  const { events } = await store.state();
  assert.equal(events.filter(item => item.recordType === 'websiteCheck').length, 0);
});
