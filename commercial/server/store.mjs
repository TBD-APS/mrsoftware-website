import { initialCatalog } from '../shared/catalog.mjs';
import { HttpError, isEmail } from './validation.mjs';

const tables = { customers: 'sales_customers', opportunities: 'sales_opportunities', quotes: 'sales_quotes', events: 'sales_events' };
const stateLimit = 100;
const queueLimit = 25;
const initialJson = JSON.stringify(initialCatalog);
const parseRow = row => row ? JSON.parse(row.document) : null;
const record = (input, now = new Date().toISOString()) => ({ ...input, id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now });
const event = (actor, recordType, recordId, operation, now, details) => record({ actor, recordType, recordId, operation, ...(details ? { details } : {}) }, now);
const notFound = () => { throw new HttpError(404, 'Record was not found.'); };
const conflict = () => { throw new HttpError(409, 'This record has changed. Reload it before saving.'); };

function insertEvent(db, item, condition = '', bindings = []) {
  return db.prepare(`INSERT INTO sales_events (id, revision, created_at, updated_at, document) SELECT ?, 1, ?, ?, ? ${condition}`).bind(item.id, item.createdAt, item.updatedAt, JSON.stringify(item), ...bindings);
}

function insertCustomer(db, item, condition = '', bindings = []) {
  return db.prepare(`INSERT INTO sales_customers (id, revision, created_at, updated_at, document) SELECT ?, 1, ?, ?, ? ${condition} RETURNING document`).bind(item.id, item.createdAt, item.updatedAt, JSON.stringify(item), ...bindings);
}

function insertOpportunity(db, item, condition = '', bindings = []) {
  return db.prepare(`INSERT INTO sales_opportunities (id, customer_id, revision, created_at, updated_at, document) SELECT ?, ?, 1, ?, ?, ? ${condition} RETURNING document`).bind(item.id, item.customerId, item.createdAt, item.updatedAt, JSON.stringify(item), ...bindings);
}

function selectedPackage(catalog, packageId, product) {
  if (packageId === null) return;
  const pkg = catalog.packages.find(pkg => pkg.id === packageId && pkg.active && (!product || pkg.product === product));
  if (!pkg) throw new HttpError(400, 'Select an available package for this product.');
  return pkg;
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function networkKey(address) {
  // Cloudflare supplies this header. Do not use caller-controlled forwarding
  // headers. Share a bucket when the trusted address is unavailable or invalid.
  if (typeof address !== 'string' || address.length > 45) return 'unknown';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    const parts = address.split('.').map(Number);
    if (parts.every(part => part <= 255)) return `v4:${parts.slice(0, 3).join('.')}.0/24`;
  }
  if (/^[0-9a-f:]+$/i.test(address) && address.includes(':')) {
    try {
      const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
      const [left, right] = canonical.split('::');
      const first = left ? left.split(':') : [];
      const last = right ? right.split(':') : [];
      const parts = right === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
      return `v6:${parts.slice(0, 4).map(part => parseInt(part, 16).toString(16)).join(':')}/64`;
    } catch { /* Invalid addresses share the conservative fallback bucket. */ }
  }
  return 'unknown';
}

export function createStore(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new HttpError(503, 'Sales storage is unavailable. Please try again later.');
  const catalogStatement = () => db.prepare("SELECT document FROM sales_catalog WHERE id = 'catalog'");
  const catalog = async () => parseRow(await catalogStatement().first()) ?? structuredClone(initialCatalog);
  const get = async (kind, id) => {
    const item = parseRow(await db.prepare(`SELECT document FROM ${tables[kind]} WHERE id = ?`).bind(id).first());
    return item ?? notFound();
  };

  async function state() {
    // One batch gives a consistent workspace snapshot as well as bounded reads.
    const collections = Object.keys(tables);
    // Audit-only events (lead searches, downloads, website checks) never count toward the workspace activity window.
    const auditOnly = kind => kind === 'events' ? "WHERE json_extract(document, '$.recordType') NOT IN ('leadSearch', 'export', 'websiteCheck') " : '';
    const results = await db.batch([...collections.map(kind => db.prepare(`SELECT document FROM ${tables[kind]} ${auditOnly(kind)}ORDER BY updated_at DESC, id DESC LIMIT ?`).bind(stateLimit + 1)), catalogStatement()]);
    const output = { truncated: false };
    for (const [index, kind] of collections.entries()) {
      const rows = results[index].results;
      output[kind] = rows.slice(0, stateLimit).map(parseRow);
      if (rows.length > stateLimit) output.truncated = true;
    }
    output.catalog = parseRow(results[collections.length].results[0]) ?? structuredClone(initialCatalog);
    return output;
  }

  async function today({ date, cursors }) {
    const queues = [
      { key: 'followUps', table: 'sales_opportunities', sort: "json_extract(s.document, '$.nextFollowUp')", filter: "json_extract(s.document, '$.nextFollowUp') <= ? AND json_extract(s.document, '$.stage') NOT IN ('won', 'lost')", bindings: [date], customer: true },
      { key: 'enquiries', table: 'sales_opportunities', sort: 's.created_at', filter: "json_extract(s.document, '$.stage') = 'enquiry' AND json_extract(s.document, '$.nextFollowUp') IS NULL", bindings: [], customer: true },
      { key: 'quotes', table: 'sales_quotes', sort: "json_extract(s.document, '$.validUntil')", filter: "json_extract(s.document, '$.status') IN ('draft', 'sent')", bindings: [], customer: false },
    ];
    // Filter across all records before limiting; unrelated recent work must not
    // hide a due opportunity. The stable two-column cursor handles equal dates.
    const results = await db.batch(queues.map(queue => {
      const cursor = cursors[queue.key];
      return db.prepare(`SELECT s.document, ${queue.sort} AS sort_value${queue.customer ? ', c.document AS customer' : ''}
        FROM ${queue.table} s ${queue.customer ? 'JOIN sales_customers c ON c.id = s.customer_id' : ''}
        WHERE ${queue.filter}${cursor ? ` AND (${queue.sort} > ? OR (${queue.sort} = ? AND s.id > ?))` : ''}
        ORDER BY ${queue.sort} ASC, s.id ASC LIMIT ?`).bind(...queue.bindings, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []), queueLimit + 1);
    }));
    const output = { date, customers: [] };
    const customers = new Map();
    for (const [index, queue] of queues.entries()) {
      const rows = results[index].results;
      const page = rows.slice(0, queueLimit);
      const last = page.at(-1);
      output[queue.key] = { items: page.map(parseRow), next: rows.length > queueLimit ? JSON.stringify([last.sort_value, parseRow(last).id]) : null };
      if (queue.customer) for (const row of page) { const customer = JSON.parse(row.customer); customers.set(customer.id, customer); }
    }
    output.customers = [...customers.values()];
    return output;
  }

  async function createCustomer(input, actor) {
    const item = record(input);
    await db.batch([insertCustomer(db, item), insertEvent(db, event(actor, 'customer', item.id, 'created', item.createdAt))]);
    return item;
  }

  async function createOpportunity(input, actor) {
    await get('customers', input.customerId);
    const item = record(input);
    await db.batch([insertOpportunity(db, item), insertEvent(db, event(actor, 'opportunity', item.id, 'created', item.createdAt))]);
    return item;
  }

  async function update(kind, id, input, actor) {
    if (kind === 'opportunities') await get('customers', input.customerId);
    const { revision, ...fields } = input;
    if (kind === 'customers') {
      // The CVR number is fixed once a lead is saved; an edit keeps it.
      const stored = (await get('customers', id)).cvr;
      if (fields.cvr !== undefined && fields.cvr !== stored) throw new HttpError(400, 'CVR number cannot be changed.');
      if (stored) fields.cvr = stored;
    }
    const now = new Date().toISOString();
    const bindings = kind === 'opportunities' ? [input.customerId] : [];
    const statement = kind === 'quotes'
      ? db.prepare('UPDATE sales_quotes SET revision = revision + 1, updated_at = ?, document = json_set(document, \'$.status\', ?, \'$.revision\', revision + 1, \'$.updatedAt\', ?) WHERE id = ? AND revision = ? RETURNING document').bind(now, input.status, now, id, revision)
      : db.prepare(`UPDATE ${tables[kind]} SET ${kind === 'opportunities' ? 'customer_id = ?, ' : ''}revision = revision + 1, updated_at = ?, document = json_set(?, '$.id', id, '$.revision', revision + 1, '$.createdAt', created_at, '$.updatedAt', ?) WHERE id = ? AND revision = ? RETURNING document`).bind(...bindings, now, JSON.stringify(fields), now, id, revision);
    const type = { customers: 'customer', opportunities: 'opportunity', quotes: 'quote' }[kind];
    const results = await db.batch([
      statement,
      insertEvent(db, event(actor, type, id, kind === 'quotes' ? 'statusChanged' : 'updated', now), 'WHERE changes() = 1'),
      db.prepare(`SELECT document FROM ${tables[kind]} WHERE id = ?`).bind(id),
    ]);
    const item = parseRow(results[0].results[0]);
    if (item) return item;
    if (!results[2].results.length) notFound();
    conflict();
  }

  async function updateCatalog(input, actor) {
    const now = new Date().toISOString();
    const saved = { ...input, revision: input.revision + 1 };
    const results = await db.batch([
      db.prepare(`INSERT INTO sales_catalog (id, revision, created_at, updated_at, document)
        SELECT 'catalog', ?, ?, ?, ? WHERE ? = 1 OR EXISTS (SELECT 1 FROM sales_catalog WHERE id = 'catalog' AND revision = ?)
        ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at, document = excluded.document
        WHERE sales_catalog.revision = ? RETURNING document`).bind(saved.revision, now, now, JSON.stringify(saved), input.revision, input.revision, input.revision),
      insertEvent(db, event(actor, 'catalog', 'catalog', 'updated', now), 'WHERE changes() = 1'),
    ]);
    return parseRow(results[0].results[0]) ?? conflict();
  }

  async function createQuote(input, actor) {
    await get('customers', input.customerId);
    if (input.opportunityId) {
      const opportunity = await get('opportunities', input.opportunityId);
      if (opportunity.customerId !== input.customerId) throw new HttpError(400, 'The opportunity must belong to the selected customer.');
    }
    const item = record({ ...input, monthlyMinor: null, currency: 'DKK', status: 'draft', snapshot: null });
    // Read the current customer, package and price in the INSERT transaction.
    // A pre-read would let a concurrent catalogue edit produce a stale quote.
    const results = await db.batch([
      db.prepare(`WITH current_catalog AS (SELECT coalesce((SELECT document FROM sales_catalog WHERE id = 'catalog'), ?) AS document),
        selected_package AS (SELECT p.value AS document, c.document AS catalog FROM current_catalog c, json_each(c.document, '$.packages') p WHERE json_extract(p.value, '$.id') = ? AND json_extract(p.value, '$.active') = 1)
        INSERT INTO sales_quotes (id, customer_id, opportunity_id, revision, created_at, updated_at, document)
        SELECT ?, c.id, ?, 1, ?, ?, json_set(?, '$.monthlyMinor', coalesce(?, json_extract(p.document, '$.monthlyMinor')), '$.snapshot',
          json_object('customer', json(c.document), 'package', json(p.document), 'catalogRevision', json_extract(p.catalog, '$.revision')))
        FROM sales_customers c CROSS JOIN selected_package p WHERE c.id = ? AND coalesce(?, json_extract(p.document, '$.monthlyMinor')) IS NOT NULL
          AND (? IS NULL OR EXISTS (SELECT 1 FROM sales_opportunities o WHERE o.id = ? AND o.customer_id = c.id)) RETURNING document`).bind(initialJson, input.packageId, item.id, input.opportunityId, item.createdAt, item.updatedAt, JSON.stringify(item), input.monthlyMinor ?? null, input.customerId, input.monthlyMinor ?? null, input.opportunityId, input.opportunityId),
      insertEvent(db, event(actor, 'quote', item.id, 'created', item.createdAt), 'WHERE changes() = 1'),
    ]);
    const saved = parseRow(results[0].results[0]);
    if (!saved) throw new HttpError(400, 'Select an available package, an agreed price and a matching opportunity.');
    return saved;
  }

  async function createEnquiry({ input, canonical }, address) {
    const fingerprint = await digest(canonical);
    const receiptStatement = () => db.prepare('SELECT fingerprint, reference FROM sales_enquiries WHERE request_id = ?').bind(input.requestId);
    const receipt = row => {
      if (row.fingerprint !== fingerprint) throw new HttpError(409, 'This request id was already used for different details.');
      return { received: true, reference: row.reference };
    };
    const existing = await receiptStatement().first();
    if (existing) return { created: false, receipt: receipt(existing) };
    const pkg = selectedPackage(await catalog(), input.packageId, input.product);
    const now = new Date().toISOString();
    const reference = crypto.randomUUID();
    const network = await digest(networkKey(address));
    const windowStart = Math.floor(Date.now() / 3600000);
    const customer = record({ name: input.company, contacts: [{ name: input.name, email: input.email, phone: '' }], notes: '' }, now);
    const opportunity = record({ customerId: customer.id, title: `${input.product[0].toUpperCase()}${input.product.slice(1)} enquiry${pkg ? `: ${pkg.name}` : ''}`.slice(0, 200), product: input.product, stage: 'enquiry', nextFollowUp: null, notes: input.message }, now);
    const condition = 'WHERE EXISTS (SELECT 1 FROM sales_enquiries WHERE reference = ?)';
    const actor = { type: 'public-enquiry' };
    const results = await db.batch([
      db.prepare('DELETE FROM sales_enquiry_limits WHERE window_start < ?').bind(windowStart),
      db.prepare(`INSERT INTO sales_enquiries (request_id, fingerprint, reference, created_at)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM sales_enquiries WHERE request_id = ?)
          AND coalesce((SELECT count FROM sales_enquiry_limits WHERE network_hash = ? AND window_start = ?), 0) < 5
          AND (? IS NULL OR EXISTS (SELECT 1 FROM json_each(coalesce((SELECT document FROM sales_catalog WHERE id = 'catalog'), ?), '$.packages') p
            WHERE json_extract(p.value, '$.id') = ? AND json_extract(p.value, '$.product') = ? AND json_extract(p.value, '$.active') = 1))
        RETURNING reference`).bind(input.requestId, fingerprint, reference, now, input.requestId, network, windowStart, input.packageId, initialJson, input.packageId, input.product),
      insertCustomer(db, customer, condition, [reference]),
      insertOpportunity(db, opportunity, condition, [reference]),
      insertEvent(db, event(actor, 'customer', customer.id, 'created', now), condition, [reference]),
      insertEvent(db, event(actor, 'opportunity', opportunity.id, 'created', now), condition, [reference]),
      db.prepare(`INSERT INTO sales_enquiry_limits (network_hash, window_start, count) SELECT ?, ?, 1 ${condition}
        ON CONFLICT(network_hash, window_start) DO UPDATE SET count = sales_enquiry_limits.count + 1`).bind(network, windowStart, reference),
      receiptStatement(),
    ]);
    const saved = results[results.length - 1].results[0];
    if (!saved) {
      selectedPackage(await catalog(), input.packageId, input.product);
      throw new HttpError(429, 'Too many enquiries from this network. Please try again later.');
    }
    return { created: results[1].results.length === 1, receipt: receipt(saved) };
  }

  // One batch: the customer is inserted only when no customer has this CVR number, and the
  // opportunity and events only when that insert happened. The last statement reads the
  // customer that owns the number, new or existing.
  async function saveLead({ lead, product, nextFollowUp, today }, actor) {
    const now = new Date().toISOString();
    const contact = { name: '', email: isEmail(lead.email) ? lead.email : '', phone: (lead.phone ?? '').slice(0, 50) };
    const customer = record({ name: lead.name.slice(0, 200), cvr: lead.cvr, contacts: contact.email || contact.phone ? [contact] : [], notes: `Found with the lead finder on ${today}. Reason: ${lead.reason}`.slice(0, 4000) }, now);
    const opportunity = record({ customerId: customer.id, title: `${product[0].toUpperCase()}${product.slice(1)} lead`, product, stage: 'lead', nextFollowUp, notes: '' }, now);
    const created = 'WHERE EXISTS (SELECT 1 FROM sales_customers WHERE id = ?)';
    const results = await db.batch([
      insertCustomer(db, customer, "WHERE NOT EXISTS (SELECT 1 FROM sales_customers WHERE json_extract(document, '$.cvr') = ?)", [lead.cvr]),
      insertOpportunity(db, opportunity, created, [customer.id]),
      insertEvent(db, event(actor, 'customer', customer.id, 'created', now), created, [customer.id]),
      insertEvent(db, event(actor, 'opportunity', opportunity.id, 'created', now), created, [customer.id]),
      db.prepare("SELECT document FROM sales_customers WHERE json_extract(document, '$.cvr') = ? ORDER BY created_at ASC, id ASC LIMIT 1").bind(lead.cvr),
    ]);
    const isNew = results[0].results.length === 1;
    return { created: isNew, customer: parseRow(results[4].results[0]), opportunity: isNew ? parseRow(results[1].results[0]) : null };
  }

  async function customersByCvr(cvrs) {
    if (!cvrs.length) return new Map();
    const { results } = await db.prepare("SELECT id, json_extract(document, '$.cvr') AS cvr FROM sales_customers WHERE json_extract(document, '$.cvr') IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC, id DESC").bind(JSON.stringify(cvrs)).all();
    return new Map(results.map(row => [row.cvr, row.id]));
  }

  // Bounded full lists for downloads, newest first.
  const exportLimit = 5000;
  async function exportRows(kind) {
    const { results } = await db.prepare(`SELECT document FROM ${tables[kind]} ORDER BY updated_at DESC, id DESC LIMIT ?`).bind(exportLimit).all();
    return results.map(parseRow);
  }

  async function recordExport(details, actor) {
    const now = new Date().toISOString();
    await insertEvent(db, event(actor, 'export', crypto.randomUUID(), 'downloaded', now, details)).run();
  }

  async function recordLeadSearch(details, actor) {
    const now = new Date().toISOString();
    await insertEvent(db, event(actor, 'leadSearch', crypto.randomUUID(), 'searched', now, details)).run();
  }

  // Firecrawl credits per calendar month. A reservation is one conditional upsert, so parallel
  // checks cannot pass the cap together. The SELECT's WHERE also refuses a first reservation
  // that is already over the cap.
  async function reserveCredits(month, credits, cap) {
    const result = await db.prepare(`INSERT INTO sales_firecrawl_usage (month, credits) SELECT ?1, ?2 WHERE ?2 <= ?3
      ON CONFLICT(month) DO UPDATE SET credits = credits + excluded.credits
      WHERE sales_firecrawl_usage.credits + excluded.credits <= ?3`).bind(month, credits, cap).run();
    return result.meta.changes === 1;
  }

  // Provider costs that Firecrawl reports after a call; they are counted even past the cap.
  async function addCredits(month, credits) {
    if (!(credits > 0)) return;
    await db.prepare(`INSERT INTO sales_firecrawl_usage (month, credits) VALUES (?1, ?2)
      ON CONFLICT(month) DO UPDATE SET credits = credits + excluded.credits`).bind(month, credits).run();
  }

  async function creditsUsed(month) {
    return (await db.prepare('SELECT credits FROM sales_firecrawl_usage WHERE month = ?').bind(month).first())?.credits ?? 0;
  }

  async function websiteChecks(cvrs) {
    const unique = [...new Set(cvrs)];
    if (!unique.length) return new Map();
    const { results } = await db.prepare(`SELECT document FROM sales_website_checks WHERE cvr IN (${unique.map(() => '?').join(', ')})`).bind(...unique).all();
    return new Map(results.map(parseRow).map(check => [check.cvr, check]));
  }

  async function saveWebsiteCheck(check, credits, actor) {
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO sales_website_checks (cvr, checked_at, document) VALUES (?1, ?2, ?3)
        ON CONFLICT(cvr) DO UPDATE SET checked_at = excluded.checked_at, document = excluded.document`).bind(check.cvr, check.checkedAt, JSON.stringify(check)),
      insertEvent(db, event(actor, 'websiteCheck', crypto.randomUUID(), 'checked', now, { cvr: check.cvr, credits })),
    ]);
    return check;
  }

  return { catalog, state, today, get, createCustomer, createOpportunity, update, updateCatalog, createQuote, createEnquiry, customersByCvr, recordLeadSearch, saveLead, exportRows, recordExport, reserveCredits, addCredits, creditsUsed, websiteChecks, saveWebsiteCheck };
}
