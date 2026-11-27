import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function dependencyGraph(directory, entries) {
  const pending = [...entries], found = new Set();
  while (pending.length) {
    const pathname = pending.pop();
    if (found.has(pathname)) continue;
    const filename = path.resolve(directory, '.' + pathname);
    if (!filename.startsWith(path.resolve(directory) + path.sep)) throw Error('Asset dependency leaves the build directory');
    const source = await readFile(filename, 'utf8');
    found.add(pathname);
    const references = [];
    if (pathname.endsWith('.html')) {
      for (const [tag] of source.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
        const reference = /\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/i.exec(tag);
        if (reference) references.push(reference[1] ?? reference[2] ?? reference[3]);
      }
    } else if (/\.m?js$/.test(pathname)) {
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) references.push(match[1]);
    } else if (pathname.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) references.push(match[1]);
    } else if (pathname.endsWith('.webmanifest')) {
      references.push(...JSON.parse(source).icons.map(icon => icon.src));
    }
    for (const reference of references) {
      const url = new URL(reference, 'https://build.example' + pathname);
      if (url.origin === 'https://build.example' && !reference.startsWith('#')) pending.push(url.pathname);
    }
  }
  return found;
}

export async function writeCommercialAssetPolicy(directory, output) {
  const files = (await readdir(directory, { recursive: true })).map(file => '/' + file.split(path.sep).join('/'));
  const publicPages = files.filter(file => file.endsWith('.html') && !file.startsWith('/backoffice/'));
  const privatePages = files.filter(file => file.endsWith('.html') && file.startsWith('/backoffice/'));
  const publicAssets = await dependencyGraph(directory, publicPages);
  const privateAssets = await dependencyGraph(directory, privatePages);
  const protectedAssets = [...privateAssets].filter(file => !publicAssets.has(file)).sort();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ protectedAssets }, null, 2) + '\n');
}
