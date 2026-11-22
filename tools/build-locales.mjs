import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { pageAddress, danishAddress, localizeLink, htmlStrings, englishLanguageLinks, languageLinks, translateHtml, normalizeEnglish, runtimeStrings, reportArticle } from './locales.mjs';
import { publicCommercialEntry } from '../website-entry.mjs';

const excluded = new Set(['da', 'assets', 'css', 'js', 'data', 'node_modules', 'dashboard', 'backoffice', 'qa', 'tools', 'tests', 'docs', 'commercial', 'vendor', 'migrations']);
function reportShell(source) {
  const article = reportArticle(source);
  return source.slice(0, article.startOffset) + '<article class="mr-content"></article>' + source.slice(article.endOffset);
}
export async function publicSources(root) {
  const files = [];
  async function visit(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || (!relative && excluded.has(entry.name))) continue;
      const file = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), file);
      else if (entry.name.endsWith('.html')) files.push(file);
    }
  }
  await visit(root);
  return files.sort();
}

export async function loadDanish(root) {
  const directory = join(root, 'data/locales');
  const dictionary = {};
  for (const file of (await readdir(directory)).filter(file => /^da-(?:core|governance|operations|extra|report|latest)\.json$/.test(file)).sort()) {
    const values = JSON.parse(await readFile(join(directory, file), 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'string' || !value.trim()) throw Error(`Empty Danish translation: ${key}`);
      if (Object.hasOwn(dictionary, key) && dictionary[key] !== value) throw Error(`Conflicting Danish translation: ${key}`);
      dictionary[key] = value;
    }
  }
  const headings = await readFile(join(directory, 'da-headings.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
  return { dictionary, headings };
}

export async function localeOutputs(root, { allowMissing = false } = {}) {
  const { dictionary, headings } = await loadDanish(root);
  const englishDemo = await readFile(join(root, 'data/locales/en-demo.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
  for (const [danish, english] of Object.entries(englishDemo)) if (!Object.hasOwn(dictionary, english)) dictionary[english] = dictionary[danish] ?? danish;
  const files = await publicSources(root);
  const pages = new Set(files.map(pageAddress));
  const reportAssets = await readdir(join(root, 'da/roadmap/report')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const asset of reportAssets) if (/\.(?:pdf|docx|xlsx|pptx|csv|svg|json)$/.test(asset)) pages.add('/roadmap/report/' + asset);
  const sources = new Map(await Promise.all(files.map(async file => [file, normalizeEnglish(await readFile(join(root, file), 'utf8'), englishDemo)])));
  const missing = new Map();
  for (const [file, source] of sources) for (const text of file === 'roadmap/report/roadmap.html' ? [] : htmlStrings(file === 'roadmap/report/index.html' ? reportShell(source) : source)) {
    if (!Object.hasOwn(dictionary, text)) {
      if (!missing.has(text)) missing.set(text, []);
      missing.get(text).push(file);
    }
  }
  for (const text of runtimeStrings) if (!Object.hasOwn(dictionary, text)) missing.set(text, ['js/site.js']);
  // Shared link data is translated too, including client-rendered related links.
  const catalogue = JSON.parse(await readFile(join(root, 'data/links.json'), 'utf8'));
  for (const place of catalogue.places) for (const key of ['title', 'summary']) if (place[key] && !Object.hasOwn(dictionary, place[key])) missing.set(place[key], ['data/links.json']);
  for (const links of Object.values(catalogue.links)) for (const link of links) if (link.label && !Object.hasOwn(dictionary, link.label)) missing.set(link.label, ['data/links.json']);
  if (missing.size) {
    if (allowMissing) return { missing: Object.fromEntries(missing), outputs: new Map(), pages: files };
    throw Error(`Missing ${missing.size} Danish translations:\n` + [...missing].map(([text, files]) => `${files[0]}: ${text}`).join('\n'));
  }
  const outputs = new Map();
  for (const [file, source] of sources) {
    const path = pageAddress(file);
    const english = englishLanguageLinks(source, path);
    outputs.set(file, english);
    let danish;
    if (file === 'roadmap/report/roadmap.html') {
      // The admitted renderer owns the Danish snapshot and document contents.
      danish = languageLinks(await readFile(join(root, 'da', file), 'utf8'), path, 'da');
    } else {
      danish = translateHtml(file === 'roadmap/report/index.html' ? reportShell(english) : english, { dictionary, path, pages, heading: headings[file] });
      if (file === 'roadmap/report/index.html') {
        const article = reportArticle(await readFile(join(root, 'da', file), 'utf8'));
        const target = reportArticle(danish);
        danish = danish.slice(0, target.startOffset) + article.html + danish.slice(target.endOffset);
      }
    }
    outputs.set('da/' + file, danish.replace(/[\t ]+$/gm, ''));
  }
  // Language navigation changes the HTML presentation, never the report snapshot.
  for (const directory of ['roadmap/report', 'da/roadmap/report']) {
    if (!outputs.has(directory + '/index.html')) continue;
    const receipt = JSON.parse(await readFile(join(root, directory, 'export-receipt.json'), 'utf8'));
    for (const name of ['index.html', 'roadmap.html']) {
      const content = outputs.get(directory + '/' + name);
      receipt.files[name] = { sha256: createHash('sha256').update(content).digest('hex'), bytes: Buffer.byteLength(content) };
    }
    outputs.set(directory + '/export-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  }
  const translate = value => dictionary[value] ?? value;
  const commercial = new Set(catalogue.places.filter(place => publicCommercialEntry(new Request(new URL(place.href, 'https://mrsoftware.dk')))).map(place => place.id));
  const graph = {
    places: catalogue.places.map(place => ({ ...place, title: translate(place.title) + (commercial.has(place.id) ? ' (engelsk)' : ''), ...(place.summary ? { summary: translate(place.summary) } : {}), href: commercial.has(place.id) ? place.href : localizeLink(place.href, '/', pages) })),
    links: Object.fromEntries(Object.entries(catalogue.links).map(([id, links]) => [id, links.map(link => ({ ...link, ...(link.label ? { label: translate(link.label) + (commercial.has(link.toId) ? ' (engelsk)' : '') } : {}) }))])),
  };
  const commercialAddresses = Object.fromEntries(catalogue.places.filter(place => commercial.has(place.id)).map(place => [place.href, localizeLink(place.href, '/', pages)]));
  outputs.set('js/site-links.da.js', '// Generated by npm run build:locales from the shared link catalogue.\nexport const graph = ' + JSON.stringify(graph, null, 2) + ';\nexport const commercialAddresses = ' + JSON.stringify(commercialAddresses, null, 2) + ';\n');
  outputs.set('js/site-locale.da.js', '// Generated Danish labels used by the shared public scripts.\nwindow.MR_SOFTWARE_TRANSLATIONS = ' + JSON.stringify(Object.fromEntries(runtimeStrings.map(text => [text, dictionary[text]])), null, 2) + ';\n');
  outputs.set('data/locales/pages.json', JSON.stringify(files.map(file => ({ source: file, en: pageAddress(file), da: danishAddress(pageAddress(file)) })), null, 2) + '\n');
  return { outputs, pages: files, missing: {} };
}

export async function buildLocales(root, { check = false, allowMissing = false } = {}) {
  const result = await localeOutputs(root, { allowMissing });
  const changed = [];
  for (const [file, content] of result.outputs) {
    const previous = await readFile(join(root, file), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (previous === content) continue;
    changed.push(file);
    if (!check) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), content); }
  }
  return { changed, pages: result.pages, missing: result.missing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (process.argv.includes('--missing')) {
    const result = await buildLocales(root, { allowMissing: true, check: true });
    console.log(JSON.stringify(result.missing, null, 2));
  } else {
    const result = await buildLocales(root, { check: process.argv.includes('--check') });
    if (process.argv.includes('--check') && result.changed.length) throw Error('Regenerate translated pages with npm run build:locales: ' + result.changed.join(', '));
    console.log(`Danish: ${result.pages.length} public pages; ${result.changed.length} files ${process.argv.includes('--check') ? 'stale' : 'updated'}.`);
  }
}
