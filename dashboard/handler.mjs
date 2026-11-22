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
    const pathname = url.pathname.toLowerCase();
    return pathname === root || pathname.startsWith(root + '/');
  })).filter(url => !publicCommercialEntry(new Request(url))).map(url => url.href);
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + [...new Set(urls)].map(url => `  <url><loc>${escapeHtml(url)}</loc></url>\n`).join('')
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

async function publicAsset(request, env, url) {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return response;
  if (url.pathname === '/404.html' || hasFileExtension(url.pathname) || !wantsHtml(request)) return response;
  const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin), { method: 'GET' }));
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
