import { readdir, readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createApplication } from '../../commercial/server/application.mjs';
import { fixtureCvrClient } from './cvr-fixture.mjs';
import { fixtureFirecrawlClient } from './firecrawl-fixture.mjs';

export const commercialSettings = {
  DEMO_HOST: 'demo.mrsoftware.dk',
  BACKOFFICE_HOST: 'backoffice.mrsoftware.dk',
  ACCESS_ISSUER: 'https://synthetic.cloudflareaccess.com',
  ACCESS_AUDIENCE: 'synthetic-commercial-audience',
  ALLOWED_EMAILS: 'william@example.test',
  FIRECRAWL_API_KEY: 'synthetic-firecrawl-key',
  FIRECRAWL_MONTHLY_CREDITS: '100',
};

export const customerInput = { name: "Example O'Brien Ltd", contacts: [{ name: 'William', email: 'william@example.test', phone: '+45 12345678' }], notes: 'Synthetic customer only.' };
export const enquiryInput = (overrides = {}) => ({ requestId: crypto.randomUUID(), company: 'Example Company', name: 'Synthetic Prospect', email: 'prospect@example.test', product: 'workslip', packageId: 'workslip-core', message: 'Please contact us.', website: '', ...overrides });
export const opportunityInput = (customerId, overrides = {}) => ({ customerId, title: 'Workslip evaluation', product: 'workslip', stage: 'demo', nextFollowUp: '2030-11-20', notes: 'Synthetic follow-up.', ...overrides });
export const quoteInput = (customerId, overrides = {}) => ({ customerId, packageId: 'workslip-core', setupMinor: 0, validUntil: '2030-12-31', notes: '', ...overrides });

// Identity substitution exists only in the harness. Production has no env switch.
export async function createCommercialHarness(t, { verifyIdentity = async request => request.headers.get('Cf-Access-Jwt-Assertion') === 'synthetic-owner' ? { sub: 'synthetic-owner', email: 'william@example.test' } : null, cvrClient = fixtureCvrClient(), firecrawlClient = fixtureFirecrawlClient(), inspectYouTube, mediaProvider, clock = () => new Date() } = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("Local D1 test harness"); } };',
    compatibilityDate: '2026-10-23',
    d1Databases: ['DB'],
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../../commercial/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = (await readFile(new URL(file, migrations), 'utf8')).replace(/^--.*$/gm, '');
    const statements = sql.split(';').map(part => part.trim()).filter(Boolean);
    if (statements.length) await db.batch(statements.map(statement => db.prepare(statement)));
  }
  const app = createApplication({ verifyIdentity, cvrClient, firecrawlClient, inspectYouTube, mediaProvider, clock });
  const env = { ...commercialSettings, DB: db, ASSETS: { fetch: async request => new Response(`Static ${new URL(request.url).pathname}`, { headers: { 'Cache-Control': 'public, max-age=3600' } }) } };
  const request = (method, path, body, options = {}) => {
    const host = options.host ?? (path.startsWith('/api/backoffice') || path.startsWith('/backoffice') ? env.BACKOFFICE_HOST : env.DEMO_HOST);
    const headers = new Headers({ 'Cf-Access-Jwt-Assertion': 'synthetic-owner', 'CF-Connecting-IP': '203.0.113.8', ...options.headers });
    if (body !== undefined) {
      if (!headers.has('Origin')) headers.set('Origin', `https://${host}`);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'MRSoftware');
    }
    for (const header of options.omitHeaders ?? []) headers.delete(header);
    return app.fetch(new Request(`https://${host}${path}`, { method, headers, ...(body === undefined ? {} : { body: options.rawBody ?? JSON.stringify(body) }) }), { ...env, ...options.env });
  };
  const call = async (...args) => {
    const response = await request(...args);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const count = async table => (await db.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count;
  return { app, env, db, request, call, count, mf };
}
