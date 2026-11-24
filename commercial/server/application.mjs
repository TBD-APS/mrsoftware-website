import { accessVerifier, identitySettings, validIdentity } from './identity.mjs';
import { createStore } from './store.mjs';
import { HttpError, cvrNumber, readJson, recordId, validateCatalog, validateCustomer, validateEnquiry, validateLeadProduct, validateLeadSave, validateLeadSearch, validateOpportunity, validateQuote, validateQuoteUpdate, validateTodayQuery } from './validation.mjs';
import { cvrClientFromEnv } from './cvr.mjs';
import { municipalityCodes } from './lead-scoring.mjs';
import { byScore, toLead, usableCompany } from './leads.mjs';
import { employeeBands, leadPresets } from '../shared/lead-presets.mjs';
import { toCsv } from './csv.mjs';

const productionIdentity = accessVerifier();
const companyOrigin = 'https://mrsoftware.dk';
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

function requireJsonWrite(request, url, origin = url.origin) {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (request.headers.get('Origin') !== origin || contentType !== 'application/json' || request.headers.get('X-Requested-With') !== 'MRSoftware') throw new HttpError(403, 'Use a same-origin JSON request to save changes.');
}

// The company site may post one public enquiry. Every other route stays same-origin,
// and this response must not keep Cross-Origin-Resource-Policy: same-origin.
function companyEnquiryCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', companyOrigin);
  headers.set('Vary', 'Origin');
  headers.delete('Cross-Origin-Resource-Policy');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function allowCompanyEnquiry(request, response) {
  let path = '';
  try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return response; }
  return path === '/api/enquiries' && request.method === 'POST' && request.headers.get('Origin') === companyOrigin
    ? companyEnquiryCors(response) : response;
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const bandLabels = new Map(employeeBands.map(band => [band.code, band.label]));
const productLabels = { workslip: 'Workslip', tradey: 'Tradey', shippy: 'Shippy' };
const titleCase = text => text ? text[0].toUpperCase() + text.slice(1) : '';

function csvResponse(kind, body) {
  return protectedResponse(new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${isoToday()}.csv"` } }));
}

const leadColumns = [
  ['Company', lead => lead.name], ['CVR', lead => lead.cvr], ['Industry code', lead => lead.industryCode], ['Industry', lead => lead.industryText],
  ['Employees', lead => bandLabels.get(lead.employees) ?? ''], ['Address', lead => lead.address], ['Postcode', lead => lead.postcode], ['City', lead => lead.city],
  ['Website', lead => lead.website], ['Phone', lead => lead.phone], ['Score', lead => lead.score], ['Reason', lead => lead.reason], ['LinkedIn search', lead => lead.linkedinUrl],
].map(([header, value]) => ({ header, value }));

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
          if (!onDemoHost) notFound();
          if (request.method === 'OPTIONS') {
            if (request.headers.get('Origin') === companyOrigin && request.headers.get('Access-Control-Request-Method') === 'POST') {
              return new Response(null, { status: 204, headers: {
                'Access-Control-Allow-Origin': companyOrigin,
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
                'Vary': 'Origin',
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
              } });
            }
            methodNotAllowed();
          }
          if (request.method !== 'POST') methodNotAllowed();
          const fromCompany = request.headers.get('Origin') === companyOrigin;
          requireJsonWrite(request, url, fromCompany ? companyOrigin : url.origin);
          const input = validateEnquiry(await readJson(request));
          const result = await createStore(env.DB).createEnquiry(input, request.headers.get('CF-Connecting-IP'));
          const response = json(result.receipt, result.created ? 201 : 200);
          return fromCompany ? companyEnquiryCors(response) : response;
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

        // Downloads as CSV for Excel. leads.csv runs the search again, with the same rules as the
        // screen; customers.csv and opportunities.csv hold up to 5,000 records each. Private notes
        // stay out of the files. Each download is recorded with its kind and row count.
        if (path === '/api/backoffice/leads.csv') {
          if (request.method !== 'GET') methodNotAllowed();
          const search = validateLeadSearch(url.searchParams);
          const found = await cvrClient(env).search({ codes: search.codes, municipalityCodes: municipalityCodes(search.regions, search.municipalities), sizes: search.sizes, limit: 100, preset: leadPresets[search.product] });
          const store = createStore(env.DB);
          const companies = found.companies.filter(usableCompany);
          const saved = await store.customersByCvr(companies.map(company => company.cvr));
          const today = isoToday();
          const leads = companies.map(company => toLead(company, search.product, saved.get(company.cvr), today)).sort(byScore);
          await store.recordExport({ kind: 'leads', count: leads.length }, actor);
          return csvResponse('leads', toCsv(leadColumns, leads));
        }

        if (path === '/api/backoffice/customers.csv' || path === '/api/backoffice/opportunities.csv') {
          if (request.method !== 'GET') methodNotAllowed();
          const kind = path.includes('customers') ? 'customers' : 'opportunities';
          const store = createStore(env.DB);
          const link = (view, id) => `https://${configuredHost(env.BACKOFFICE_HOST)}/backoffice/?view=${view}&id=${id}`;
          const customers = await store.exportRows('customers');
          let body, count;
          if (kind === 'customers') {
            const names = customer => customer.contacts.map(contact => contact.name).filter(Boolean).join(', ');
            body = toCsv([
              ['Company', customer => customer.name], ['CVR', customer => customer.cvr ?? ''], ['Contact names', names],
              ['Contact emails', customer => customer.contacts.map(contact => contact.email).filter(Boolean).join(', ')],
              ['Contact phones', customer => customer.contacts.map(contact => contact.phone).filter(Boolean).join(', ')],
              ['Record link', customer => link('customer', customer.id)],
            ].map(([header, value]) => ({ header, value })), customers);
            count = customers.length;
          } else {
            const opportunities = await store.exportRows('opportunities');
            const company = new Map(customers.map(customer => [customer.id, customer.name]));
            body = toCsv([
              ['Title', item => item.title], ['Company', item => company.get(item.customerId) ?? ''], ['Product', item => productLabels[item.product] ?? item.product],
              ['Stage', item => titleCase(item.stage)], ['Next follow-up', item => item.nextFollowUp ?? ''], ['Record link', item => link('opportunity', item.id)],
            ].map(([header, value]) => ({ header, value })), opportunities);
            count = opportunities.length;
          }
          await store.recordExport({ kind, count }, actor);
          return csvResponse(kind, body);
        }

        if (path === '/api/backoffice/leads' && request.method === 'POST') {
          requireJsonWrite(request, url);
          const input = validateLeadSave(await readJson(request));
          // CVR is asked again right before saving; protection wins over every other check.
          // Refusals are 422 so the screen shows the reason; 409 means a revision conflict there.
          const company = await cvrClient(env).company(input.cvr);
          if (!company) throw new HttpError(404, 'Company was not found in the register.');
          if (company.protected !== false) throw new HttpError(422, 'This company has asked not to receive marketing in CVR. Nothing was saved.');
          if (company.active !== true) throw new HttpError(422, 'This company is no longer active in CVR. Nothing was saved.');
          if (company.allowedForm !== true) throw new HttpError(422, 'This company form is not included in the lead finder. Nothing was saved.');
          const today = isoToday();
          const result = await createStore(env.DB).saveLead({ lead: toLead(company, input.product, null, today), product: input.product, nextFollowUp: input.nextFollowUp, today }, actor);
          return json(result, result.created ? 201 : 200);
        }

        if (path === '/api/backoffice/leads') {
          if (request.method !== 'GET') methodNotAllowed();
          const search = validateLeadSearch(url.searchParams);
          const found = await cvrClient(env).search({ codes: search.codes, municipalityCodes: municipalityCodes(search.regions, search.municipalities), sizes: search.sizes, limit: 100, preset: leadPresets[search.product] });
          const companies = found.companies.filter(usableCompany);
          const store = createStore(env.DB);
          const saved = await store.customersByCvr(companies.map(company => company.cvr));
          const today = isoToday();
          const results = companies.map(company => toLead(company, search.product, saved.get(company.cvr), today)).sort(byScore);
          await store.recordLeadSearch({ ...search, count: results.length }, actor);
          return json({ results, search, total: found.total });
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
        let response = json({ error: error instanceof HttpError ? error.message : 'Sales storage is unavailable. Please try again later.' }, status);
        if (status === 429) response.headers.set('Retry-After', '3600');
        if (request.method === 'HEAD') response = protectedResponse(response, true);
        return allowCompanyEnquiry(request, response);
      }
    },
  };
}
