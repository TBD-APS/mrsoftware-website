// Source: @mr-software/linking packages/linking/src/index.js. Keep this copy in step with that package.
const placeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const placeKeys = new Set(['id', 'title', 'href', 'summary']);
const linkKeys = new Set(['id', 'toId', 'label']);

export class LinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LinkError';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isPageAddress(href) {
  if (typeof href !== 'string' || href.length < 1 || href.length > 300) return false;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('%') || path.includes('\\') || /\s/.test(path)) return false;
  if (path.includes('?') || /["'<>]/.test(path)) return false;
  let decoded;
  try { decoded = decodeURI(path); } catch { return false; }
  if (decoded.includes('..') || decoded.includes('\\')) return false;
  return hash === '' || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(hash);
}

function unknownKey(value, allowed) {
  return Object.keys(value).find(key => !allowed.has(key));
}

function checkPlace(place, ids) {
  if (!isObject(place)) return ['A page must be an object.'];
  if (unknownKey(place, placeKeys)) return ['A page can only have an id, a name, an address and a summary.'];
  if (typeof place.id !== 'string' || !placeIdPattern.test(place.id)) return ['A page needs a short id made of lowercase letters, numbers and hyphens.'];
  if (ids.has(place.id)) return [`The page id ${place.id} is used twice.`];
  ids.add(place.id);
  if (typeof place.title !== 'string' || place.title.trim() === '' || place.title.trim().length > 80) return ['Every page needs a name of 1 to 80 characters.'];
  if (!isPageAddress(place.href)) return [`The address for ${place.id} must be a path on this site.`];
  if (place.summary != null && (typeof place.summary !== 'string' || place.summary.trim() === '' || place.summary.trim().length > 160)) {
    return ['A page summary must be 1 to 160 characters.'];
  }
  return [];
}

function checkLink(link, fromId, placeIds, seen) {
  if (!isObject(link)) return ['A link must be an object.'];
  if (unknownKey(link, linkKeys)) return ['A link can only name the page it opens and the words on it.'];
  if (typeof link.toId !== 'string' || !placeIds.has(link.toId)) return ['Choose a page from the list.'];
  if (link.toId === fromId) return ['A page does not link to itself.'];
  if (seen.has(link.toId)) return ['That page is already linked.'];
  if (link.id !== `to:${link.toId}`) return ['A link id is fixed from the page it opens.'];
  if (link.label != null && (typeof link.label !== 'string' || link.label.trim() === '' || link.label.trim().length > 80)) {
    return ['Write the words for the link, up to 80 characters.'];
  }
  seen.add(link.toId);
  return [];
}

function normalizePlace(place) {
  const next = { id: place.id, title: place.title.trim(), href: place.href };
  if (place.summary != null) next.summary = place.summary.trim();
  return next;
}

function normalizeLink(link) {
  const next = { id: link.id, toId: link.toId };
  if (link.label != null) next.label = link.label.trim();
  return next;
}

/** Returns a normalised catalogue, or the first plain-language problems. */
export function checkGraph(graph) {
  if (!isObject(graph) || unknownKey(graph, new Set(['places', 'links']))) {
    return { ok: false, errors: ['A link catalogue has pages and the links between them.'] };
  }
  if (!Array.isArray(graph.places) || graph.places.length === 0) return { ok: false, errors: ['Add at least one page.'] };
  if (!isObject(graph.links)) return { ok: false, errors: ['Links are grouped by the page they start from.'] };
  const ids = new Set();
  const errors = [];
  const places = [];
  for (const place of graph.places) {
    const placeErrors = checkPlace(place, ids);
    if (placeErrors.length) errors.push(...placeErrors);
    else places.push(normalizePlace(place));
  }
  const links = {};
  for (const [fromId, list] of Object.entries(graph.links)) {
    if (!ids.has(fromId)) errors.push('Choose a page from the list.');
    if (!Array.isArray(list)) {
      errors.push('The links from a page are a list.');
      continue;
    }
    const seen = new Set();
    const next = [];
    for (const link of list) {
      const linkErrors = checkLink(link, fromId, ids, seen);
      if (linkErrors.length) errors.push(...linkErrors);
      else next.push(normalizeLink(link));
    }
    links[fromId] = next;
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, graph: { places, links } };
}

function readyGraph(graph) {
  const checked = checkGraph(graph);
  if (!checked.ok) throw new LinkError(checked.errors[0]);
  return checked.graph;
}

export function linksOn(graph, fromId) {
  const ready = readyGraph(graph);
  const byId = new Map(ready.places.map(place => [place.id, place]));
  return (ready.links[fromId] ?? []).map(link => ({ link, place: byId.get(link.toId) }));
}

export function searchPlaces(graph, fromId, query = '') {
  const ready = readyGraph(graph);
  const linked = new Set((ready.links[fromId] ?? []).map(link => link.toId));
  const needle = String(query).trim().toLowerCase();
  return ready.places.filter(place => {
    if (place.id === fromId || linked.has(place.id)) return false;
    if (!needle) return true;
    return `${place.title} ${place.href}`.toLowerCase().includes(needle);
  });
}

function replaceList(graph, fromId, list) {
  return { places: graph.places, links: { ...graph.links, [fromId]: list } };
}

/** Returns a new catalogue. The input is left unchanged. */
export function changeLinks(graph, action) {
  const ready = readyGraph(graph);
  if (!ready.places.some(place => place.id === action?.fromId)) throw new LinkError('Choose a page from the list.');
  const list = ready.links[action.fromId] ?? [];
  if (action.type === 'add') {
    const link = { id: `to:${action.toId}`, toId: action.toId };
    if (typeof action.label === 'string' && action.label.trim() !== '') link.label = action.label.trim();
    const errors = checkLink(link, action.fromId, new Set(ready.places.map(place => place.id)), new Set(list.map(item => item.toId)));
    if (errors.length) throw new LinkError(errors[0]);
    return replaceList(ready, action.fromId, [...list, normalizeLink(link)]);
  }
  const index = list.findIndex(link => link.id === action.linkId);
  if (action.type === 'remove' || action.type === 'relabel' || action.type === 'move') {
    if (index < 0) throw new LinkError('That link is not on this page.');
  }
  if (action.type === 'remove') return replaceList(ready, action.fromId, list.filter(link => link.id !== action.linkId));
  if (action.type === 'relabel') {
    if (typeof action.label !== 'string') throw new LinkError('Write the words for the link, up to 80 characters.');
    const label = action.label.trim();
    if (label.length > 80) throw new LinkError('Write the words for the link, up to 80 characters.');
    const next = list.map(link => ({ ...link }));
    if (label === '') delete next[index].label;
    else next[index].label = label;
    return replaceList(ready, action.fromId, next);
  }
  if (action.type === 'move') {
    const target = index + action.direction;
    if (target < 0 || target >= list.length) return ready;
    const next = list.map(link => ({ ...link }));
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return replaceList(ready, action.fromId, next);
  }
  throw new LinkError('Choose add, remove, move or new words.');
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/** HTML for the public list. An empty or invalid catalogue renders nothing. */
export function renderRelatedLinks(graph, fromId, options = {}) {
  let items;
  try { items = linksOn(graph, fromId); } catch { return ''; }
  if (!items.length) return '';
  const heading = options.heading ?? 'See also';
  const headingId = `related-${fromId}`;
  const cards = items.map(({ link, place }) => {
    const title = (link.label ?? place.title).trim();
    const summary = place.summary ? `<span class="related-link-summary">${escapeHtml(place.summary)}</span>` : '';
    return `<li><a class="related-link" href="${escapeHtml(place.href)}"><span class="related-link-title">${escapeHtml(title)}</span>${summary}</a></li>`;
  }).join('');
  return `<section class="related-links" aria-labelledby="${escapeHtml(headingId)}"><h2 id="${escapeHtml(headingId)}">${escapeHtml(heading)}</h2><ul>${cards}</ul></section>`;
}
