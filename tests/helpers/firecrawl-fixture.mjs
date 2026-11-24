import { readFileSync } from 'node:fs';
import { createFirecrawlClient } from '../../commercial/server/firecrawl.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/firecrawl/${name}`, import.meta.url), 'utf8');
export const firecrawlPages = () => new Map([
  ['https://www.lund-toemrer.dk/', JSON.parse(fixture('home.json'))],
  ['https://www.lund-toemrer.dk/om-os', JSON.parse(fixture('about.json'))],
  ['https://www.lund-toemrer.dk/job/toemrer', JSON.parse(fixture('jobs.json'))],
]);
export const firecrawlRobots = fixture('robots.txt');

const notFoundPage = url => ({ success: true, data: { markdown: '', links: [], metadata: { sourceURL: url, statusCode: 404 } } });

// A fetch that answers Firecrawl scrapes from the synthetic fixtures and robots.txt from the
// site. A page value may be a fixture object, a Response or a function returning either.
// Every call is kept in fetch.calls as { url, init, body }.
export function fixtureFirecrawlFetch({ pages = firecrawlPages(), robots = firecrawlRobots } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), init, body });
    if (String(url).endsWith('/robots.txt')) {
      if (robots instanceof Response) return robots.clone();
      return robots === null ? new Response('Not found', { status: 404 }) : new Response(robots, { headers: { 'Content-Type': 'text/plain' } });
    }
    let page = pages.get(body?.url) ?? notFoundPage(body?.url);
    if (typeof page === 'function') page = await page(body);
    return page instanceof Response ? page.clone() : Response.json(page);
  };
  fetch.calls = calls;
  fetch.scrapes = () => calls.filter(call => call.url.endsWith('/v2/scrape'));
  return fetch;
}

// A client factory like firecrawlClientFromEnv, backed by the fixtures; factory.fetch exposes calls.
export function fixtureFirecrawlClient(options) {
  const fetch = fixtureFirecrawlFetch(options);
  const factory = env => createFirecrawlClient({ apiKey: env.FIRECRAWL_API_KEY, fetch });
  factory.fetch = fetch;
  return factory;
}
