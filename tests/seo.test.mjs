import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { createDashboardHandler } from '../dashboard/handler.mjs';
import { loadDanish, publicSources } from '../tools/build-locales.mjs';
import { englishLanguageLinks, pageAddress, translateHtml } from '../tools/locales.mjs';
import { publicCommercialEntry } from '../website-entry.mjs';

const origin = 'https://mrsoftware.dk';
const organization = `${origin}/#organization`;
const root = fileURLToPath(new URL('..', import.meta.url));
const catalogue = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
const paths = [...new Set([...catalogue.places.map(place => place.href), ...catalogue.sitemapPages]
  .map(path => new URL(path, origin)).filter(url => url.origin === origin)
  .map(url => url.pathname))].filter(path => !/^\/(?:qa|dashboard|backoffice|_development)(?:\/|$)/i.test(path)
    && !publicCommercialEntry(new Request(origin + path)));
const english = path => path.replace(/^\/da\//, '/');
const danish = path => path.startsWith('/da/') ? path : '/da' + path;
// Every catalogued page is published in English and as its generated Danish mirror.
const mirrored = [...new Set(paths.flatMap(path => [english(path), danish(path)]))];
// Tooling, private views and the separately deployed commercial site are not company pages.
const nonSite = /^\/(?:da\/)?(?:qa|dashboard|backoffice|_development|vendor|tests|docs|commercial|tools|node_modules|migrations|test-results)\//i;
const elements = (node, tag) => [...(node.tagName === tag ? [node] : []), ...(node.childNodes ?? []).flatMap(child => elements(child, tag))];
const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const text = node => (node.value ?? '') + (node.childNodes ?? []).map(text).join('');
async function source(path) {
  if (english(path) !== '/roadmap/report/') return readFile(new URL(`..${path}index.html`, import.meta.url), 'utf8');
  // The report renderer inserts its body into this same checked-in head; Danish is translated like build:locales does.
  const template = await readFile(new URL('../tools/roadmap-report-template.html', import.meta.url), 'utf8');
  if (path === '/roadmap/report/') return template;
  const { dictionary, headings } = await loadDanish(root);
  const pages = new Set([...(await publicSources(root)).map(pageAddress), '/roadmap/report/']);
  return translateHtml(englishLanguageLinks(template, '/roadmap/report/'), { dictionary, path: '/roadmap/report/', pages, heading: headings['roadmap/report/index.html'] });
}
async function page(path) {
  const document = parse(await source(path));
  const meta = name => attribute(elements(document, 'meta').find(node => attribute(node, 'name') === name || attribute(node, 'property') === name), 'content');
  const structured = elements(document, 'script').filter(node => attribute(node, 'type') === 'application/ld+json')
    .flatMap(node => { const value = JSON.parse(text(node)); return value['@graph'] ?? [value]; });
  return { document, meta, structured, title: text(elements(document, 'title')[0]) };
}
async function pagesOnDisk(directory = '/') {
  const entries = await readdir(new URL('..' + directory, import.meta.url), { withFileTypes: true });
  const found = entries.some(entry => entry.isFile() && entry.name === 'index.html') ? [directory] : [];
  for (const entry of entries) {
    const path = `${directory}${entry.name}/`;
    if (entry.isDirectory() && !entry.name.startsWith('.') && !nonSite.test(path)) found.push(...await pagesOnDisk(path));
  }
  return found;
}
async function sitemapPaths() {
  const handle = createDashboardHandler({ files: {}, verifyAccess: () => assert.fail('Crawler files must be public') });
  const response = await handle(new Request(origin + '/sitemap.xml'), { ASSETS: { fetch: async () => Response.json(catalogue) } });
  assert.equal(response.status, 200);
  return new Set([...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname));
}
async function assertSearchMetadata(path, titles) {
  const { document, title, meta } = await page(path);
  assert.equal(attribute(elements(document, 'html')[0], 'lang'), path.startsWith('/da/') ? 'da' : 'en', `Language: ${path}`);
  assert.doesNotMatch(meta('robots') ?? '', /noindex/i, `Indexable: ${path}`);
  assert.ok(title.trim(), path);
  assert.equal(titles.has(title), false, `Duplicate title: ${path}`);
  titles.add(title);
  assert.ok(meta('description')?.trim(), `Description: ${path}`);
  assert.equal(meta('og:title'), title, `Sharing title: ${path}`);
  assert.equal(meta('twitter:title'), title, `Twitter title: ${path}`);
  assert.ok(meta('og:description')?.trim(), `Sharing description: ${path}`);
  assert.ok(meta('twitter:description')?.trim(), `Twitter description: ${path}`);
  assert.equal(meta('og:url'), origin + path, `Sharing URL: ${path}`);
  const canonicals = elements(document, 'link').filter(node => attribute(node, 'rel') === 'canonical');
  assert.equal(canonicals.length, 1, `Canonical count: ${path}`);
  assert.equal(attribute(canonicals[0], 'href'), origin + path, `Canonical: ${path}`);
  assert.equal(meta('twitter:card'), 'summary_large_image', path);
  const icon = attribute(elements(document, 'link').find(node => attribute(node, 'rel') === 'icon'), 'href');
  assert.ok(icon, `Favicon: ${path}`);
  assert.equal(new URL(icon, origin).origin, origin, path);
  assert.ok((await readFile(new URL('..' + new URL(icon, origin).pathname, import.meta.url))).length > 0, `Favicon file: ${path}`);
  const image = meta('og:image');
  assert.equal(meta('twitter:image'), image, `Sharing image: ${path}`);
  assert.equal(new URL(image).origin, origin, path);
  const png = await readFile(new URL('..' + new URL(image).pathname, import.meta.url));
  assert.equal(png.readUInt32BE(16), 1200, `Image width: ${path}`);
  assert.equal(png.readUInt32BE(20), 630, `Image height: ${path}`);
}

test('every canonical company page and its Danish mirror have unique search metadata and consistent sharing metadata', async () => {
  const titles = new Set();
  for (const path of mirrored) await assertSearchMetadata(path, titles);
  assert.ok(mirrored.includes('/da/cases/dansk-auto-logik/') && mirrored.includes('/da/products/workslip/'), 'Danish mirrors are checked');
});

test('every public page on disk is in the sitemap and has its own search and sharing metadata', async () => {
  const pages = await pagesOnDisk();
  assert.ok(pages.includes('/') && pages.includes('/da/'), 'The scan starts at the site root');
  assert.equal(pages.some(path => nonSite.test(path)), false);
  const listed = await sitemapPaths();
  const titles = new Set();
  for (const path of pages) {
    // A page that asks search engines not to index it stays out of the sitemap.
    if (/noindex/i.test((await page(path)).meta('robots') ?? '')) continue;
    assert.ok(listed.has(path), `Public page missing from the sitemap. Add ${english(path)} to data/links.json: ${path}`);
    await assertSearchMetadata(path, titles);
  }
});

test('the website and products identify the same publisher without invented prices or ratings', async () => {
  const home = await page('/');
  const company = home.structured.find(item => item['@type'] === 'Organization');
  assert.equal(company['@id'], organization);
  assert.equal(home.structured.find(item => item['@type'] === 'WebSite')?.publisher?.['@id'], organization);
  for (const product of ['workslip', 'tradey', 'shippy', 'producey', 'roady', 'greeny']) {
    const path = `/products/${product}/`;
    const { title, meta, structured } = await page(path);
    assert.ok(title.length > `${product} | MR Software`.length + 10, `Explain the product in its title: ${product}`);
    const app = structured.find(item => item['@type'] === 'SoftwareApplication');
    assert.ok(app, `Software description: ${product}`);
    assert.equal(app.url, origin + path);
    assert.equal(app.description, meta('description'));
    assert.equal(app.publisher['@id'], organization);
    assert.equal(app.applicationCategory, 'BusinessApplication');
    assert.equal(app.offers, undefined);
    assert.equal(app.aggregateRating, undefined);
    const breadcrumb = structured.find(item => item['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement[0].item, origin + '/');
    assert.equal(breadcrumb.itemListElement.at(-1).item, origin + path);
  }
});

test('homepage links describe their destination instead of generic read-more text', async () => {
  const { document } = await page('/');
  for (const link of elements(document, 'a')) {
    const label = text(link).replace(/[→\s]+/g, ' ').trim();
    assert.doesNotMatch(label, /^(read more|learn more|click here|here|more)$/i, attribute(link, 'href'));
  }
});

test('English and Danish homepages have reciprocal language alternatives and their own canonical address', async () => {
  for (const [path, language] of [['/', 'en'], ['/da/', 'da']]) {
    const { document, structured } = await page(path);
    assert.equal(attribute(elements(document, 'html')[0], 'lang'), language);
    const alternatives = elements(document, 'link').filter(node => attribute(node, 'rel') === 'alternate');
    assert.deepEqual(Object.fromEntries(alternatives.map(node => [attribute(node, 'hreflang'), attribute(node, 'href')])), {
      en: origin + '/', da: origin + '/da/', 'x-default': origin + '/',
    });
    assert.equal(attribute(elements(document, 'link').find(node => attribute(node, 'rel') === 'canonical'), 'href'), origin + path);
    const selector = elements(document, 'a').find(node => attribute(node, 'hreflang') === (language === 'en' ? 'da' : 'en'));
    assert.equal(attribute(selector, 'href'), language === 'en' ? '/da/' : '/');
    if (language === 'da') assert.equal(structured.find(item => ['WebPage', 'WebSite'].includes(item['@type']))?.inLanguage, 'da');
  }
  assert.ok(catalogue.places.some(place => place.href === '/da/'), 'The Danish homepage is registered for the sitemap');
});

test('research describes the two visible proposals and links their actual public documents', async () => {
  const { document, structured } = await page('/research/');
  const collection = structured.find(item => item['@type'] === 'CollectionPage');
  assert.ok(collection);
  assert.equal(collection.publisher['@id'], organization);
  const visible = elements(document, 'a').map(node => attribute(node, 'href')).filter(href => href?.endsWith('.pdf'));
  assert.deepEqual(collection.hasPart.map(item => new URL(item.url).pathname).sort(), visible.sort());
  for (const item of collection.hasPart) {
    assert.equal(item['@type'], 'CreativeWork');
    assert.equal(item.inLanguage, 'da');
    assert.match(item.description, /proposal/i);
    assert.equal(new URL(item.url).origin, origin);
    assert.ok((await readFile(new URL('..' + new URL(item.url).pathname, import.meta.url))).subarray(0, 5).equals(Buffer.from('%PDF-')));
  }
});
