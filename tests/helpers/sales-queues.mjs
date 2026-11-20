import { customerInput, opportunityInput, quoteInput } from './commercial.mjs';

// Seed valid synthetic records in genuine D1 without hundreds of HTTP writes.
export async function seedSalesQueue(app, count, { matching = true, now = '2020-01-01T12:00:00.000Z', prefix = 'Queue' } = {}) {
  const customer = (await app.call('POST', '/api/backoffice/customers', { ...customerInput, name: prefix + ' customer' })).body.item;
  const template = (await app.call('POST', '/api/backoffice/quotes', quoteInput(customer.id))).body.item;
  await app.db.prepare('DELETE FROM sales_quotes WHERE id = ?').bind(template.id).run();
  const rows = { customer, followUps: [], enquiries: [], quotes: [] };
  const statements = [];
  for (let index = 0; index < count; index++) {
    const company = matching ? customer : { ...customer, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    if (!matching) statements.push(app.db.prepare('INSERT INTO sales_customers (id,revision,created_at,updated_at,document) VALUES (?,1,?,?,?)').bind(company.id, now, now, JSON.stringify(company)));
    for (const kind of ['followUps', 'enquiries']) {
      const item = { ...opportunityInput(company.id), id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now, title: `${prefix} ${kind} ${index}`,
        stage: matching ? kind === 'enquiries' ? 'enquiry' : 'demo' : 'won', nextFollowUp: kind === 'enquiries' ? null : '2020-11-19' };
      rows[kind].push(item);
      statements.push(app.db.prepare('INSERT INTO sales_opportunities (id,customer_id,revision,created_at,updated_at,document) VALUES (?,?,1,?,?,?)').bind(item.id, company.id, now, now, JSON.stringify(item)));
    }
    const item = { ...template, id: crypto.randomUUID(), customerId: company.id, snapshot: { ...template.snapshot, customer: company }, createdAt: now, updatedAt: now, status: matching ? 'sent' : 'accepted', validUntil: '2030-12-31' };
    rows.quotes.push(item);
    statements.push(app.db.prepare('INSERT INTO sales_quotes (id,customer_id,opportunity_id,revision,created_at,updated_at,document) VALUES (?,?,NULL,1,?,?,?)').bind(item.id, company.id, now, now, JSON.stringify(item)));
  }
  if (statements.length) await app.db.batch(statements);
  return rows;
}
