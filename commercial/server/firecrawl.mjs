import { HttpError } from './validation.mjs';

// Firecrawl v2 scrape for the website check. Only the Worker calls Firecrawl: the key comes from
// the FIRECRAWL_API_KEY secret and never appears in a response, an error message or the database.
// https://docs.firecrawl.dev/features/scrape

const maxRobots = 65536;
// A check reads robots.txt, then the homepage, then the about and jobs pages together, so its
// worst case is robotsMs + 2 × scrapeMs: 45 s, inside the 60 s the backoffice waits. Firecrawl
// is asked to stop 2 s before the Worker gives up on it.
export const firecrawlTimeouts = { scrapeMs: 20000, robotsMs: 5000 };
const notConnected = () => new HttpError(503, 'Website check is not connected yet.');
const noCredits = () => new HttpError(429, 'Firecrawl has no credits left this month.');
const unavailable = () => new HttpError(502, 'The website did not answer. Try again later.');

async function withTimeout(timeoutMs, work) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await work(controller.signal); } finally { clearTimeout(timer); }
}

export function createFirecrawlClient({ apiKey, fetch = globalThis.fetch, endpoint = 'https://api.firecrawl.dev/v2', timeoutMs = firecrawlTimeouts.scrapeMs, robotsTimeoutMs = firecrawlTimeouts.robotsMs } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw notConnected();
  const authorization = `Bearer ${apiKey.trim()}`;

  return {
    // One page as markdown and links. A page that did not load comes back with its status
    // (0 when Firecrawl gives none); only Firecrawl itself failing is an error.
    async scrape(url) {
      let data;
      try {
        data = await withTimeout(timeoutMs, async signal => {
          const response = await fetch(`${endpoint}/scrape`, {
            method: 'POST',
            headers: { Authorization: authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ url, formats: ['markdown', 'links'], onlyMainContent: false, location: { country: 'DK', languages: ['da'] }, timeout: Math.max(1000, timeoutMs - 2000) }),
            signal,
          });
          if (response.status === 401 || response.status === 403) throw notConnected();
          if (response.status === 402) throw noCredits();
          if (!response.ok) throw unavailable();
          return await response.json();
        });
      } catch (error) {
        throw error instanceof HttpError ? error : unavailable();
      }
      const page = data?.success === true ? data.data : null;
      if (!page || typeof page !== 'object') throw unavailable();
      const metadata = page.metadata && typeof page.metadata === 'object' ? page.metadata : {};
      const cost = metadata.provider?.creditsCost;
      return {
        url,
        statusCode: Number.isInteger(metadata.statusCode) ? metadata.statusCode : 0,
        markdown: typeof page.markdown === 'string' ? page.markdown : '',
        links: Array.isArray(page.links) ? page.links.filter(link => typeof link === 'string') : [],
        metadata,
        extraCredits: typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0,
      };
    },

    // robots.txt read from the site itself, without the Firecrawl key. Any failure means no rules.
    async robots(origin) {
      try {
        return await withTimeout(robotsTimeoutMs, async signal => {
          const response = await fetch(`${origin}/robots.txt`, { headers: { Accept: 'text/plain' }, signal });
          return response.ok ? (await response.text()).slice(0, maxRobots) : '';
        });
      } catch {
        return '';
      }
    },
  };
}

export function firecrawlClientFromEnv(env = {}) {
  return createFirecrawlClient({ apiKey: env.FIRECRAWL_API_KEY });
}
