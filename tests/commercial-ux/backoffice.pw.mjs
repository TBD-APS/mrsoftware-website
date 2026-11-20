import { test, expect } from './fixtures.mjs';
import { startCommercialSite } from '../helpers/commercial-http.mjs';
import { customerInput, opportunityInput, quoteInput, enquiryInput } from '../helpers/commercial.mjs';
import { seedSalesQueue } from '../helpers/sales-queues.mjs';

const route = (app, view = '', id = '') => app.privateBase + 'backoffice/' + (view ? `?view=${view}${id ? '&id=' + id : ''}` : '');
const seedCustomer = async (app, values = {}) => (await app.call('POST', '/api/backoffice/customers', { ...customerInput, name: 'Holm & Co', ...values })).body.item;
const state = async app => (await app.call('GET', '/api/backoffice/state')).body;
const ready = async page => { await expect(page.locator('main')).toHaveAttribute('data-ready', 'true'); await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); };

test('private customer journey saves contacts and notes in real D1 with stable links', async ({ page, app }) => {
  const response = await page.goto(route(app));
  expect(response.status()).toBe(200);
  await page.getByRole('link', { name: 'New customer', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('Lund Services');
  await page.getByLabel('Contact name', { exact: true }).fill('Alex Lund');
  await page.getByLabel('Contact email', { exact: true }).fill('alex@example.test');
  await page.getByLabel('Contact phone', { exact: true }).fill('+45 12345678');
  await page.getByLabel('Private notes', { exact: true }).fill('Call after ten.');
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Lund Services');
  const saved = (await state(app)).customers[0];
  expect(saved.contacts).toEqual([{ name: 'Alex Lund', email: 'alex@example.test', phone: '+45 12345678' }]);
  expect(saved.notes).toBe('Call after ten.');
  expect(page.url()).toContain(saved.id);
  await page.reload(); await ready(page);
  await expect(page.locator('h1')).toHaveText('Lund Services');
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.goBack(); await ready(page);
  await expect(page.locator('h1')).toHaveText('Lund Services');
});

test('private opportunity journey saves stage and follow-up and opens from Today', async ({ page, app }) => {
  const customer = await seedCustomer(app);
  await page.goto(route(app, 'customer', customer.id));
  await page.getByRole('link', { name: 'New opportunity', exact: true }).click();
  await page.getByLabel('Opportunity title').fill('Service team rollout');
  await page.getByLabel('Product', { exact: true }).selectOption('tradey');
  await page.getByLabel('Stage', { exact: true }).selectOption('contacted');
  await page.getByLabel('Next follow-up').fill('2020-11-19');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.locator('h1')).toHaveText('Service team rollout');
  const op = (await state(app)).opportunities[0];
  expect(op).toMatchObject({ customerId: customer.id, product: 'tradey', stage: 'contacted', nextFollowUp: '2020-11-19' });
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('link', { name: 'Service team rollout', exact: true }).click();
  await expect(page).toHaveURL(route(app, 'opportunity', op.id));
  await page.reload(); await ready(page);
  await expect(page.getByRole('link', { name: 'Holm & Co', exact: true }).first()).toBeVisible();
});

test('saved quote uses atomic current price then stays unchanged through catalogue edits and print', async ({ page, app }) => {
  const customer = await seedCustomer(app, { notes: 'PRIVATE CUSTOMER SECRET', contacts: [{ name: 'Alex Holm', email: 'alex@example.test', phone: '+45 87654321' }] });
  const op = (await app.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id))).body.item;
  await page.goto(route(app, 'opportunity', op.id));
  await page.getByRole('link', { name: 'New quote', exact: true }).click();
  await expect(page.getByLabel('Agreed monthly price (DKK)')).toHaveValue('');
  await expect(page.getByLabel('Package', { exact: true })).toHaveValue('workslip-core');
  // Another edit after this form opened: blank means the server's current price.
  const catalog = (await state(app)).catalog;
  await app.call('PUT', '/api/backoffice/catalog', { revision: catalog.revision, packages: catalog.packages.map(p => p.id === 'workslip-core' ? { ...p, monthlyMinor: 99900 } : p), demos: catalog.demos });
  await page.getByLabel('Setup amount (DKK)').fill('1250.50');
  await page.getByLabel('Valid until').fill('2030-12-31');
  await page.getByLabel('Quote terms').fill('Includes onboarding.');
  const post = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/backoffice/quotes'));
  await page.getByRole('button', { name: 'Save quote', exact: true }).click();
  expect((await post).postDataJSON()).not.toHaveProperty('monthlyMinor');
  await expect(page.locator('#workspace-result')).toContainText('Quote saved');
  const quote = (await state(app)).quotes[0];
  expect(quote).toMatchObject({ monthlyMinor: 99900, setupMinor: 125050, snapshot: { customer: { name: 'Holm & Co' } } });
  await page.getByRole('link', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('link', { name: 'Workslip Core', exact: true }).click();
  await page.getByLabel('Monthly price (DKK)', { exact: true }).fill('1199');
  await page.getByRole('button', { name: 'Save package', exact: true }).click();
  await expect(page.locator('#workspace-result')).toContainText('Package saved');
  expect((await state(app)).catalog.packages[0].monthlyMinor).toBe(119900);
  await app.call('PUT', '/api/backoffice/customers/' + customer.id, { name: 'Renamed Company', contacts: [], notes: 'NEW PRIVATE SECRET', revision: customer.revision });
  await page.goto(route(app, 'quote', quote.id)); await ready(page);
  await expect(page.locator('#quote-preview')).toContainText('Holm & Co');
  await expect(page.locator('#quote-preview')).toContainText('DKK 999');
  await expect(page.locator('#quote-preview')).not.toContainText('PRIVATE CUSTOMER SECRET');
  await page.getByLabel('Quote status', { exact: true }).selectOption('sent');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await expect(page.locator('#workspace-result')).toContainText('Status changed to Sent. No email was sent.');
  expect((await state(app)).quotes[0]).toMatchObject({ status: 'sent', monthlyMinor: 99900, snapshot: quote.snapshot });
  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'true'; }; });
  await page.getByRole('button', { name: 'Print / save PDF', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'true');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#quote-preview')).toBeVisible();
  await expect(page.locator('.workspace-nav')).toBeHidden();
  await expect(page.locator('#activity')).toBeHidden();
  await expect(page.locator('#quote-preview')).toContainText('Alex Holm');
  await expect(page.locator('#quote-preview')).toContainText('1,250.50');
  await expect(page.locator('#quote-preview')).toContainText('Includes onboarding.');
  await expect(page.locator('body')).not.toContainText('PRIVATE CUSTOMER SECRET');
});

for (const customProduct of ['tradey', 'shippy']) test(`custom ${customProduct} quote preselects matching package and requires an explicit agreed price`, async ({ page, app }) => {
  const customer = await seedCustomer(app);
  const op = (await app.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id, { product: customProduct }))).body.item;
  await page.goto(route(app, 'opportunity', op.id));
  await page.getByRole('link', { name: 'New quote', exact: true }).click();
  await expect(page.getByLabel('Package', { exact: true })).toHaveValue(customProduct + '-custom');
  await page.getByRole('button', { name: 'Save quote', exact: true }).click();
  expect(await app.count('sales_quotes')).toBe(0);
  await expect(page.getByLabel('Agreed monthly price (DKK)')).toHaveAttribute('required', '');
  await page.getByLabel('Agreed monthly price (DKK)').fill('1250.50');
  await page.getByRole('button', { name: 'Save quote', exact: true }).click();
  await expect(page.locator('h1')).toHaveText((customProduct === 'tradey' ? 'Tradey' : 'Shippy') + ' quote');
  expect((await state(app)).quotes[0]).toMatchObject({ monthlyMinor: 125050, snapshot: { package: { product: customProduct, id: customProduct + '-custom' } } });
});

test('Today surfaces new public enquiries without follow-up dates', async ({ page, app }) => {
  await app.call('POST', '/api/enquiries', enquiryInput({ company: 'New Enquiry Ltd', product: 'tradey', packageId: 'tradey-custom' }));
  await page.goto(route(app)); await ready(page);
  await expect(page.getByRole('heading', { name: 'New enquiries', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Tradey enquiry: Tradey', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Tradey enquiry: Tradey');
  await page.getByRole('link', { name: 'New Enquiry Ltd', exact: true }).first().click();
  await expect(page.locator('h1')).toHaveText('New Enquiry Ltd');
  await page.getByRole('link', { name: 'Tradey enquiry: Tradey', exact: true }).click();
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Tradey enquiry: Tradey');
});

test('Today keeps older due work, enquiries, open quotes and customer links beyond the recent workspace', async ({ page, app }) => {
  const old = await seedSalesQueue(app, 1, { prefix: 'Older' });
  await seedSalesQueue(app, 105, { matching: false, now: '2035-01-01T12:00:00.000Z', prefix: 'Newer' });
  await page.goto(route(app)); await ready(page);
  await expect(page.getByRole('link', { name: 'Older followUps 0', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Older enquiries 0', exact: true })).toBeVisible();
  await expect(page.locator(`a[href*="${old.quotes[0].id}"]`)).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Latest records');
  await page.getByRole('link', { name: 'Older customer', exact: true }).first().click();
  await expect(page.locator('h1')).toHaveText('Older customer');
  await page.goBack(); await ready(page);
  await page.getByRole('link', { name: 'Older followUps 0', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Older followUps 0');
});

test('Today queue pages retain their address on reload, record Back and other queue navigation', async ({ page, app }) => {
  await seedSalesQueue(app, 27);
  await page.goto(route(app)); await ready(page);
  const followUps = page.locator('#today-follow-ups');
  await expect(followUps.locator('.record-card')).toHaveCount(25);
  await page.getByRole('link', { name: 'More follow-ups', exact: true }).click(); await ready(page);
  const second = page.url();
  expect(second).toContain('followUpsAfter=');
  expect(second).toContain('date=');
  await expect(followUps.locator('.record-card')).toHaveCount(2);
  await page.reload(); await ready(page);
  await expect(followUps.locator('.record-card')).toHaveCount(2);
  await followUps.locator('.record-card h3 a').first().click();
  await expect(page.locator('h1')).not.toHaveText('Today');
  await page.goBack(); await ready(page);
  expect(page.url()).toBe(second);
  await expect(followUps.locator('.record-card')).toHaveCount(2);
  await page.getByRole('link', { name: 'More enquiries', exact: true }).click(); await ready(page);
  await expect(page.locator('#today-enquiries .record-card')).toHaveCount(2);
  await expect(followUps.locator('.record-card')).toHaveCount(2);
  await page.getByRole('link', { name: 'More quotes', exact: true }).click(); await ready(page);
  await expect(page.locator('#today-quotes .record-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Open quotes', exact: true })).toBeInViewport();
  await page.getByRole('link', { name: 'First follow-ups', exact: true }).click(); await ready(page);
  await expect(followUps.locator('.record-card')).toHaveCount(25);
  await expect(page.locator('#today-enquiries .record-card')).toHaveCount(2);
  await expect(page.locator('#today-quotes .record-card')).toHaveCount(2);
});

test('failed load ends busy state and offers retry without false empty counts', async ({ page, app }) => {
  await seedCustomer(app);
  let fail = true;
  await page.route('**/api/backoffice/today?*', async r => fail ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Sales storage is unavailable. Please try again later.' }) }) : r.continue());
  await page.goto(route(app));
  await expect(page.getByRole('alert')).toContainText('Sales storage is unavailable');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('No customers');
  await expect(page.locator('main')).not.toContainText('0 customers');
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click(); await ready(page);
  await expect(page.locator('h1')).toHaveText('Today');
});

test('stale customer edit keeps input and explicitly reloads latest revision before retry', async ({ page, app }) => {
  const customer = await seedCustomer(app);
  await page.goto(route(app, 'customer-edit', customer.id)); await ready(page);
  await page.getByLabel('Company name', { exact: true }).fill('My unsaved company');
  await app.call('PUT', '/api/backoffice/customers/' + customer.id, { name: 'Changed elsewhere', contacts: customer.contacts, notes: customer.notes, revision: customer.revision });
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('My unsaved company');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click(); await ready(page);
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Changed elsewhere');
  await page.getByLabel('Company name', { exact: true }).fill('Agreed company');
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Agreed company');
  expect((await state(app)).customers[0].revision).toBe(3);
});

test('private text is safe and records never enter browser storage or service worker caches', async ({ page, app }) => {
  const name = '<img src=x onerror=alert(1)> & Co';
  const customer = await seedCustomer(app, { name, notes: '<script>window.compromised=true</script>' });
  const response = await page.goto(route(app, 'customer', customer.id)); await ready(page);
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('h1')).toHaveText(name);
  expect(await page.evaluate(() => ({ compromised: !!window.compromised, local: localStorage.length, session: sessionStorage.length, images: document.querySelectorAll('main img').length, scripts: document.querySelectorAll('main script').length }))).toEqual({ compromised: false, local: 0, session: 0, images: 0, scripts: 0 });
  expect(await page.evaluate(async () => ({ caches: await caches.keys(), registrations: (await navigator.serviceWorker.getRegistrations()).length }))).toEqual({ caches: [], registrations: 0 });
});

test('specific records and missing linked customers load beyond the bounded state list', async ({ page, app }) => {
  const customer = await seedCustomer(app, { name: 'Outside first page' });
  const op = (await app.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id))).body.item;
  const quote = (await app.call('POST', '/api/backoffice/quotes', quoteInput(customer.id, { opportunityId: op.id }))).body.item;
  // Seed real records newer than the target in every independently bounded list.
  // The browser uses the genuine state limit and individual record endpoints.
  const now = '2035-11-19T12:00:00.000Z';
  const statements = [];
  for (let index = 0; index < 101; index++) {
    const c = { ...customer, id: crypto.randomUUID(), name: 'Recent company ' + index, createdAt: now, updatedAt: now };
    const o = { ...op, id: crypto.randomUUID(), customerId: c.id, title: 'Recent opportunity ' + index, createdAt: now, updatedAt: now };
    const q = { ...quote, id: crypto.randomUUID(), customerId: c.id, opportunityId: o.id, snapshot: { ...quote.snapshot, customer: c }, createdAt: now, updatedAt: now };
    statements.push(app.db.prepare('INSERT INTO sales_customers (id,revision,created_at,updated_at,document) VALUES (?,1,?,?,?)').bind(c.id, now, now, JSON.stringify(c)));
    statements.push(app.db.prepare('INSERT INTO sales_opportunities (id,customer_id,revision,created_at,updated_at,document) VALUES (?,?,1,?,?,?)').bind(o.id, c.id, now, now, JSON.stringify(o)));
    statements.push(app.db.prepare('INSERT INTO sales_quotes (id,customer_id,opportunity_id,revision,created_at,updated_at,document) VALUES (?,?,?,1,?,?,?)').bind(q.id, c.id, o.id, now, now, JSON.stringify(q)));
  }
  await app.db.batch(statements);
  const bounded = await state(app);
  expect(bounded.truncated).toBe(true);
  expect(bounded.customers.some(c => c.id === customer.id)).toBe(false);
  expect(bounded.opportunities.some(o => o.id === op.id)).toBe(false);
  expect(bounded.quotes.some(q => q.id === quote.id)).toBe(false);
  await page.goto(route(app, 'opportunity', op.id)); await ready(page);
  await expect(page.getByRole('link', { name: 'Outside first page', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'New quote', exact: true }).click();
  await expect(page.getByLabel('Customer', { exact: true })).toHaveValue(customer.id);
  await expect(page.getByLabel('Opportunity', { exact: true })).toHaveValue(op.id);
  await page.goto(route(app, 'quote', quote.id)); await ready(page);
  await expect(page.locator('#quote-preview')).toContainText('Outside first page');
  await page.getByRole('link', { name: 'Outside first page', exact: true }).first().click();
  await expect(page.locator('h1')).toHaveText('Outside first page');
  await page.goto(route(app, 'customers')); await ready(page);
  await expect(page.locator('main')).toContainText('Latest records');
  await expect(page.locator('main')).not.toContainText('No customers yet');
  await page.getByLabel('Open customer by record ID', { exact: true }).fill(customer.id);
  await page.getByRole('button', { name: 'Open record', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Outside first page');
  const limited = 'No matching records in this recent page. Older records remain available at their saved links.';
  await expect(page.locator('main')).toContainText(limited);
  await expect(page.locator('main')).not.toContainText('record ID below');
  await expect(page.getByLabel('Open customer by record ID', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Today', exact: true }).click(); await ready(page);
  await expect(page.locator('main')).toContainText('No follow-ups due.');
  await expect(page.locator('main')).not.toContainText('Latest records');
  await expect(page.locator('main')).not.toContainText('record ID below');
});

test('unauthorized private origin fails closed and expired API access has a finished error state', async ({ page, app }) => {
  const denied = await startCommercialSite({ verifyIdentity: async () => null });
  try {
    const response = await page.request.get(route(denied));
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.text()).not.toContain('workspace-nav');
  } finally { await denied.close(); }
  await page.route('**/api/backoffice/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in with an authorized account."}' }));
  await page.goto(route(app));
  await expect(page.getByRole('alert')).toContainText('Sign in');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('private save failure ends busy state and preserves entries for a real D1 retry', async ({ page, app }) => {
  await app.db.prepare("CREATE TRIGGER stop_customer BEFORE INSERT ON sales_customers BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END").run();
  await page.goto(route(app, 'customer-new')); await ready(page);
  await page.getByLabel('Company name', { exact: true }).fill('Retry Company');
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sales storage is unavailable');
  await expect(page.getByRole('button', { name: 'Save customer', exact: true })).toBeEnabled();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Retry Company');
  expect(await app.count('sales_customers')).toBe(0);
  await app.db.prepare('DROP TRIGGER stop_customer').run();
  await page.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Retry Company');
  expect(await app.count('sales_customers')).toBe(1);
});

test('stale catalogue and quote status edits recover without overwriting newer changes', async ({ page, app }) => {
  const customer = await seedCustomer(app);
  const quote = (await app.call('POST', '/api/backoffice/quotes', quoteInput(customer.id))).body.item;
  await page.goto(route(app, 'package', 'workslip-core')); await ready(page);
  await page.getByLabel('Monthly price (DKK)', { exact: true }).fill('1200');
  const catalog = (await state(app)).catalog;
  await app.call('PUT', '/api/backoffice/catalog', { revision: catalog.revision, packages: catalog.packages.map(p => p.id === 'workslip-core' ? { ...p, monthlyMinor: 110000 } : p), demos: catalog.demos });
  await page.getByRole('button', { name: 'Save package', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Monthly price (DKK)', { exact: true })).toHaveValue('1200');
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click(); await ready(page);
  await expect(page.getByLabel('Monthly price (DKK)', { exact: true })).toHaveValue('1100');
  await page.getByLabel('Included features', { exact: true }).fill('Work slips\nCustomer management');
  await page.getByRole('button', { name: 'Save package', exact: true }).click();
  await expect(page.locator('#workspace-result')).toContainText('Package saved');
  expect((await state(app)).catalog.packages[0].includes).toEqual(['Work slips', 'Customer management']);
  await page.goto(route(app, 'quote', quote.id)); await ready(page);
  await page.getByLabel('Quote status', { exact: true }).selectOption('sent');
  await app.call('PUT', '/api/backoffice/quotes/' + quote.id, { revision: quote.revision, status: 'accepted' });
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  expect((await state(app)).quotes[0].status).toBe('accepted');
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click(); await ready(page);
  await expect(page.getByLabel('Quote status', { exact: true })).toHaveValue('accepted');
  await expect(page.locator('#quote-preview')).toContainText('DKK 899');
});

test('opportunity edits keep revision and next step and missing records have an explicit error', async ({ page, app }) => {
  const customer = await seedCustomer(app);
  const op = (await app.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.id))).body.item;
  await page.goto(route(app, 'opportunity-edit', op.id)); await ready(page);
  await page.getByLabel('Stage', { exact: true }).selectOption('won');
  await page.getByLabel('Next follow-up').fill('');
  await page.getByRole('button', { name: 'Save opportunity', exact: true }).click();
  await expect(page.locator('#workspace-result')).toContainText('Opportunity saved');
  expect((await state(app)).opportunities[0]).toMatchObject({ revision: 2, stage: 'won', nextFollowUp: null });
  await page.getByRole('link', { name: 'Today', exact: true }).click(); await ready(page);
  await expect(page.locator('main')).not.toContainText(op.title);
  await page.goto(route(app, 'customer', '00000000-0000-4000-8000-000000000000')); await ready(page);
  await expect(page.locator('h1')).toHaveText('Record not found');
  await expect(page.getByRole('alert')).toContainText('not found');
});

test('public worker graphs exclude the new private page and its entry bundle', async ({ page, app }) => {
  const html = await (await page.request.get(route(app))).text();
  const privateEntries = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  expect(privateEntries.length).toBeGreaterThan(0);
  for (const product of ['workslip', 'tradey', 'shippy']) {
    const worker = await (await page.request.get(app.base + product + '/sw.js')).text();
    const paths = JSON.parse(worker.match(/const PRECACHE = (\[[^\n]+\]);/)[1]);
    expect(paths.some(path => /backoffice|^\/api\//.test(path))).toBe(false);
    for (const privateEntry of privateEntries) expect(paths).not.toContain(privateEntry);
  }
});

test('keyboard skip link preserves native fragment focus and scroll on a query-addressed record', async ({ page, app }) => {
  const customer = await seedCustomer(app, { notes: Array(30).fill('Private customer note.').join('\n') });
  const address = route(app, 'customer', customer.id);
  await page.goto(address); await ready(page);
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(address + '#main');
  await expect(page.locator('main')).toBeFocused();
  await expect.poll(() => page.locator('main').evaluate(main => Math.round(main.getBoundingClientRect().top))).toBeLessThanOrEqual(32);
  await expect(page.locator('h1')).toHaveText('Holm & Co');
  // A normal record-query link still changes views after fragment navigation.
  await page.getByRole('link', { name: 'Customers', exact: true }).click(); await ready(page);
  await expect(page).toHaveURL(route(app, 'customers'));
  await page.getByRole('link', { name: 'Holm & Co', exact: true }).click(); await ready(page);
  await expect(page).toHaveURL(address);
  const customers = page.getByRole('link', { name: 'Customers', exact: true });
  await page.evaluate(() => {
    document.addEventListener('click', event => { window.modifiedLinkPrevented = event.defaultPrevented; }, { once: true });
  });
  await customers.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  expect(await page.evaluate(() => window.modifiedLinkPrevented)).toBe(false);
  await expect(page).toHaveURL(address);
  await customers.evaluate(anchor => { anchor.target = '_blank'; });
  const targetPopup = page.waitForEvent('popup');
  await customers.click();
  const target = await targetPopup; await ready(target);
  await expect(target).toHaveURL(route(app, 'customers'));
  await expect(page).toHaveURL(address);
  await target.close();
});
