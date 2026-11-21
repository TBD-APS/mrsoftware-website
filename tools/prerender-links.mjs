import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { checkGraph, renderRelatedLinks } from '../js/linking.js';

// Render from the same catalogue and renderer as the editor and browser. Link
// cards must already be in the first HTML response, including without scripts.
export function renderLinkSlots(source, graph) {
  const updates = [];
  function visit(node) {
    const attributes = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    const from = attributes['data-related-from'];
    if (from !== undefined) {
      if (!graph.places.some(place => place.id === from)) throw new Error(`Unknown related-link source: ${from}`);
      const { startTag, endTag } = node.sourceCodeLocation ?? {};
      if (!startTag || !endTag) throw new Error(`Related-link slot needs a closing tag: ${from}`);
      updates.push({ start: startTag.endOffset, end: endTag.startOffset, html: renderRelatedLinks(graph, from, { heading: attributes['data-related-heading'] }) });
      return;
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(source, { sourceCodeLocationInfo: true }));
  for (const update of updates.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, update.start) + update.html + source.slice(update.end);
  }
  return source;
}

export async function publicLinkUpdates(root, graph) {
  const checked = checkGraph(graph);
  if (!checked.ok) throw new Error(checked.errors[0]);
  const directory = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const files = new Set([resolve(directory, 'tools/roadmap-report-template.html')]);
  for (const place of checked.graph.places) {
    if (!place.href.startsWith('/') || place.href.startsWith('//')) continue;
    const path = new URL(place.href, 'https://mrsoftware.dk').pathname;
    if (path.endsWith('/')) files.add(resolve(directory, `.${path}`, 'index.html'));
  }
  const updates = [];
  for (const file of files) {
    let source;
    try { source = await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const html = renderLinkSlots(source, checked.graph);
    if (html !== source) updates.push({ file, html });
  }
  return updates;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const { sitemapPages, ...graph } = JSON.parse(await readFile(new URL('../data/links.json', import.meta.url), 'utf8'));
  const updates = await publicLinkUpdates(root, graph);
  for (const { file, html } of updates) await writeFile(file, html);
  console.log(`Updated related links in ${updates.length} public HTML files.`);
}
