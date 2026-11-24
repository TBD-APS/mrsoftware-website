import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirecrawlClient, firecrawlClientFromEnv, firecrawlTimeouts } from '../commercial/server/firecrawl.mjs';
import { HttpError } from '../commercial/server/validation.mjs';
import { fixtureFirecrawlFetch } from './helpers/firecrawl-fixture.mjs';

const apiKey = 'synthetic-firecrawl-key';
const home = 'https://www.lund-toemrer.dk/';
const client = (fetch, options = {}) => createFirecrawlClient({ apiKey, fetch, ...options });
const rejectsWith = async (promise, status, message) => {
  const error = await promise.then(() => null, caught => caught);
  assert.ok(error instanceof HttpError, String(error));
  assert.equal(error.status, status);
  assert.equal(error.message, message);
  assert.doesNotMatch(error.message, /synthetic-firecrawl-key/);
};

test('scrape posts one v2 request with the key, markdown and links, Danish location and no main-content filter', async () => {
  const fetch = fixtureFirecrawlFetch();
  const page = await client(fetch).scrape(home);
  const [call] = fetch.calls;
  assert.equal(fetch.calls.length, 1);
  assert.equal(call.url, 'https://api.firecrawl.dev/v2/scrape');
  assert.equal(call.init.method, 'POST');
  assert.equal(new Headers(call.init.headers).get('Authorization'), 'Bearer synthetic-firecrawl-key');
  assert.equal(new Headers(call.init.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(call.body, { url: home, formats: ['markdown', 'links'], onlyMainContent: false, location: { country: 'DK', languages: ['da'] }, timeout: 18000 });
  assert.equal(page.url, home);
  assert.equal(page.statusCode, 200);
  assert.match(page.markdown, /Apacta/);
  assert.ok(page.links.includes('https://www.lund-toemrer.dk/om-os'));
  assert.equal(page.metadata.title, 'Lund Tømrer ApS');
  assert.equal(page.extraCredits, 0);
});

test('a provider cost is reported as extra credits', async () => {
  const withCost = cost => fixtureFirecrawlFetch({ pages: new Map([[home, { success: true, data: { markdown: '', links: [], metadata: { statusCode: 200, provider: { id: 'x', creditsCost: cost } } } }]]) });
  assert.equal((await client(withCost(4)).scrape(home)).extraCredits, 4);
  for (const cost of [0, -2, '4', null, Number.NaN]) assert.equal((await client(withCost(cost)).scrape(home)).extraCredits, 0, String(cost));
});

test('a page without a status or content is returned as not loaded, not as a failure', async () => {
  const fetch = fixtureFirecrawlFetch({ pages: new Map([[home, { success: true, data: { metadata: {} } }]]) });
  const page = await client(fetch).scrape(home);
  assert.equal(page.statusCode, 0);
  assert.equal(page.markdown, '');
  assert.deepEqual(page.links, []);
});

test('a missing key means the website check is not connected', () => {
  for (const options of [{}, { apiKey: '' }, { apiKey: '   ' }]) {
    assert.throws(() => createFirecrawlClient(options), error => error instanceof HttpError && error.status === 503 && error.message === 'Website check is not connected yet.');
  }
  assert.throws(() => firecrawlClientFromEnv({}), error => error.status === 503);
  assert.equal(typeof firecrawlClientFromEnv({ FIRECRAWL_API_KEY: apiKey }).scrape, 'function');
});

test('Firecrawl refusals and failures become plain errors without the key', async () => {
  const answering = response => fixtureFirecrawlFetch({ pages: new Map([[home, response]]) });
  await rejectsWith(client(answering(new Response('no', { status: 401 }))).scrape(home), 503, 'Website check is not connected yet.');
  await rejectsWith(client(answering(new Response('no', { status: 403 }))).scrape(home), 503, 'Website check is not connected yet.');
  await rejectsWith(client(answering(new Response('{}', { status: 402 }))).scrape(home), 429, 'Firecrawl has no credits left this month.');
  for (const response of [new Response('boom', { status: 500 }), Response.json({ success: false, error: 'synthetic-firecrawl-key failed' }), Response.json({ success: true }), new Response('not json')]) {
    await rejectsWith(client(answering(response)).scrape(home), 502, 'The website did not answer. Try again later.');
  }
  await rejectsWith(client(async () => { throw new Error('network synthetic-firecrawl-key'); }).scrape(home), 502, 'The website did not answer. Try again later.');
  const hanging = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await rejectsWith(client(hanging, { timeoutMs: 10 }).scrape(home), 502, 'The website did not answer. Try again later.');
});

test('robots fetches robots.txt from the site itself and treats failures as no rules', async () => {
  const fetch = fixtureFirecrawlFetch();
  assert.equal(await client(fetch).robots('https://www.lund-toemrer.dk'), 'User-agent: *\nDisallow: /admin\n');
  const [call] = fetch.calls;
  assert.equal(call.url, 'https://www.lund-toemrer.dk/robots.txt');
  assert.equal(new Headers(call.init.headers).get('Authorization'), null);
  assert.equal((await client(fixtureFirecrawlFetch({ robots: 'x'.repeat(70000) })).robots('https://www.lund-toemrer.dk')).length, 65536);
  assert.equal(await client(fixtureFirecrawlFetch({ robots: null })).robots('https://www.lund-toemrer.dk'), '');
  assert.equal(await client(async () => { throw new Error('down'); }).robots('https://www.lund-toemrer.dk'), '');
  const hanging = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await client(hanging, { robotsTimeoutMs: 10 }).robots('https://www.lund-toemrer.dk'), '');
});

test('a whole check fits well inside the 60 seconds the backoffice waits', () => {
  // robots.txt, then the homepage, then the about and jobs pages together.
  assert.ok(firecrawlTimeouts.robotsMs + 2 * firecrawlTimeouts.scrapeMs <= 45000);
  assert.ok(firecrawlTimeouts.scrapeMs > 18000);
});
