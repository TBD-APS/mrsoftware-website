import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { fixtureCvrClient } from './helpers/cvr-fixture.mjs';
import { firecrawlPages, fixtureFirecrawlClient } from './helpers/firecrawl-fixture.mjs';
import { createStore } from '../commercial/server/store.mjs';

const owner = { sub: 'synthetic-owner', email: 'william@example.test' };
const path = cvr => `/api/backoffice/leads/${cvr}/website`;
const home = 'https://www.lund-toemrer.dk/';
const fixedClock = (iso = '2026-11-24T10:00:00.000Z') => {
  const clock = () => new Date(clock.now);
  clock.now = Date.parse(iso);
  return clock;
};

async function setup(t, { firecrawl = fixtureFirecrawlClient(), clock = fixedClock(), cvrClient } = {}) {
  const harness = await createCommercialHarness(t, { firecrawlClient: firecrawl, clock, ...(cvrClient ? { cvrClient } : {}) });
  return { ...harness, firecrawl, clock, store: createStore(harness.db), scrapes: () => firecrawl.fetch.scrapes().length };
}

async function events(harness) {
  const { results } = await harness.db.prepare('SELECT document FROM sales_events').all();
  return results.map(row => JSON.parse(row.document)).filter(item => item.recordType === 'websiteCheck');
}

// A CVR hit for a synthetic company like Lund Tømrer but with another number and website.
function companyWithWebsite(cvr, website) {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/cvr/search-workslip.json', import.meta.url), 'utf8'));
  const hit = structuredClone(fixture.hits.hits.find(entry => entry._source.Vrvirksomhed.cvrNummer === 12345678));
  hit._source.Vrvirksomhed.cvrNummer = Number(cvr);
  hit._source.Vrvirksomhed.hjemmeside = [{ kontaktoplysning: website, hemmelig: false, periode: { gyldigFra: '2014-01-01', gyldigTil: null } }];
  return hit;
}

test('checking a website reads home, about and jobs pages, stores facts and spends three credits', async t => {
  const harness = await setup(t);
  const response = await harness.call('POST', path('12345678'), {});
  assert.equal(response.status, 201);
  assert.equal(response.body.spent, true);
  const { check } = response.body;
  assert.equal(check.cvr, '12345678');
  assert.equal(check.description, 'Tømrer i Aarhus siden 2014. Vi bygger tage, altaner og tilbygninger.');
  assert.deepEqual(check.systems, [{ name: 'Apacta', url: home }]);
  assert.equal(check.jobsPage, 'https://www.lund-toemrer.dk/job/toemrer');
  assert.deepEqual(check.pages.map(page => page.url), [home, 'https://www.lund-toemrer.dk/om-os', 'https://www.lund-toemrer.dk/job/toemrer']);
  assert.equal(check.checkedAt, '2026-11-24T10:00:00.000Z');
  assert.equal(harness.scrapes(), 3);
  assert.equal(harness.firecrawl.fetch.calls.filter(call => call.url === 'https://www.lund-toemrer.dk/robots.txt').length, 1);
  assert.equal(await harness.store.creditsUsed('2026-11'), 3);
  const [event, ...rest] = await events(harness);
  assert.equal(rest.length, 0);
  assert.deepEqual(event.details, { cvr: '12345678', credits: 3 });
  assert.deepEqual(event.actor, owner);
  assert.deepEqual((await harness.call('GET', path('12345678'))).body, { check });
});

test('a check younger than 30 days is returned without spending', async t => {
  const harness = await setup(t);
  const first = await harness.call('POST', path('12345678'), {});
  harness.clock.now += 29 * 86400000;
  const second = await harness.call('POST', path('12345678'), {});
  assert.equal(second.status, 200);
  assert.equal(second.body.spent, false);
  assert.deepEqual(second.body.check, first.body.check);
  assert.equal(harness.scrapes(), 3);
  assert.equal(await harness.store.creditsUsed('2026-11'), 3);
});

test('a check older than 30 days runs again', async t => {
  const harness = await setup(t);
  await harness.call('POST', path('12345678'), {});
  harness.clock.now += 31 * 86400000;
  const again = await harness.call('POST', path('12345678'), {});
  assert.equal(again.status, 201);
  assert.equal(again.body.check.checkedAt, '2026-12-25T10:00:00.000Z');
  assert.equal(harness.scrapes(), 6);
  assert.equal(await harness.store.creditsUsed('2026-12'), 3);
});

test('the lead page and search results carry the stored check', async t => {
  const harness = await setup(t);
  assert.equal((await harness.call('GET', '/api/backoffice/leads/12345678?product=workslip')).body.lead.websiteCheck, null);
  await harness.call('POST', path('12345678'), {});
  const { lead } = (await harness.call('GET', '/api/backoffice/leads/12345678?product=workslip')).body;
  assert.equal(lead.websiteCheck.systems[0].name, 'Apacta');
  const { results } = (await harness.call('GET', '/api/backoffice/leads?product=workslip&regions=1082')).body;
  assert.equal(results.find(item => item.cvr === '12345678').websiteCheck.jobsPage, 'https://www.lund-toemrer.dk/job/toemrer');
  assert.equal(results.find(item => item.cvr === '23456789').websiteCheck, null);
});

test('robots rules are kept: disallowed pages are skipped and a site closed to robots is not read', async t => {
  const skipping = await setup(t, { firecrawl: fixtureFirecrawlClient({ robots: 'User-agent: *\nDisallow: /om-os' }) });
  const partial = await skipping.call('POST', path('12345678'), {});
  assert.equal(partial.status, 201);
  assert.equal(skipping.scrapes(), 2);
  assert.ok(!partial.body.check.pages.some(page => page.url.endsWith('/om-os')));
  const closed = await setup(t, { firecrawl: fixtureFirecrawlClient({ robots: 'User-agent: *\nDisallow: /' }) });
  const refused = await closed.call('POST', path('12345678'), {});
  assert.equal(refused.status, 422);
  assert.equal(refused.body.error, 'This website asks robots not to read it.');
  assert.equal(closed.scrapes(), 0);
  assert.equal(await closed.store.creditsUsed('2026-11'), 0);
});

test('the monthly cap stops scraping and says when it resets', async t => {
  const harness = await setup(t);
  const capped = await harness.call('POST', path('12345678'), {}, { env: { FIRECRAWL_MONTHLY_CREDITS: '2' } });
  assert.equal(capped.status, 201);
  assert.deepEqual(capped.body.check.pages.map(page => page.url), [home, 'https://www.lund-toemrer.dk/om-os']);
  assert.equal(capped.body.check.jobsPage, null);
  assert.equal(await harness.store.creditsUsed('2026-11'), 2);
  // A month already at its cap refuses before any scrape.
  const used = await setup(t, { cvrClient: fixtureCvrClient(new Map([['87654321', companyWithWebsite('87654321', 'www.lund-toemrer.dk')]])) });
  await used.store.reserveCredits('2026-11', 2, 2);
  const refused = await used.call('POST', path('87654321'), {}, { env: { FIRECRAWL_MONTHLY_CREDITS: '2' } });
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, "This month's website checks are used up. They reset on 1 December.");
  assert.equal(used.scrapes(), 0);
});

test('a homepage that fails gives a plain error, stores nothing and keeps the credit counted', async t => {
  const pages = firecrawlPages();
  pages.set(home, { success: true, data: { markdown: '', links: [], metadata: { sourceURL: home, statusCode: 503 } } });
  const harness = await setup(t, { firecrawl: fixtureFirecrawlClient({ pages }) });
  const response = await harness.call('POST', path('12345678'), {});
  assert.equal(response.status, 502);
  assert.equal(response.body.error, 'The website did not answer. Try again later.');
  assert.equal((await harness.store.websiteChecks(['12345678'])).size, 0);
  assert.equal(await harness.store.creditsUsed('2026-11'), 1);
  assert.equal((await events(harness)).length, 0);
});

test('a sub-page that fails is recorded as not loaded and the check is still stored', async t => {
  const pages = firecrawlPages();
  pages.set('https://www.lund-toemrer.dk/job/toemrer', new Response('boom', { status: 500 }));
  const harness = await setup(t, { firecrawl: fixtureFirecrawlClient({ pages }) });
  const response = await harness.call('POST', path('12345678'), {});
  assert.equal(response.status, 201);
  assert.equal(response.body.check.jobsPage, null);
  assert.deepEqual(response.body.check.pages.at(-1), { url: 'https://www.lund-toemrer.dk/job/toemrer', status: 0 });
});

test('the about and jobs pages are read at the same time', async t => {
  const pages = firecrawlPages();
  let open = 0, most = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  for (const url of ['https://www.lund-toemrer.dk/om-os', 'https://www.lund-toemrer.dk/job/toemrer']) {
    const fixture = pages.get(url);
    pages.set(url, async () => {
      open += 1; most = Math.max(most, open);
      if (open === 2) release();
      await Promise.race([gate, new Promise(resolve => setTimeout(resolve, 500))]);
      open -= 1;
      return fixture;
    });
  }
  const harness = await setup(t, { firecrawl: fixtureFirecrawlClient({ pages }) });
  const response = await harness.call('POST', path('12345678'), {});
  assert.equal(response.status, 201);
  assert.equal(most, 2);
  assert.equal(response.body.check.jobsPage, 'https://www.lund-toemrer.dk/job/toemrer');
  assert.deepEqual(response.body.check.pages.map(page => page.url), [home, 'https://www.lund-toemrer.dk/om-os', 'https://www.lund-toemrer.dk/job/toemrer']);
});

test('provider costs reported by Firecrawl are counted', async t => {
  const pages = firecrawlPages();
  const homePage = structuredClone(pages.get(home));
  homePage.data.metadata.provider = { id: 'synthetic', creditsCost: 4 };
  pages.set(home, homePage);
  const harness = await setup(t, { firecrawl: fixtureFirecrawlClient({ pages }) });
  await harness.call('POST', path('12345678'), {});
  assert.equal(await harness.store.creditsUsed('2026-11'), 7);
  assert.equal((await events(harness))[0].details.credits, 7);
});

test('companies that cannot be leads, or have no website, are not checked', async t => {
  const harness = await setup(t, { cvrClient: fixtureCvrClient(new Map([['87654321', companyWithWebsite('87654321', 'facebook.com/x')]])) });
  for (const [cvr, status, message] of [
    ['34567890', 404, 'Company was not found in the register.'],
    ['23456789', 422, 'CVR has no website for this company.'],
    ['87654321', 422, 'This website cannot be checked.'],
    ['99999999', 404, 'Company was not found in the register.'],
  ]) {
    const response = await harness.call('POST', path(cvr), {});
    assert.equal(response.status, status, cvr);
    assert.equal(response.body.error, message, cvr);
  }
  assert.equal(harness.scrapes(), 0);
  assert.equal(await harness.store.creditsUsed('2026-11'), 0);
});

test('the website check is off until the key and the cap are set', async t => {
  const harness = await setup(t);
  for (const env of [{ FIRECRAWL_API_KEY: '' }, { FIRECRAWL_MONTHLY_CREDITS: '0' }, { FIRECRAWL_MONTHLY_CREDITS: 'abc' }, { FIRECRAWL_MONTHLY_CREDITS: '2.5' }, { FIRECRAWL_MONTHLY_CREDITS: undefined }]) {
    for (const method of ['POST', 'GET']) {
      const response = await harness.call(method, path('12345678'), method === 'POST' ? {} : undefined, { env });
      assert.equal(response.status, 503, `${method} ${JSON.stringify(env)}`);
      assert.equal(response.body.error, 'Website check is not connected yet.');
    }
  }
  assert.equal(harness.firecrawl.fetch.calls.length, 0);
});

test('checking a website needs Access and a same-origin JSON request', async t => {
  const harness = await setup(t);
  assert.equal((await harness.call('POST', path('12345678'), {}, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  assert.equal((await harness.call('POST', path('12345678'), {}, { omitHeaders: ['X-Requested-With'] })).status, 403);
  assert.equal((await harness.call('POST', path('12345678'), { url: 'https://evil.example/' })).status, 400);
  assert.equal((await harness.call('PUT', path('12345678'), {})).status, 405);
  assert.equal((await harness.call('GET', path('12345678'))).status, 404);
  assert.equal((await harness.call('GET', path('12345678'))).body.error, 'This website has not been checked yet.');
  assert.equal(harness.scrapes(), 0);
});

test('nothing stored or returned contains page text or the key', async t => {
  const harness = await setup(t);
  const response = await harness.request('POST', path('12345678'), {});
  const text = await response.text();
  const { results: checks } = await harness.db.prepare('SELECT document FROM sales_website_checks').all();
  const { results: stored } = await harness.db.prepare('SELECT document FROM sales_events').all();
  for (const body of [text, ...checks.map(row => row.document), ...stored.map(row => row.document)]) {
    assert.doesNotMatch(body, /Vores mester Jens|svarer altid|synthetic-firecrawl-key/);
  }
});
