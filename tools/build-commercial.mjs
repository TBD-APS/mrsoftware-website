import { build } from 'astro';
import QRCode from 'qrcode';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products, productRoutes, publicOrigin, recordRoutes } from '../commercial/src/data/scenarios.mjs';
import { writeCommercialAssetPolicy } from './commercial-asset-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'commercial/public');
const outputDir = path.join(root, '.commercial-dist');
const save = async (file, body) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body); };

// Small first-party letter icons, rendered as real RGBA PNGs at both PWA sizes.
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, crc]); }
function icon(product, size) {
  const letters = { workslip: ['10001','10001','10001','10101','10101','11011','10001'], tradey: ['11111','00100','00100','00100','00100','00100','00100'], shippy: ['01111','10000','10000','01110','00001','00001','11110'] };
  const image = Buffer.alloc((size * 4 + 1) * size); const unit = size / 12;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const col = Math.floor((x - size / 2 + unit * 2.5) / unit), row = Math.floor((y - size / 2 + unit * 3.5) / unit);
    const light = letters[product][row]?.[col] === '1'; const at = y * (size * 4 + 1) + 1 + x * 4;
    image[at] = light ? 255 : 138; image[at + 1] = light ? 252 : 28; image[at + 2] = light ? 247 : 44; image[at + 3] = 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(image)), pngChunk('IEND', Buffer.alloc(0))]);
}
async function qr(product, name, target) {
  const url = publicOrigin + target;
  await save(path.join(publicDir, product, 'qr', `${name}.svg`), await QRCode.toString(url, { type: 'svg', width: 256, margin: 4, errorCorrectionLevel: 'M' }));
  await save(path.join(publicDir, product, 'qr', `${name}.png`), await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 4, errorCorrectionLevel: 'M' }));
}
async function generatePublicAssets() {
  await cp(path.join(root, 'assets/fonts'), path.join(publicDir, 'assets/fonts'), { recursive: true });
  for (const name of ['fragment-mono-OFL.txt', 'geist-OFL.txt', 'newsreader-OFL.txt']) {
    const file = path.join(publicDir, 'assets/fonts', name);
    await writeFile(file, (await readFile(file, 'utf8')).replace(/[ \t]+$/gm, ''));
  }
  await mkdir(path.join(publicDir, 'assets/brand'), { recursive: true });
  for (const name of ['mr-mark.svg', 'favicon.svg']) await cp(path.join(root, 'assets/images/brand', name), path.join(publicDir, 'assets/brand', name));
  for (const [product, item] of Object.entries(products)) {
    for (const size of [192, 512]) await save(path.join(publicDir, product, `icons/icon-${size}.png`), icon(product, size));
    await save(path.join(publicDir, product, 'manifest.webmanifest'), JSON.stringify({ id: `/${product}/`, name: `${item.name} demo`, short_name: `${item.name} demo`, description: 'A safe interactive example from MR Software.', lang: 'en', start_url: item.route, scope: `/${product}/`, display: 'standalone', background_color: '#fffcf7', theme_color: '#8a1c2c', icons: [192, 512].map(size => ({ src: `/${product}/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })) }, null, 2) + '\n');
    await qr(product, 'example', item.route);
  }
  await qr('workslip', 'mat-101', recordRoutes.material);
}
const privatePath = pathname => /(?:^|\/)backoffice(?:[./]|$)|^\/api(?:\/|$)/i.test(pathname);
const diskPath = (pathname, directory = outputDir) => path.join(directory, pathname.replace(/^\//, '') + (pathname.endsWith('/') ? 'index.html' : ''));
function localDependency(value, source) {
  if (!value || value.startsWith('data:') || value.startsWith('#')) return null;
  const url = new URL(value, 'https://assets.example' + source);
  if (url.origin !== 'https://assets.example') return null;
  if (privatePath(url.pathname)) throw new Error(`Public page depends on private asset ${url.pathname}`);
  return url.pathname;
}
// Dependency discovery in trusted build output, not an HTML sanitizer. HTML
// names are case-insensitive; values (including asset paths) retain their case.
function htmlAttribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\x60]+))`, 'i').exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] : null;
}
export async function publicDependencies(product, directory = outputDir) {
  const pending = [...productRoutes(product), `/${product}/manifest.webmanifest`];
  const found = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (found.has(current)) continue;
    if (privatePath(current)) throw new Error('A public precache cannot contain a private route.');
    const bytes = await readFile(diskPath(current, directory)); found.add(current);
    const source = bytes.toString('utf8'); const dependencies = [];
    if (current.endsWith('/')) {
      for (const match of source.matchAll(/<(script|img|link|a)\b[^>]*>/gi)) {
        const tag = match[0], kind = match[1].toLowerCase();
        if (kind === 'link' && !(htmlAttribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).some(value => ['stylesheet', 'preload', 'modulepreload', 'manifest', 'icon', 'apple-touch-icon'].includes(value))) continue;
        const attribute = htmlAttribute(tag, kind === 'link' || kind === 'a' ? 'href' : 'src');
        // Downloadable QR labels are part of the offline scenario too.
        if (kind === 'a' && (!/\sdownload(?:\s|=|\/?>)/i.test(tag) || !attribute?.endsWith('.png'))) continue;
        if (attribute) dependencies.push(attribute);
      }
    } else if (current.endsWith('.js') || current.endsWith('.mjs')) {
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) dependencies.push(match[1]);
    } else if (current.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) dependencies.push(match[1]);
    } else if (current.endsWith('.webmanifest')) {
      dependencies.push(...JSON.parse(source).icons.map(item => item.src));
    }
    for (const value of dependencies) { const dependency = localDependency(value, current); if (dependency) pending.push(dependency); }
  }
  return [...found].sort();
}
export async function generateServiceWorkers() {
  for (const product of Object.keys(products)) {
    const precache = await publicDependencies(product);
    const hash = createHash('sha256').update('public-generation-v2');
    for (const entry of precache) { hash.update(entry); hash.update(await readFile(diskPath(entry))); }
    const version = hash.digest('hex').slice(0, 16);
    await save(path.join(outputDir, product, 'sw.js'), `// Generated only from ${product}'s public page dependency graph.
const PREFIX = 'mrsoftware-${product}-';
const CACHE = PREFIX + '${version}';
const PRECACHE = ${JSON.stringify(precache)};
const ALLOWED = new Set(PRECACHE);
self.addEventListener('install', event => event.waitUntil((async () => {
  // Cache.addAll ignores Cache-Control. Check every response before writing any
  // entry, so a demo accidentally opened on a protected host cannot save it.
  const responses = await Promise.all(PRECACHE.map(async pathname => {
    const response = await fetch(pathname, { cache: 'reload' });
    if (!response.ok || response.redirected || response.type !== 'basic' || /(?:private|no-store)/i.test(response.headers.get('Cache-Control') || '')) throw new Error('Only public demo assets can be saved.');
    return [pathname, response];
  }));
  const cache = await caches.open(CACHE);
  await Promise.all(responses.map(([pathname, response]) => cache.put(pathname, response)));
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !ALLOWED.has(url.pathname) || /(?:^|\\/)backoffice(?:[./]|$)|^\\/api(?:\\/|$)/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(url.pathname);
    // Keep the shell and its hashed modules in their installed generation until
    // the visitor activates the waiting worker. A network-first navigation can
    // otherwise replace HTML with references this worker cannot save offline.
    if (saved) return saved;
    try {
      const response = await fetch(request);
      // An evicted shell may be fetched online, but another deployment's HTML
      // must never be promoted into this generation's fixed dependency list.
      if (!url.pathname.endsWith('/') && response.ok && !/(?:private|no-store)/i.test(response.headers.get('Cache-Control') || '')) await cache.put(url.pathname, response.clone());
      return response;
    } catch (error) { if (saved) return saved; throw error; }
  })());
});
`);
  }
}
export async function buildCommercial() {
  await generatePublicAssets();
  await build({ root, configFile: 'astro.commercial.config.mjs' });
  await generateServiceWorkers();
  await writeCommercialAssetPolicy(outputDir, path.join(root, '.local/commercial-asset-policy.json'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildCommercial();
