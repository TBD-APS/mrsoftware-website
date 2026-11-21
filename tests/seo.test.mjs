import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'parse5';
import { publicCommercialEntry } from '../website-entry.mjs';

const origin = 'https://mrsoftware.dk';
const organization = `${origin}/#organization`;
const catalogue = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
const paths = [...new Set([...catalogue.places.map(place => place.href), ...catalogue.sitemapPages]
  .map(path => new URL(path, origin)).filter(url => url.origin === origin)
  .map(url => url.pathname))].filter(path => !/^\/(?:qa|dashboard|backoffice|_development)(?:\/|$)/i.test(path)
    && !publicCommercialEntry(new Request(origin + path)));
const elements = (node, tag) => [...(node.tagName === tag ? [node] : []), ...(node.childNodes ?? []).flatMap(child => elements(child, tag))];
const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const text = node => (node.value ?? '') + (node.childNodes ?? []).map(text).join('');
async function page(path) {
  // The report renderer inserts its body into this same checked-in head.
  const source = path === '/roadmap/report/' ? '../tools/roadmap-report-template.html' : `..${path}index.html`;
  const document = parse(await readFile(new URL(source, import.meta.url), 'utf8'));
  const meta = name => attribute(elements(document, 'meta').find(node => attribute(node, 'name') === name || attribute(node, 'property') === name), 'content');
  const structured = elements(document, 'script').filter(node => attribute(node, 'type') === 'application/ld+json')
    .flatMap(node => { const value = JSON.parse(text(node)); return value['@graph'] ?? [value]; });
  return { document, meta, structured, title: text(elements(document, 'title')[0]) };
}

test('every canonical company page has unique search metadata and consistent sharing metadata', async () => {
  const titles = new Set();
  for (const path of paths) {
    const { document, title, meta } = await page(path);
    assert.ok(title.trim(), path);
    assert.equal(titles.has(title), false, `Duplicate title: ${path}`);
    titles.add(title);
    assert.ok(meta('description')?.trim(), `Description: ${path}`);
    assert.equal(meta('og:title'), title, `Sharing title: ${path}`);
    assert.ok(meta('og:description')?.trim(), `Sharing description: ${path}`);
    assert.ok(meta('twitter:description')?.trim(), `Twitter description: ${path}`);
    assert.equal(meta('og:url'), origin + path, `Sharing URL: ${path}`);
    const canonicals = elements(document, 'link').filter(node => attribute(node, 'rel') === 'canonical');
    assert.equal(canonicals.length, 1, `Canonical count: ${path}`);
    assert.equal(attribute(canonicals[0], 'href'), origin + path, `Canonical: ${path}`);
    assert.equal(meta('twitter:card'), 'summary_large_image', path);
    const image = meta('og:image');
    assert.equal(meta('twitter:image'), image, `Sharing image: ${path}`);
    assert.equal(new URL(image).origin, origin, path);
    const png = await readFile(new URL('..' + new URL(image).pathname, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1200, `Image width: ${path}`);
    assert.equal(png.readUInt32BE(20), 630, `Image height: ${path}`);
  }
});

test('the website and products identify the same publisher without invented prices or ratings', async () => {
  const home = await page('/');
  const company = home.structured.find(item => item['@type'] === 'Organization');
  assert.equal(company['@id'], organization);
  assert.equal(home.structured.find(item => item['@type'] === 'WebSite')?.publisher?.['@id'], organization);
  for (const product of ['workslip', 'tradey', 'shippy']) {
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
