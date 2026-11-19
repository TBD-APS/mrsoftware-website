import { pathToFileURL } from 'node:url';
import { validateCatalog } from '../commercial/server/validation.mjs';

export const demoOrigin = 'https://demos.mrsoftware.dk';
export const backofficeOrigin = 'https://backoffice.mrsoftware.dk';

// GET-only: this is also the gate before the company site publishes its links.
export async function commercialReadiness(request = fetch) {
  const receipt = [];
  async function read(url, statuses = [200]) {
    const response = await request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    if (!statuses.includes(response.status) || (response.url && new URL(response.url).origin !== new URL(url).origin)) throw Error(`Commercial readiness failed for ${url} (HTTP ${response.status})`);
    receipt.push({ url, status: response.status });
    return response;
  }
  const catalogResponse = await read(demoOrigin + '/api/catalog');
  if (!catalogResponse.headers.get('Content-Type')?.includes('application/json')) throw Error('Public catalogue must return JSON');
  const { catalog } = await catalogResponse.json();
  if (catalog?.currency !== 'DKK') throw Error('Public catalogue currency is invalid');
  validateCatalog({ revision: catalog.revision, packages: catalog.packages, demos: catalog.demos });
  const dependencies = new Set();
  for (const pathname of ['/', '/pricing/', '/workslip/jobs/ws-1042/', '/tradey/offers/offer-1048/', '/shippy/shipments/shp-2048/']) {
    const response = await read(demoOrigin + pathname);
    const html = await response.text();
    if (!response.headers.get('Content-Type')?.includes('text/html') || !/<h1\b/i.test(html) || !html.includes('MR Software')) throw Error(`Public page is not the compiled application: ${pathname}`);
    for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      if (/^<link/i.test(tag) && !/\brel="stylesheet"/i.test(tag)) continue;
      const reference = /\b(?:src|href)="([^"]+)"/i.exec(tag)?.[1];
      if (!reference) continue;
      const url = new URL(reference, demoOrigin + pathname);
      // Cloudflare WebMCP adds this same-origin module after the compiled app leaves the Worker.
      const cloudflareBridge = /^<script\b/i.test(tag) && /\btype="module"/i.test(tag) && url.href === `${demoOrigin}/.webmcp/bridge.js`;
      if (url.origin !== demoOrigin || (!url.pathname.startsWith('/_astro/') && !cloudflareBridge)) throw Error('Public page has an unexpected application dependency');
      dependencies.add(url.href);
    }
  }
  if (!dependencies.size) throw Error('Compiled public application dependencies are missing');
  for (const url of dependencies) {
    const response = await read(url);
    if (!/(?:javascript|text\/css)/i.test(response.headers.get('Content-Type') ?? '') || !(await response.text()).trim()) throw Error('Compiled public application dependency is unavailable');
  }
  for (const product of ['workslip', 'tradey', 'shippy']) {
    const manifest = await (await read(`${demoOrigin}/${product}/manifest.webmanifest`)).json();
    if (manifest.id !== `/${product}/` || manifest.scope !== `/${product}/` || !manifest.start_url?.startsWith(`/${product}/`)) throw Error('Public demo manifest is invalid');
  }
  await read(demoOrigin + '/backoffice/', [404]);
  for (const pathname of ['/', '/backoffice/', '/api/backoffice/state']) {
    const response = await read(backofficeOrigin + pathname, [302, 303, 401, 403]);
    if (!/no-store/i.test(response.headers.get('Cache-Control') ?? '')) throw Error('Private denial must not be cached');
    if ([302, 303].includes(response.status)) {
      const login = new URL(response.headers.get('Location'), backofficeOrigin);
      if (login.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(login.hostname) || !login.pathname.startsWith('/cdn-cgi/access/login/backoffice.mrsoftware.dk') || login.username || login.password) throw Error('Private sign-in redirect is not Cloudflare Access');
      if (login.searchParams.has('redirect_url') && new URL(login.searchParams.get('redirect_url'), backofficeOrigin).origin !== backofficeOrigin) throw Error('Private sign-in has a wrong-host return address');
    }
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  commercialReadiness().then(result => console.log(`Commercial readiness verified (${result.length} read-only checks)`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
