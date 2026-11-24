import { websiteSystems } from '../shared/lead-presets.mjs';

// Fixed rules that turn a lead's scraped pages into a few facts. No language model: every fact
// is the company's own words or a fixed system name found on a page, with a link to that page.
// Page text never leaves this module.

export const excludedDomains = ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'google.com', 'krak.dk', 'degulesider.dk', 'proff.dk', 'cvrapi.dk', 'virk.dk', 'jobindex.dk', 'trustpilot.dk', 'wikipedia.org'];

const maxDescription = 300;
const aboutPath = /(^|\/)(om-os|om|about|virksomheden)(\/|$)/i;
const jobsPath = /(^|\/)(job|jobs|karriere|ledige-stillinger|career|careers)(\/|$)/i;
const emailPattern = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const phonePattern = /(\+45\s?)?(\d[\s.-]?){7}\d/;
const bareHost = host => host.replace(/^www\./, '');
const excluded = host => excludedDomains.some(domain => host === domain || host.endsWith('.' + domain));
const loaded = status => Number.isInteger(status) && status >= 200 && status < 300;

// The homepage (<scheme>://<host>/) of a website from CVR, or null when it cannot be checked:
// not http(s), an IP address or a host without a dot, a port or a login, or an excluded domain.
export function safeWebsite(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[a-z0-9.-]+:\d/i.test(text) ? text : 'https://' + text;
  let url;
  try { url = new URL(withScheme); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host) || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || excluded(host)) return null;
  return new URL(`${url.protocol}//${host}/`);
}

// The first about link and the first jobs link on the homepage's own host (www. ignored).
export function pickPages(home, links) {
  const pages = { about: null, jobs: null };
  for (const link of Array.isArray(links) ? links : []) {
    if (typeof link !== 'string') continue;
    let url;
    try { url = new URL(link, home); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || bareHost(url.hostname) !== bareHost(home.hostname) || url.pathname === '/') continue;
    url.hash = '';
    if (!pages.about && aboutPath.test(url.pathname)) pages.about = url.href;
    else if (!pages.jobs && jobsPath.test(url.pathname)) pages.jobs = url.href;
  }
  return pages;
}

function ruleMatches(rule, path) {
  const end = rule.endsWith('$');
  const body = (end ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (end ? '$' : '')).test(path);
}

// Whether robots.txt lets every robot (User-agent: *) read the path. The longest matching rule
// wins, and Allow wins a tie. Missing or unreadable rules allow everything.
export function robotsAllows(robotsText, path) {
  const rules = [];
  let agents = [], inRules = false;
  for (const raw of String(robotsText ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const [, field, value] = match;
    const name = field.toLowerCase();
    if (name === 'user-agent') {
      if (inRules) { agents = []; inRules = false; }
      agents.push(value.toLowerCase());
    } else if (name === 'allow' || name === 'disallow') {
      inRules = true;
      if (agents.includes('*') && value) rules.push({ allow: name === 'allow', path: value });
    }
  }
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

const firstText = value => Array.isArray(value) ? value.find(item => typeof item === 'string') : value;

function description(metadata = {}) {
  const raw = [metadata.description, metadata.ogDescription].map(firstText).find(value => typeof value === 'string' && value.trim());
  if (!raw) return null;
  let text = raw.replace(/\s+/g, ' ').trim();
  if (emailPattern.test(text) || phonePattern.test(text)) return null;
  if (text.length > maxDescription) {
    const cut = text.slice(0, maxDescription - 1);
    const space = cut.lastIndexOf(' ');
    text = (space > 0 ? cut.slice(0, space) : cut) + '…';
  }
  return text;
}

const systemNames = [...new Set(Object.values(websiteSystems).flat())];
const systemPatterns = systemNames.map(name => ({
  name,
  pattern: new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'),
}));

// pages: [{ url, kind: 'home'|'about'|'jobs', statusCode, markdown, metadata }], homepage first.
export function websiteFacts({ cvr, pages, checkedAt }) {
  const home = pages.find(page => page.kind === 'home');
  const readable = pages.filter(page => loaded(page.statusCode) && typeof page.markdown === 'string');
  const systems = [];
  for (const { name, pattern } of systemPatterns) {
    const found = readable.find(page => pattern.test(page.markdown));
    if (found) systems.push({ name, url: found.url });
  }
  return {
    cvr,
    description: home && loaded(home.statusCode) ? description(home.metadata) : null,
    systems,
    jobsPage: pages.find(page => page.kind === 'jobs' && loaded(page.statusCode))?.url ?? null,
    pages: pages.map(page => ({ url: page.url, status: page.statusCode })),
    checkedAt,
  };
}
