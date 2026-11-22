import { escapeHtml, isPageAddress } from '../js/linking.js';
import { publicCommercialEntry } from '../website-entry.mjs';

export const prefix = '/_development/';
const publicOrigin = 'https://mrsoftware.dk';
const internalPaths = ['/qa/', '/dashboard', '/backoffice', '/_development/'];
const robots = `User-agent: *\nAllow: /\n${internalPaths.map(path => `Disallow: ${path}`).join('\n')}\n\nSitemap: ${publicOrigin}/sitemap.xml\n`;

function sitemap(catalogue) {
  const paths = [...catalogue.places.map(place => place.href), ...(catalogue.sitemapPages ?? [])];
  const urls = paths.filter(isPageAddress).map(path => {
    const url = new URL(path, publicOrigin);
    url.hash = '';
    return url;
  }).filter(url => !internalPaths.some(path => {
    const root = path.replace(/\/$/, '').toLowerCase();
    const pathname = url.pathname.toLowerCase().replace(/^\/da(?=\/)/, '');
    return pathname === root || pathname.startsWith(root + '/');
  })).filter(url => !publicCommercialEntry(new Request(url))).map(url => url.href);
  const english = [...new Set(urls.map(address => { const url = new URL(address); url.pathname = url.pathname.replace(/^\/da(?=\/)/, ''); return url.href; }))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + english.map(address => {
      const danish = new URL(address); danish.pathname = '/da' + danish.pathname;
      const alternatives = `<xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(address)}"/><xhtml:link rel="alternate" hreflang="da" href="${escapeHtml(danish.href)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(address)}"/>`;
      return [address, danish.href].map(url => `  <url><loc>${escapeHtml(url)}</loc>${alternatives}</url>\n`).join('');
    }).join('')
    + '</urlset>\n';
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function hasFileExtension(pathname) {
  return pathname.slice(pathname.lastIndexOf('/') + 1).includes('.');
}

function wantsHtml(request) {
  const accept = request.headers.get('Accept');
  if (!accept) return true;
  return accept.includes('text/html') || accept.includes('*/*');
}

async function videoRange(request, response) {
  // Workers Static Assets returns full files for Range requests. Safari probes
  // the first two bytes before playback, so slice this small cached clip here.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!range || (!range[1] && !range[2])) return response;
  const ifRange = request.headers.get('If-Range');
  if (ifRange) {
    if (ifRange.startsWith('W/')) return response;
    const date = Date.parse(ifRange);
    const matches = ifRange.startsWith('"') ? ifRange === response.headers.get('ETag')
      : Number.isFinite(date) && date === Date.parse(response.headers.get('Last-Modified') ?? '');
    if (!matches) return response;
  }
  const first = range[1] ? Number(range[1]) : null;
  const last = range[2] ? Number(range[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))
    || (first !== null && last !== null && first > last)) return response;
  const bytes = await response.arrayBuffer();
  const start = first ?? Math.max(0, bytes.byteLength - last);
  const end = first === null || last === null ? bytes.byteLength - 1 : Math.min(last, bytes.byteLength - 1);
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  if (start >= bytes.byteLength || end < start) {
    headers.set('Content-Range', `bytes */${bytes.byteLength}`);
    headers.set('Content-Length', '0');
    headers.set('Cache-Control', 'no-store');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function publicAsset(request, env, url) {
  let response = await env.ASSETS.fetch(request);
  const workflowVideo = /^\/assets\/workflow\/workflow\.[a-f0-9]{12}\.mp4$/.test(url.pathname);
  if (workflowVideo && request.method === 'GET' && response.status === 200) response = await videoRange(request, response);
  // The asset binding supplies Cloudflare's edge cache and ETag. Only immutable,
  // content-addressed illustrations and workflow media get a long-lived browser cache.
  if (['GET', 'HEAD'].includes(request.method) && [200, 206, 304].includes(response.status)
    && (/^\/assets\/hero\/workflow-vector\.[a-f0-9]{12}\.svg$/.test(url.pathname)
      || /^\/assets\/workflow\/workflow\.[a-f0-9]{12}\.(?:mp4|webp)$/.test(url.pathname))) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (workflowVideo) headers.set('Accept-Ranges', 'bytes');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return response;
  if (url.pathname === '/404.html' || hasFileExtension(url.pathname) || !wantsHtml(request)) return response;
  const page = await env.ASSETS.fetch(new Request(new URL(url.pathname.startsWith('/da/') ? '/da/404.html' : '/404.html', url.origin), { method: 'GET' }));
  if (!page.ok) return response;
  const headers = new Headers(page.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Robots-Tag', 'noindex');
  headers.set('Cache-Control', 'no-store');
  return new Response(request.method === 'HEAD' ? null : page.body, { status: 404, headers });
}
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'none'",
};

export function createDashboardHandler({ files, verifyAccess }) {
  if (typeof verifyAccess !== 'function') throw new Error('An Access verifier is required');
  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      let body = robots;
      const isSitemap = url.pathname === '/sitemap.xml';
      if (isSitemap) {
        const response = await env.ASSETS.fetch(new Request(publicOrigin + '/data/links.json'));
        if (!response.ok) return new Response('Sitemap unavailable', { status: 503 });
        body = sitemap(await response.json());
      }
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'Content-Type': isSitemap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8' },
      });
    }
    if (url.pathname !== '/_development' && !url.pathname.startsWith(prefix)) return publicAsset(request, env, url);
    if (url.hostname !== 'dashboard.mrsoftware.dk') return new Response('Not found', { status: 404, headers: privateHeaders });
    if (!await verifyAccess(request)) return new Response('Dashboard sign-in required. Reload the dashboard to sign in.', { status: 401, headers: privateHeaders });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...privateHeaders, Allow: 'GET, HEAD' } });
    if (url.pathname === '/_development') {
      url.pathname += '/';
      return new Response(null, { status: 308, headers: { ...privateHeaders, Location: url.href } });
    }
    const name = url.pathname.slice(prefix.length) || 'index.html';
    if (!Object.hasOwn(files, name)) return new Response('Not found', { status: 404, headers: privateHeaders });
    const type = contentTypes[name.slice(name.lastIndexOf('.'))];
    return new Response(request.method === 'HEAD' ? null : files[name], { headers: { ...privateHeaders, 'Content-Type': type } });
  };
}
