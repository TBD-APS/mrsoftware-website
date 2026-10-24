export const prefix = '/_development/';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
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
    if (url.pathname !== '/_development' && !url.pathname.startsWith(prefix)) return env.ASSETS.fetch(request);
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
