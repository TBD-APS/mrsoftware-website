import { HttpError } from './validation.mjs';
import { pickPages, robotsAllows, safeWebsite, websiteFacts } from './website-facts.mjs';

// One website check: robots.txt first, then the homepage and at most one about page and one
// jobs page, each reserved as one Firecrawl credit before the call. Provider costs Firecrawl
// reports are counted after. Only the facts are stored; page text stays in memory.

const loaded = status => status >= 200 && status < 300;
const unavailable = () => new HttpError(502, 'The website did not answer. Try again later.');

function usedUp(now) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new HttpError(429, `This month's website checks are used up. They reset on 1 ${next.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}.`);
}

export async function runWebsiteCheck({ company, firecrawl, store, cap, actor, now }) {
  if (!company.website?.trim()) throw new HttpError(422, 'CVR has no website for this company.');
  const home = safeWebsite(company.website);
  if (!home) throw new HttpError(422, 'This website cannot be checked.');
  const robots = await firecrawl.robots(home.origin);
  if (!robotsAllows(robots, home.pathname)) throw new HttpError(422, 'This website asks robots not to read it.');
  const month = now.toISOString().slice(0, 7);
  if (!await store.reserveCredits(month, 1, cap)) throw usedUp(now);

  let reserved = 1, extra = 0;
  const homePage = await firecrawl.scrape(home.href);
  extra += homePage.extraCredits;
  if (!loaded(homePage.statusCode)) {
    await store.addCredits(month, extra);
    throw unavailable();
  }
  const pages = [{ ...homePage, kind: 'home' }];
  const chosen = pickPages(home, homePage.links);
  for (const kind of ['about', 'jobs']) {
    const url = chosen[kind];
    if (!url || !robotsAllows(robots, new URL(url).pathname)) continue;
    if (!await store.reserveCredits(month, 1, cap)) break;
    reserved += 1;
    try {
      const page = await firecrawl.scrape(url);
      extra += page.extraCredits;
      pages.push({ ...page, kind });
    } catch {
      // A sub-page that Firecrawl cannot read is kept as not loaded; the check still counts.
      pages.push({ url, kind, statusCode: 0, markdown: '', metadata: {} });
    }
  }
  await store.addCredits(month, extra);
  return store.saveWebsiteCheck(websiteFacts({ cvr: company.cvr, pages, checkedAt: now.toISOString() }), reserved + extra, actor);
}
