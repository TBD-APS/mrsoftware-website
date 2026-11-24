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
  employees: [`${meta}.nyesteErstMaanedsbeskaeftigelse.intervalKodeAntalAnsatte`, `${meta}.nyesteKvartalsbeskaeftigelse.intervalKodeAntalAnsatte`, `${meta}.nyesteAarsbeskaeftigelse.intervalKodeAntalAnsatte`],
  source: [`${root}.cvrNummer`, `${root}.reklamebeskyttet`, meta, `${root}.telefonNummer`, `${root}.elektroniskPost`, `${root}.hjemmeside`],
};
const activeStatuses = ['Aktiv', 'Normal'];
const maxResults = 100;
const bandCodes = new Set(employeeBands.map(band => band.code));
const formCodes = Object.keys(allowedCompanyFormCodes).map(Number).sort((a, b) => a - b);
const notConnected = () => new HttpError(503, 'Company search is not connected yet.');
const unavailable = () => new HttpError(502, 'The company register did not answer. Try again in a moment.');

const anyOf = clauses => ({ bool: { should: clauses, minimum_should_match: 1 } });

export function buildSearchQuery({ codes, municipalityCodes, sizes, limit }) {
  const filter = [
    { terms: { [paths.formCode]: formCodes } },
    anyOf(activeStatuses.map(status => ({ match: { [paths.status]: status } }))),
    anyOf(codes.flatMap(code => paths.industries.map(field => ({ prefix: { [field]: code } })))),
  ];
  if (municipalityCodes.length) filter.push({ terms: { [paths.municipality]: municipalityCodes.map(Number) } });
  if (sizes.length) {
    const values = sizes.flatMap(size => size === 'ANTAL_1000_999999' ? [size, 'ANTAL_1000_'] : [size]);
    filter.push(anyOf(values.flatMap(value => paths.employees.map(field => ({ match: { [field]: value } })))));
  }
  return {
    size: Math.min(limit, maxResults),
    _source: paths.source,
    query: { bool: { filter, must_not: [{ term: { [paths.protected]: true } }] } },
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
  const founded = typeof data.stiftelsesDato === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.stiftelsesDato) ? data.stiftelsesDato.slice(0, 10) : null;
  const municipality = text(address.kommune?.kommuneKode);
  return {
    cvr: text(company.cvrNummer).padStart(8, '0'),
    name: text(data.nyesteNavn?.navn),
    industryCode: text(data.nyesteHovedbranche?.branchekode),
    industryText: text(data.nyesteHovedbranche?.branchetekst),
    secondaryCodes: [data.nyesteBibranche1, data.nyesteBibranche2, data.nyesteBibranche3].map(entry => text(entry?.branchekode)).filter(Boolean),
    companyForm: allowedCompanyFormCodes[formCode] ?? text(data.nyesteVirksomhedsform?.kortBeskrivelse).toUpperCase(),
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
    allowedForm: formCode in allowedCompanyFormCodes,
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
      if (!response.ok) throw unavailable();
      data = await response.json();
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(data?.hits?.hits)) throw unavailable();
    return data.hits.hits.map(hit => mapCompany(hit?._source));
  }

  const usable = company => !company.protected && company.active && company.allowedForm;
  const publicShape = ({ allowedForm, ...company }) => company;

  return {
    async search(params) {
      return (await query(buildSearchQuery(params))).filter(usable).map(publicShape);
    },
    // Returns the company even when it is protected or inactive, so a caller can say why it
    // refuses; callers must check `protected`, `active` and the company form themselves.
    async company(cvr) {
      const [company] = await query({ size: 1, _source: paths.source, query: { term: { [paths.cvr]: cvr } } });
      return company ? { ...publicShape(company), allowedForm: company.allowedForm } : null;
    },
  };
}

export function cvrClientFromEnv(env = {}) {
  return createCvrClient({ endpoint: env.CVR_ENDPOINT, username: env.CVR_USERNAME, password: env.CVR_PASSWORD });
}
