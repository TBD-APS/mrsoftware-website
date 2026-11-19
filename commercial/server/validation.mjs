export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const products = ['workslip', 'tradey', 'shippy'];
const stages = ['enquiry', 'contacted', 'demo', 'quote', 'won', 'lost'];
const statuses = ['draft', 'sent', 'accepted', 'declined', 'expired'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const packagePattern = /^[a-z][a-z0-9-]{0,63}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = message => { throw new HttpError(400, message); };

function object(value, keys, label = 'Request') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid(`${label} has invalid fields.`);
  return value;
}

function text(value, label, max, min = 0) {
  if (typeof value !== 'string' || value.length > max || value.trim().length < min || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(`${label} must contain ${min ? `between ${min} and` : 'at most'} ${max} characters.`);
  return value.trim();
}

function list(value, label, max, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(`${label} must contain ${min ? `between ${min} and` : 'at most'} ${max} items.`);
  return value;
}

function oneOf(value, choices, label) {
  if (!choices.includes(value)) invalid(`${label} is invalid.`);
  return value;
}

export function recordId(value, label = 'Record id') {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function packageId(value) {
  if (typeof value !== 'string' || !packagePattern.test(value)) invalid('Package id is invalid.');
  return value;
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) invalid('Revision must be a positive integer.');
  return value;
}

function amount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) invalid(`${label} must be an integer between 0 and 1000000000 minor units.`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') invalid(`${label} must be a valid YYYY-MM-DD date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}

function email(value, optional = false) {
  const result = text(value, 'Email', 254);
  if ((!optional || result) && !emailPattern.test(result)) invalid('Email must be a valid email address.');
  return result;
}

function active(value) {
  if (typeof value !== 'boolean') invalid('Active must be true or false.');
  return value;
}

export async function readJson(request) {
  const limit = 65536;
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength && Number(declaredLength) > limit) invalid('Request body is too large.');
  if (!request.body) invalid('A JSON request body is required.');
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        invalid('Request body is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    invalid('Request body must be valid JSON.');
  } finally {
    reader.releaseLock();
  }
}

export function validateCustomer(data, update = false) {
  object(data, ['name', 'contacts', 'notes', ...(update ? ['revision'] : [])]);
  const result = {
    name: text(data.name, 'Company name', 200, 1),
    contacts: list(data.contacts, 'Contacts', 20).map(contact => {
      object(contact, ['name', 'email', 'phone'], 'Contact');
      const result = { name: text(contact.name, 'Contact name', 100), email: email(contact.email, true), phone: text(contact.phone, 'Phone', 50) };
      if (!result.name && !result.email && !result.phone) invalid('A contact must contain a name, email or phone.');
      return result;
    }),
    notes: text(data.notes, 'Notes', 4000),
  };
  return update ? { ...result, revision: revision(data.revision) } : result;
}

export function validateOpportunity(data, update = false) {
  object(data, ['customerId', 'title', 'product', 'stage', 'nextFollowUp', 'notes', ...(update ? ['revision'] : [])]);
  const result = { customerId: recordId(data.customerId, 'Customer id'), title: text(data.title, 'Title', 200, 1), product: oneOf(data.product, products, 'Product'), stage: oneOf(data.stage, stages, 'Stage'), nextFollowUp: data.nextFollowUp == null ? null : date(data.nextFollowUp, 'Next follow-up'), notes: text(data.notes, 'Notes', 4000) };
  return update ? { ...result, revision: revision(data.revision) } : result;
}

export function validateQuote(data) {
  object(data, ['customerId', 'opportunityId', 'packageId', 'monthlyMinor', 'setupMinor', 'validUntil', 'notes']);
  return { customerId: recordId(data.customerId, 'Customer id'), opportunityId: data.opportunityId == null || data.opportunityId === '' ? null : recordId(data.opportunityId, 'Opportunity id'), packageId: packageId(data.packageId), ...(data.monthlyMinor === undefined ? {} : { monthlyMinor: amount(data.monthlyMinor, 'Monthly price') }), setupMinor: amount(data.setupMinor, 'Setup price'), validUntil: date(data.validUntil, 'Validity date'), notes: text(data.notes, 'Notes', 4000) };
}

export function validateQuoteUpdate(data) {
  object(data, ['revision', 'status']);
  return { revision: revision(data.revision), status: oneOf(data.status, statuses, 'Quote status') };
}

export function validateCatalog(data) {
  object(data, ['revision', 'packages', 'demos']);
  const packages = list(data.packages, 'Packages', 50, 1).map(pkg => {
    object(pkg, ['id', 'product', 'name', 'monthlyMinor', 'includes', 'active'], 'Package');
    return { id: packageId(pkg.id), product: oneOf(pkg.product, products, 'Product'), name: text(pkg.name, 'Package name', 200, 1), monthlyMinor: pkg.monthlyMinor === null ? null : amount(pkg.monthlyMinor, 'Monthly price'), includes: list(pkg.includes, 'Included features', 30).map(feature => text(feature, 'Included feature', 200, 1)), active: active(pkg.active) };
  });
  if (new Set(packages.map(pkg => pkg.id)).size !== packages.length) invalid('Package ids must be unique.');
  const demos = list(data.demos, 'Demos', 3, 3).map(demo => {
    object(demo, ['id', 'title', 'summary', 'active'], 'Demo');
    return { id: oneOf(demo.id, products, 'Demo id'), title: text(demo.title, 'Demo title', 200, 1), summary: text(demo.summary, 'Demo summary', 1000, 1), active: active(demo.active) };
  });
  if (new Set(demos.map(demo => demo.id)).size !== 3) invalid('Each product must have exactly one demo.');
  return { revision: revision(data.revision), currency: 'DKK', packages, demos };
}

export function validateEnquiry(data) {
  const keys = ['requestId', 'company', 'name', 'email', 'product', 'packageId', 'message', 'website'];
  object(data, keys);
  if (data.website !== '') invalid('Website must be empty.');
  const input = { requestId: recordId(data.requestId, 'Request id'), company: text(data.company, 'Company name', 200, 1), name: text(data.name, 'Name', 100, 1), email: email(data.email), product: oneOf(data.product, products, 'Product'), packageId: data.packageId == null || data.packageId === '' ? null : packageId(data.packageId), message: text(data.message, 'Message', 4000), website: '' };
  // Field ordering is irrelevant; changes to submitted values still conflict,
  // including whitespace that is trimmed when storing the customer.
  return { input, canonical: JSON.stringify(keys.map(key => [key, data[key] ?? null])) };
}
