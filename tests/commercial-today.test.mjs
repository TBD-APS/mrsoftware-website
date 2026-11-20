import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialHarness, opportunityInput } from './helpers/commercial.mjs';
import { seedSalesQueue } from './helpers/sales-queues.mjs';

const path = params => '/api/backoffice/today?' + new URLSearchParams({ date: '2030-11-20', ...params });
const kinds = ['followUps', 'enquiries', 'quotes'];

test('Today finds older matching work and its customer beyond 100 newer unrelated records', async t => {
  const app = await createCommercialHarness(t);
  const old = await seedSalesQueue(app, 1, { prefix: 'Older' });
  await seedSalesQueue(app, 105, { matching: false, now: '2035-01-01T12:00:00.000Z', prefix: 'Newer' });
  const recent = (await app.call('GET', '/api/backoffice/state')).body;
  assert.ok(!recent.customers.some(item => item.id === old.customer.id));
  assert.ok(!recent.opportunities.some(item => item.id === old.followUps[0].id));
  assert.ok(!recent.quotes.some(item => item.id === old.quotes[0].id));
  const before = await app.count('sales_events');
  const result = await app.call('GET', path());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.body.date, '2030-11-20');
  for (const kind of kinds) {
    assert.deepEqual(result.body[kind].items.map(item => item.id), [old[kind][0].id]);
    assert.equal(result.body[kind].next, null);
  }
  assert.equal(result.body.customers.find(item => item.id === old.customer.id).name, 'Older customer');
  assert.equal(await app.count('sales_events'), before);
});

test('Today pages every queue without omissions or duplicates when ordering values match', async t => {
  const app = await createCommercialHarness(t);
  const seeded = await seedSalesQueue(app, 55);
  const ids = Object.fromEntries(kinds.map(kind => [kind, []]));
  let cursors = {};
  for (const size of [25, 25, 5]) {
    const result = await app.call('GET', path(cursors));
    assert.equal(result.status, 200);
    const next = {};
    for (const kind of kinds) {
      const page = result.body[kind];
      assert.equal(page.items.length, size);
      ids[kind].push(...page.items.map(item => item.id));
      if (size === 5) assert.equal(page.next, null);
      else { assert.equal(typeof page.next, 'string'); next[kind + 'After'] = page.next; }
    }
    // The URL cursor is reusable: reload does not advance the page.
    assert.deepEqual((await app.call('GET', path(cursors))).body, result.body);
    cursors = next;
  }
  for (const kind of kinds) assert.deepEqual(ids[kind], seeded[kind].map(item => item.id).sort());
});

test('Today uses the requested local date and removes rescheduled, closed opportunities and quotes', async t => {
  const app = await createCommercialHarness(t);
  const seeded = await seedSalesQueue(app, 1);
  const due = seeded.followUps[0];
  assert.equal((await app.call('GET', path({ date: '2020-11-18' }))).body.followUps.items.length, 0);
  assert.equal((await app.call('GET', path({ date: '2020-11-19' }))).body.followUps.items.length, 1);
  await app.call('PUT', '/api/backoffice/opportunities/' + due.id, opportunityInput(seeded.customer.id, { revision: 1, nextFollowUp: '2030-11-21' }));
  assert.equal((await app.call('GET', path())).body.followUps.items.length, 0);
  await app.call('PUT', '/api/backoffice/opportunities/' + due.id, opportunityInput(seeded.customer.id, { revision: 2, stage: 'lost', nextFollowUp: '2020-11-19' }));
  await app.call('PUT', '/api/backoffice/quotes/' + seeded.quotes[0].id, { revision: 1, status: 'accepted' });
  const today = (await app.call('GET', path())).body;
  assert.equal(today.followUps.items.length, 0);
  assert.equal(today.quotes.items.length, 0);
  const saved = (await app.call('GET', '/api/backoffice/quotes/' + seeded.quotes[0].id)).body.item;
  assert.equal(saved.monthlyMinor, seeded.quotes[0].monthlyMinor);
  assert.deepEqual(saved.snapshot, seeded.quotes[0].snapshot);
});

test('Today validates dates, bounded cursor tuples and query fields before reading queues', async t => {
  const app = await createCommercialHarness(t);
  const id = crypto.randomUUID();
  for (const query of ['', 'date=2030-02-31', 'date=invalid', 'date=2030-11-20&date=2030-11-21', 'date=2030-11-20&unknown=1',
    ...['null', '{}', '[]', '["2030-11-19"]', JSON.stringify(['2030-02-31', id]), JSON.stringify(['2030-11-19', 'bad-id']), JSON.stringify(['2030-11-19', id, 'extra']), 'x'.repeat(201)].map(value => new URLSearchParams({ date: '2030-11-20', followUpsAfter: value }).toString()),
    new URLSearchParams({ date: '2030-11-20', enquiriesAfter: JSON.stringify(['2030-11-19', id]) }).toString(),
    new URLSearchParams({ date: '2030-11-20', quotesAfter: '' }).toString(),
  ]) {
    const result = await app.call('GET', '/api/backoffice/today?' + query);
    assert.equal(result.status, 400, query);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
  }
});

test('Today requires the private host and an approved identity and accepts only GET', async t => {
  const app = await createCommercialHarness(t);
  assert.equal((await app.request('GET', path(), undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  assert.equal((await app.request('GET', path(), undefined, { host: app.env.DEMO_HOST })).status, 404);
  assert.equal((await app.request('POST', path(), {})).status, 405);
});
