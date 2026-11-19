import { test, expect } from './fixtures.mjs';
import { initialCatalog } from '../../commercial/shared/catalog.mjs';

async function fillEnquiry(page) {
  await page.getByLabel('Company', { exact: true }).fill('Holm & Co');
  await page.getByLabel('Your name', { exact: true }).fill('Alex Jensen');
  await page.getByLabel('Email', { exact: true }).fill('alex@example.test');
}

test('saved catalogue prices, text and demo availability appear without HTML injection', async ({ page, app }) => {
  const { currency, ...updated } = structuredClone(initialCatalog);
  updated.packages[0].monthlyMinor = 123450;
  updated.packages[0].name = '<img src=x onerror="window.injected=true">';
  updated.demos.find(demo => demo.id === 'shippy').active = false;
  expect((await app.call('PUT', '/api/backoffice/catalog', updated)).status).toBe(200);
  await page.goto(app.base + 'pricing/?product=%3Cscript%3E&package=%3Cimg%3E');
  await expect(page.locator('#catalog-status')).toContainText('Current starting prices');
  await expect(page.locator('#package-list')).toContainText('DKK 1,234.50');
  await expect(page.locator('#package-list h2').first()).toHaveText(updated.packages[0].name);
  expect(await page.locator('#package-list img').count()).toBe(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('#product')).toHaveValue('workslip');
  await expect(page.locator('#package')).toHaveValue('');
  await page.goto(app.base);
  await expect(page.locator('#catalog-status')).toContainText('Ready to try');
  await expect(page.getByRole('link', { name: 'Try Shippy', exact: true })).toBeHidden();
});

test('a failed catalogue shows an error beside starting prices and a retry restores live data', async ({ page, app }) => {
  await page.route('**/api/catalog', route => route.abort('failed'));
  await page.goto(app.base + 'pricing/');
  await expect(page.locator('#catalog-status')).toContainText('could not be checked');
  await expect(page.locator('#catalog-status')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#package-list')).toContainText('DKK 899');
  await page.unroute('**/api/catalog');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#catalog-status')).toContainText('Current starting prices');
  await expect(page.locator('#retry-catalog')).toBeHidden();
});

test('pending and lost-response retries keep one UUID and one real D1 enquiry', async ({ page, app }) => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const bodies = [], writeHeaders = [];
  let attempts = 0;
  await page.route('**/api/enquiries', async route => {
    const request = route.request(); bodies.push(request.postDataJSON()); writeHeaders.push(request.headers());
    const response = await route.fetch();
    if (attempts++ === 0) { await hold; await route.abort('failed'); }
    else await route.fulfill({ response });
  });
  try {
    await page.goto(app.base + 'pricing/?product=workslip&package=workslip-core#enquiry');
    await fillEnquiry(page);
    await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
    await expect(page.locator('#enquiry-form')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#enquiry-result')).toHaveText('Sending your request…');
    await expect(page.getByRole('button', { name: 'Request a quote', exact: true })).toBeDisabled();
    await expect.poll(() => app.count('sales_customers')).toBe(1);
    release();
    await expect(page.locator('#enquiry-result')).toContainText('could not confirm');
    await expect(page.locator('#enquiry-form')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Request a quote', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
    await expect(page.locator('#enquiry-result')).toContainText('Request received');
    expect(bodies.length).toBe(2);
    expect(bodies[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(writeHeaders[0]['x-requested-with']).toBe('MRSoftware');
    expect(writeHeaders[0]['content-type']).toBe('application/json');
    expect(writeHeaders[0].origin).toBe(new URL(app.base).origin);
    expect(await app.count('sales_customers')).toBe(1);
    expect(await app.count('sales_opportunities')).toBe(1);
    expect(await app.count('sales_enquiries')).toBe(1);
    const customer = await app.db.prepare('SELECT document FROM sales_customers').first();
    expect(JSON.parse(customer.document).name).toBe('Holm & Co');
    const stored = await page.evaluate(() => Object.values(sessionStorage).join(' '));
    expect(stored).not.toContain('alex@example.test');
    expect(stored).not.toContain('Holm & Co');
    await page.reload();
    await expect(page.locator('#enquiry-result')).toContainText('Request received');
  } finally { release(); }
});

test('a real D1 failure ends busy state, retains fields and permits a safe retry', async ({ page, app }) => {
  await app.db.prepare("CREATE TRIGGER reject_public_customer BEFORE INSERT ON sales_customers BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END").run();
  await page.goto(app.base + 'pricing/?product=tradey#enquiry');
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('could not confirm');
  await expect(page.locator('#enquiry-form')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('Company', { exact: true })).toHaveValue('Holm & Co');
  expect(await app.count('sales_customers')).toBe(0);
  expect(await app.count('sales_enquiries')).toBe(0);
  await app.db.prepare('DROP TRIGGER reject_public_customer').run();
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('Request received');
  expect(await app.count('sales_customers')).toBe(1);
});

test('network quota errors give a clear wait without claiming receipt', async ({ page, app }) => {
  for (let index = 0; index < 5; index++) {
    const result = await app.call('POST', '/api/enquiries', { requestId: crypto.randomUUID(), company: `Synthetic ${index}`, name: 'Synthetic Prospect', email: `prospect${index}@example.test`, product: 'shippy', packageId: '', message: '', website: '' });
    expect(result.status).toBe(201);
  }
  await page.goto(app.base + 'pricing/?product=shippy#enquiry');
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('Please try again in an hour');
  await expect(page.locator('#enquiry-form')).not.toHaveAttribute('aria-busy', 'true');
  expect(await app.count('sales_enquiries')).toBe(5);
});

test('a previous receipt is not claimed for a different product and changed form context survives reload', async ({ page, app }) => {
  await page.goto(app.base + 'pricing/?product=workslip&package=workslip-core#enquiry');
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('Request received');
  await page.goto(app.base + 'pricing/?product=shippy#enquiry');
  await expect(page.locator('#enquiry-result')).toBeHidden();
  await page.locator('#product').selectOption('tradey');
  await fillEnquiry(page);
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('Request received');
  await page.reload();
  await expect(page.locator('#product')).toHaveValue('tradey');
  await expect(page.locator('#enquiry-result')).toContainText('Request received');
  expect(await app.count('sales_enquiries')).toBe(2);
});
