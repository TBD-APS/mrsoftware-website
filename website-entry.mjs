import { initialCatalog } from './commercial/shared/catalog.mjs';

const demoRoutes = {
  '/demos': '/',
  '/demos/workslip': '/workslip/jobs/ws-1042/',
  '/demos/tradey': '/tradey/offers/offer-1048/',
  '/demos/shippy': '/shippy/shipments/shp-2048/',
};
const products = new Set(['workslip', 'tradey', 'shippy']);

export function publicCommercialEntry(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'mrsoftware.dk') return null;
  const pathname = url.pathname.replace(/\/$/, '');
  const pricing = /^\/pricing(?:\/(workslip|tradey|shippy))?$/.exec(pathname);
  if (!Object.hasOwn(demoRoutes, pathname) && !pricing) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const target = new URL(pricing ? '/pricing/' : demoRoutes[pathname], 'https://demos.mrsoftware.dk');
  if (pricing) {
    const product = pricing[1] ?? url.searchParams.get('product');
    if (products.has(product)) {
      target.searchParams.set('product', product);
      const packageId = url.searchParams.get('package');
      if (initialCatalog.packages.some(item => item.id === packageId && item.product === product)) target.searchParams.set('package', packageId);
    }
  }
  return new Response(null, { status: 307, headers: { Location: target.href, 'Cache-Control': 'no-cache' } });
}

export function withCommercialEntry(handler) {
  return (request, env, context) => publicCommercialEntry(request) ?? handler(request, env, context);
}
