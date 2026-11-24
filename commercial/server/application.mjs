import { accessVerifier, identitySettings, validIdentity } from './identity.mjs';
import { createStore } from './store.mjs';
import { HttpError, cvrNumber, readJson, recordId, validateCatalog, validateCustomer, validateEnquiry, validateLeadProduct, validateLeadSearch, validateOpportunity, validateQuote, validateQuoteUpdate, validateTodayQuery } from './validation.mjs';
import { cvrClientFromEnv } from './cvr.mjs';
import { municipalityCodes } from './lead-scoring.mjs';
import { byScore, toLead, usableCompany } from './leads.mjs';

const productionIdentity = accessVerifier();
const notFound = () => { throw new HttpError(404, 'Page or record was not found.'); };
const methodNotAllowed = () => { throw new HttpError(405, 'This request method is not supported.'); };
const configuredHost = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

function protectedResponse(response, head = false) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(head ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body, status = 200) {
  return protectedResponse(Response.json(body, { status }));
}

function requireJsonWrite(request, url) {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (request.headers.get('Origin') !== url.origin || contentType !== 'application/json' || request.headers.get('X-Requested-With') !== 'MRSoftware') throw new HttpError(403, 'Use a same-origin JSON request to save changes.');
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export function createApplication({ verifyIdentity = productionIdentity, cvrClient = cvrClientFromEnv } = {}) {
  return {
    async fetch(request, env = {}) {
      try {
        const url = new URL(request.url);
        let path;
        try { path = decodeURIComponent(url.pathname); } catch { notFound(); }
        const privatePath = /^\/(?:api\/backoffice(?:\/|$)|backoffice(?:[/.]|$))/i.test(path);
        const privateHost = configuredHost(env.BACKOFFICE_HOST);
        const demoHost = configuredHost(env.DEMO_HOST);
        const onPrivateHost = Boolean(privateHost) && url.host === privateHost;
        const onDemoHost = Boolean(demoHost) && url.host === demoHost;
        if ((!onPrivateHost && !onDemoHost) || (privatePath && !onPrivateHost)) notFound();

        let actor;
        if (onPrivateHost) {
          const settings = identitySettings(env);
          if (!settings) throw new HttpError(401, 'Sign in with an authorized account.');
          let identity;
          try { identity = await verifyIdentity(request, env); } catch { identity = null; }
          if (!validIdentity(identity)) throw new HttpError(401, 'Sign in with an authorized account.');
          const email = identity.email.toLowerCase();
          if (!settings.allowedEmails.has(email)) throw new HttpError(403, 'This account cannot access the sales workspace.');
          actor = { sub: identity.sub, email };
        }

        if (path === '/api/catalog') {
          if (request.method !== 'GET') methodNotAllowed();
          return json({ catalog: await createStore(env.DB).catalog() });
        }

        if (path === '/api/enquiries') {
          if (request.method !== 'POST') methodNotAllowed();
          if (!onDemoHost) notFound();
          requireJsonWrite(request, url);
          const input = validateEnquiry(await readJson(request));
          const result = await createStore(env.DB).createEnquiry(input, request.headers.get('CF-Connecting-IP'));
          return json(result.receipt, result.created ? 201 : 200);
        }

        if (path === '/api/backoffice/session') {
          if (request.method !== 'GET') methodNotAllowed();
          return json({ email: actor.email });
        }

        if (path === '/api/backoffice/state') {
          if (request.method !== 'GET') methodNotAllowed();
          return json(await createStore(env.DB).state());
        }

        if (path === '/api/backoffice/today') {
          if (request.method !== 'GET') methodNotAllowed();
          const query = validateTodayQuery(url.searchParams);
          return json(await createStore(env.DB).today(query));
        }

        if (path === '/api/backoffice/catalog') {
          if (request.method !== 'PUT') methodNotAllowed();
          requireJsonWrite(request, url);
          const input = validateCatalog(await readJson(request));
          return json({ catalog: await createStore(env.DB).updateCatalog(input, actor) });
        }

        if (path === '/api/backoffice/leads') {
          if (request.method !== 'GET') methodNotAllowed();
          const search = validateLeadSearch(url.searchParams);
          const companies = await cvrClient(env).search({ codes: search.codes, municipalityCodes: municipalityCodes(search.regions, search.municipalities), sizes: search.sizes, limit: 100 });
          const store = createStore(env.DB);
          const saved = await store.customersByCvr(companies.map(company => company.cvr));
          const today = isoToday();
          const results = companies.map(company => toLead(company, search.product, saved.get(company.cvr), today)).sort(byScore);
          await store.recordLeadSearch({ ...search, count: results.length }, actor);
          return json({ results, search });
        }

        const leadDetail = /^\/api\/backoffice\/leads\/(\d{8})$/.exec(path);
        if (leadDetail) {
          if (request.method !== 'GET') methodNotAllowed();
          const product = validateLeadProduct(url.searchParams);
          const cvr = cvrNumber(leadDetail[1]);
          const company = await cvrClient(env).company(cvr);
          if (!usableCompany(company)) throw new HttpError(404, 'Company was not found in the register.');
          const saved = await createStore(env.DB).customersByCvr([cvr]);
          return json({ lead: toLead(company, product, saved.get(cvr), isoToday()) });
        }

        const records = /^\/api\/backoffice\/(customers|opportunities|quotes)(?:\/([^/]+))?$/.exec(path);
        if (records) {
          const [, kind, rawId] = records;
          const store = () => createStore(env.DB);
          if (rawId) {
            let id;
            try { id = recordId(rawId); } catch { notFound(); }
            if (request.method === 'GET') return json({ item: await store().get(kind, id) });
            if (request.method !== 'PUT') methodNotAllowed();
            requireJsonWrite(request, url);
            const validate = { customers: validateCustomer, opportunities: validateOpportunity, quotes: validateQuoteUpdate }[kind];
            const input = validate(await readJson(request), true);
            return json({ item: await store().update(kind, id, input, actor) });
          }
          if (request.method !== 'POST') methodNotAllowed();
          requireJsonWrite(request, url);
          const input = await readJson(request);
          if (kind === 'customers') return json({ item: await store().createCustomer(validateCustomer(input), actor) }, 201);
          if (kind === 'opportunities') return json({ item: await store().createOpportunity(validateOpportunity(input), actor) }, 201);
          return json({ item: await store().createQuote(validateQuote(input), actor) }, 201);
        }

        if (/^\/api(?:\/|$)/i.test(path)) notFound();
        if (!['GET', 'HEAD'].includes(request.method)) methodNotAllowed();
        if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') throw new HttpError(503, 'Site assets are unavailable. Please try again later.');
        const response = await env.ASSETS.fetch(request);
        if (onPrivateHost) return protectedResponse(response, request.method === 'HEAD');
        return request.method === 'HEAD' ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers }) : response;
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 503;
        const response = json({ error: error instanceof HttpError ? error.message : 'Sales storage is unavailable. Please try again later.' }, status);
        if (status === 429) response.headers.set('Retry-After', '3600');
        return request.method === 'HEAD' ? protectedResponse(response, true) : response;
      }
    },
  };
}
