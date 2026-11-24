import { allowedCompanyFormCodes, employeeBands } from '../shared/lead-presets.mjs';
import { HttpError } from './validation.mjs';

// Every CVR field this module reads. The layout follows Erhvervsstyrelsen's documented
// Vrvirksomhed.virksomhedMetadata.nyeste* fields; confirm against a live response when
// system-to-system access exists (tests/fixtures/cvr/README.md).
const root = 'Vrvirksomhed';
const meta = `${root}.virksomhedMetadata`;
const paths = {
  cvr: `${root}.cvrNummer`,
  protected: `${root}.reklamebeskyttet`,
  status: `${meta}.sammensatStatus`,
  formCode: `${meta}.nyesteVirksomhedsform.virksomhedsformkode`,
  industries: [`${meta}.nyesteHovedbranche.branchekode`, `${meta}.nyesteBibranche1.branchekode`, `${meta}.nyesteBibranche2.branchekode`, `${meta}.nyesteBibranche3.branchekode`],
  municipality: `${meta}.nyesteBeliggenhedsadresse.kommune.kommuneKode`,
  founded: `${meta}.stiftelsesDato`,
  contacts: [`${root}.hjemmeside.kontaktoplysning`, `${root}.telefonNummer.kontaktoplysning`],
  employees: [`${meta}.nyesteErstMaanedsbeskaeftigelse.intervalKodeAntalAnsatte`, `${meta}.nyesteKvartalsbeskaeftigelse.intervalKodeAntalAnsatte`, `${meta}.nyesteAarsbeskaeftigelse.intervalKodeAntalAnsatte`],
  source: [`${root}.cvrNummer`, `${root}.reklamebeskyttet`, meta, `${root}.telefonNummer`, `${root}.elektroniskPost`, `${root}.hjemmeside`],
};
const activeStatuses = ['Aktiv', 'Normal'];
const maxResults = 100;
const bandCodes = new Set(employeeBands.map(band => band.code));
const formCodes = Object.keys(allowedCompanyFormCodes).map(Number).sort((a, b) => a - b);
const notConnected = () => new HttpError(503, 'Company search is not connected yet.');
const validNumber = cvr => /^\d{8}$/.test(cvr);
const totalOf = total => typeof total === 'number' ? total : Number.isFinite(total?.value) ? total.value : null;
const unavailable = () => new HttpError(502, 'The company register did not answer. Try again in a moment.');

const anyOf = clauses => ({ bool: { should: clauses, minimum_should_match: 1 } });

// Filters decide who appears; the should clauses rank the matches with the same points as
// scoreLead, so the first 100 hits are the best 100 rather than index order.
export function buildSearchQuery({ codes, municipalityCodes, sizes, limit, preset }) {
  const [mainIndustry, ...secondaryIndustries] = paths.industries;
  const filter = [
    { term: { [paths.protected]: false } },
    { terms: { [paths.formCode]: formCodes } },
    anyOf(activeStatuses.map(status => ({ match: { [paths.status]: status } }))),
    anyOf(codes.flatMap(code => paths.industries.map(field => ({ prefix: { [field]: code } })))),
  ];
  if (municipalityCodes.length) filter.push({ terms: { [paths.municipality]: municipalityCodes.map(Number) } });
  if (sizes.length) {
    const values = sizes.flatMap(size => size === 'ANTAL_1000_999999' ? [size, 'ANTAL_1000_'] : [size]);
    filter.push(anyOf(values.flatMap(value => paths.employees.map(field => ({ match: { [field]: value } })))));
  }
  const boostedBands = (bands, boost) => (bands ?? []).flatMap(value => paths.employees.map(field => ({ match: { [field]: { query: value, boost } } })));
  const should = [
    ...codes.map(code => ({ prefix: { [mainIndustry]: { value: code, boost: 45 } } })),
    ...codes.flatMap(code => secondaryIndustries.map(field => ({ prefix: { [field]: { value: code, boost: 20 } } }))),
    ...boostedBands(preset?.sweetSpot, 30),
    ...boostedBands(preset?.adjacent, 15),
    { range: { [paths.founded]: { lte: 'now-2y/d', boost: 15 } } },
    { bool: { should: paths.contacts.map(field => ({ exists: { field } })), boost: 10 } },
  ];
  return {
    size: Math.min(limit, maxResults),
    _source: paths.source,
    query: { bool: { filter, should, minimum_should_match: 0 } },
  };
}

function band(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('ANTAL_1000')) return 'ANTAL_1000_999999';
  return bandCodes.has(value) ? value : null;
}

// The newest public value of a CVR contact list; secret (hemmelig) and ended entries are skipped.
function contact(entries) {
  if (!Array.isArray(entries)) return '';
  const current = entries.filter(entry => entry && entry.hemmelig === false && !entry.periode?.gyldigTil && typeof entry.kontaktoplysning === 'string');
  return current.at(-1)?.kontaktoplysning.trim() ?? '';
}

const text = value => value === null || value === undefined ? '' : String(value).trim();

export function mapCompany(source) {
  const company = source?.[root] ?? {};
  const data = company.virksomhedMetadata ?? {};
  const address = data.nyesteBeliggenhedsadresse ?? {};
  const formCode = data.nyesteVirksomhedsform?.virksomhedsformkode;
  const allowedForm = (typeof formCode === 'number' || typeof formCode === 'string') && Object.hasOwn(allowedCompanyFormCodes, formCode);
  const founded = typeof data.stiftelsesDato === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.stiftelsesDato) ? data.stiftelsesDato.slice(0, 10) : null;
  const municipality = text(address.kommune?.kommuneKode);
  return {
    cvr: company.cvrNummer === undefined || company.cvrNummer === null ? '' : text(company.cvrNummer).padStart(8, '0'),
    name: text(data.nyesteNavn?.navn),
    industryCode: text(data.nyesteHovedbranche?.branchekode),
    industryText: text(data.nyesteHovedbranche?.branchetekst),
    secondaryCodes: [data.nyesteBibranche1, data.nyesteBibranche2, data.nyesteBibranche3].map(entry => text(entry?.branchekode)).filter(Boolean),
    companyForm: allowedForm ? allowedCompanyFormCodes[formCode] : text(data.nyesteVirksomhedsform?.kortBeskrivelse).toUpperCase(),
    employees: band(data.nyesteErstMaanedsbeskaeftigelse?.intervalKodeAntalAnsatte) ?? band(data.nyesteKvartalsbeskaeftigelse?.intervalKodeAntalAnsatte) ?? band(data.nyesteAarsbeskaeftigelse?.intervalKodeAntalAnsatte),
    address: [text(address.vejnavn), `${text(address.husnummerFra)}${text(address.bogstavFra)}`].filter(Boolean).join(' '),
    postcode: text(address.postnummer),
    city: text(address.postdistrikt),
    municipalityCode: municipality ? municipality.padStart(3, '0') : '',
    founded,
    website: contact(company.hjemmeside),
    phone: contact(company.telefonNummer),
    email: contact(company.elektroniskPost),
    // Fail closed: a company whose protection flag is missing is treated as protected.
    protected: company.reklamebeskyttet !== false,
    active: activeStatuses.some(status => status.toLowerCase() === text(data.sammensatStatus).toLowerCase()),
    allowedForm,
  };
}

function basicAuth(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

export function createCvrClient({ endpoint, username, password, fetch = globalThis.fetch, timeoutMs = 8000 }) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !username || !password) throw notConnected();
  const authorization = basicAuth(username, password);

  async function query(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let data;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw notConnected();
      if (!response.ok) throw unavailable();
      data = await response.json();
    } catch (error) {
      throw error instanceof HttpError && error.status === 503 ? error : unavailable();
    } finally {
      clearTimeout(timer);
    }
    const hits = data?.hits?.hits;
    if (!Array.isArray(hits)) throw unavailable();
    const companies = hits.map(hit => mapCompany(hit?._source)).filter(company => validNumber(company.cvr));
    // Hits that all lack the company root or a CVR number mean the answer has another shape.
    if (hits.length && !companies.length) throw unavailable();
    return { companies, total: totalOf(data.hits.total) };
  }

  return {
    // Every rule the query filters on is checked again on each hit, including the size and
    // municipality the screen will show.
    async search(params) {
      const { companies, total } = await query(buildSearchQuery(params));
      const fits = company => usableCompany(company)
        && (!params.sizes.length || params.sizes.includes(company.employees))
        && (!params.municipalityCodes.length || params.municipalityCodes.includes(company.municipalityCode));
      return { companies: companies.filter(fits), total };
    },
    // Returns the company even when it is protected or inactive, so a caller can say why it
    // refuses; callers must check it with usableCompany.
    async company(cvr) {
      const { companies } = await query({ size: 1, _source: paths.source, query: { term: { [paths.cvr]: cvr } } });
      return companies.find(company => company.cvr === cvr) ?? null;
    },
  };
}

// Fail closed: only an explicit unprotected, active company in an allowed form is usable.
export const usableCompany = company => company?.protected === false && company.active === true && company.allowedForm === true;

export function cvrClientFromEnv(env = {}) {
  return createCvrClient({ endpoint: env.CVR_ENDPOINT, username: env.CVR_USERNAME, password: env.CVR_PASSWORD });
}
