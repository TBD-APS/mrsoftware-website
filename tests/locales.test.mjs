import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'parse5';

test('Danish case navigation stays in Danish beyond the homepage', async () => {
  const html = await readFile(new URL('../da/index.html', import.meta.url), 'utf8');
  for (const path of ['products/tradey/', 'products/shippy/', 'demo/roady/', 'products/producey/']) {
    assert.ok(html.includes(`href="/da/${path}"`), `Missing Danish case address: ${path}`);
  }
  const product = await readFile(new URL('../da/products/producey/index.html', import.meta.url), 'utf8');
  assert.match(product, /<html lang="da">/);
  const links = [];
  const visit = node => { if (node.tagName === 'a') links.push(Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]))); for (const child of node.childNodes ?? []) visit(child); };
  visit(parse(product));
  assert.ok(links.some(link => link.hreflang === 'en' && link.href === '/products/producey/'));
});

import { fileURLToPath } from 'node:url';
import { buildLocales, publicSources } from '../tools/build-locales.mjs';
import { englishLanguageLinks, localizeLink, translateHtml } from '../tools/locales.mjs';
import { graph as danishGraph, commercialAddresses } from '../js/site-links.da.js';
import { checkGraph, renderRelatedLinks } from '../js/linking.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const nodes = source => {
  const result = [];
  const visit = node => { result.push(node); for (const child of node.childNodes ?? []) visit(child); };
  visit(parse(source));
  return result;
};
const attrs = node => Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

test('every public source has a complete static Danish page and reciprocal language metadata', async () => {
  const files = await publicSources(root);
  const pages = new Set(files.map(file => file === 'index.html' ? '/' : '/' + file.replace(/index\.html$/, '')));
  for (const file of files) {
    const address = file === 'index.html' ? '/' : '/' + file.replace(/index\.html$/, '');
    const en = nodes(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
    const da = nodes(await readFile(new URL('../da/' + file, import.meta.url), 'utf8'));
    assert.equal(attrs(da.find(node => node.tagName === 'html')).lang, 'da', file);
    for (const [tree, language, own, other] of [[en, 'en', address, '/da' + address], [da, 'da', '/da' + address, address]]) {
      const links = tree.filter(node => node.tagName === 'link').map(attrs);
      for (const [lang, href] of [['en', address], ['da', '/da' + address], ['x-default', address]]) {
        assert.equal(links.filter(link => link.rel === 'alternate' && link.hreflang === lang && link.href === 'https://mrsoftware.dk' + href).length, 1, `${file}: ${language}/${lang}`);
      }
      const canonical = links.find(link => link.rel === 'canonical');
      if (canonical) assert.equal(canonical.href, 'https://mrsoftware.dk' + own, file);
      assert.ok(tree.some(node => node.tagName === 'a' && attrs(node).class?.split(' ').includes('language-switch') && attrs(node).href === other), `${file}: language switch`);
    }
    // Source identifiers and numeric table cells must survive the translation.
    for (const script of en.filter(node => node.tagName === 'script')) assert.ok(attrs(script).src || attrs(script).type === 'application/ld+json', `${file}: keep public script labels in the shared locale catalogue`);
    const daIds = new Set(da.map(node => attrs(node).id).filter(Boolean));
    for (const id of en.map(node => attrs(node).id).filter(Boolean)) assert.ok(daIds.has(id), `${file}: lost ${id}`);
    const numericCells = tree => tree.filter(node => node.tagName === 'td').map(text).map(value => value.trim()).filter(value => /^\d+$/.test(value));
    assert.deepEqual(numericCells(da), numericCells(en), `${file}: changed counts`);
    for (const node of da.filter(node => node.tagName === 'a' && attrs(node).href)) {
      const link = attrs(node);
      const url = new URL(link.href, 'https://mrsoftware.dk/da' + address);
      if (url.origin === 'https://mrsoftware.dk' && pages.has(url.pathname)) assert.equal(link.hreflang, 'en', `${file}: English leak ${link.href}`);
    }
  }
  assert.deepEqual((await buildLocales(root, { check: true })).changed, [], 'Generated translations must be current and idempotent');
});

test('new untranslated copy fails with the exact page and text', () => {
  assert.throws(() => translateHtml('<html><body><h1>A new feature</h1></body></html>', {
    dictionary: {}, path: '/new-page/', pages: new Set(['/new-page/']),
  }), /Missing Danish translation on \/new-page\/: A new feature/);
});

test('translation escapes text and attributes while keeping identifiers, JSON and addresses valid', () => {
  const source = '<html lang="en"><head><title>New</title><script type="application/ld+json">{"@type":"WebPage","name":"New","url":"https://mrsoftware.dk/contact/"}</script></head><body><a id="contact" href="/contact/?from=case#main" aria-label="New">New</a><time>2026-11-22T09:28:34+00:00</time></body></html>';
  const html = translateHtml(source, { dictionary: { New: 'Ny <tekst> & "citat"' }, path: '/', pages: new Set(['/', '/contact/']) });
  const tree = nodes(html);
  assert.equal(text(tree.find(node => node.tagName === 'a')), 'Ny <tekst> & "citat"');
  const link = attrs(tree.find(node => node.tagName === 'a'));
  assert.equal(link.id, 'contact');
  assert.equal(link.href, '/da/contact/?from=case#main');
  assert.equal(link['aria-label'], 'Ny <tekst> & "citat"');
  assert.equal(tree.some(node => node.tagName === 'tekst'), false);
  const schema = JSON.parse(text(tree.find(node => node.tagName === 'script')));
  assert.equal(schema.name, 'Ny <tekst> & "citat"');
  assert.equal(schema.url, 'https://mrsoftware.dk/da/contact/');
  assert.equal(schema.inLanguage, 'da');
  assert.equal(text(tree.find(node => node.tagName === 'time')), '2026-11-22T09:28:34+00:00');
});

test('language metadata is stable for ordinary and standalone report HTML', () => {
  for (const source of ['<html><head><title>Report</title></head><body><main>Report</main></body></html>', '<!doctype html>\n<html><head>\n</head><body><div class="brand">Brand</div></body></html>']) {
    const generated = englishLanguageLinks(source, '/roadmap/report/roadmap.html');
    assert.equal(englishLanguageLinks(generated, '/roadmap/report/roadmap.html'), generated);
    assert.equal(nodes(generated).filter(node => attrs(node).class === 'language-switch').length, 1);
  }
});

test('local links retain query and section, and shared assets and external products keep their address', () => {
  const pages = new Set(['/', '/contact/', '/products/producey/']);
  assert.equal(localizeLink('../producey/?from=demo#availability', '/products/tradey/', pages), '/da/products/producey/?from=demo#availability');
  assert.equal(localizeLink('/assets/image.svg', '/', pages), '/assets/image.svg');
  assert.equal(localizeLink('https://greeny.mrsoftware.dk/', '/', pages), 'https://greeny.mrsoftware.dk/');
  assert.equal(localizeLink('https://mrsoftware.dk.example.com/contact/', '/', pages), 'https://mrsoftware.dk.example.com/contact/');
  assert.equal(localizeLink('https://MRSoftware.dk/contact/', '/', pages), 'https://mrsoftware.dk/da/contact/');
  assert.equal(localizeLink('#contact', '/', pages), '#contact');
});

test('the translated catalogue still renders related links and explicitly labels external English demos', () => {
  assert.equal(checkGraph(danishGraph).ok, true);
  const html = renderRelatedLinks(danishGraph, 'producey', { heading: 'Se også' });
  assert.ok(html.includes('/da/contact/'));
  assert.ok(html.includes('Se også'));
  for (const [path, target] of Object.entries(commercialAddresses)) {
    assert.ok(path.startsWith('/'));
    assert.equal(new URL(target).hostname, 'demos.mrsoftware.dk');
    assert.ok(danishGraph.places.find(place => place.href === path).title.endsWith('(engelsk)'));
  }
});

test('the coverage inventory includes newly added public HTML and excludes private/source folders', async t => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const directory = await mkdtemp(join(tmpdir(), 'website-locales-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const path of ['index.html', 'new-page.html', 'new-case/index.html', 'dashboard/index.html', 'qa/report.html', 'docs/example.html', 'da/index.html', '.local/private.html']) {
    const { dirname } = await import('node:path');
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), '<html></html>');
  }
  assert.deepEqual(await publicSources(directory), ['index.html', 'new-case/index.html', 'new-page.html']);
});
