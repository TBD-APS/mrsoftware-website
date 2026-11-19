import { test, expect } from './fixtures.mjs';

test('public routes open exact seeded records and actions survive reload', async ({ page, app }) => {
  const response = await page.goto(app.base);
  expect(response.status()).toBe(200);
  await page.getByRole('link', { name: 'Try Workslip' }).click();
  await expect(page).toHaveURL(app.base + 'workslip/jobs/ws-1042/');
  await page.getByLabel('Water supply checked').check();
  await page.getByLabel('Connections tested').check();
  await page.getByLabel('Minutes worked').fill('45');
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('45 minutes saved');
  await page.reload();
  await expect(page.getByLabel('Water supply checked')).toBeChecked();
  await expect(page.locator('#history')).toContainText('45 minutes');
});

test('offer approval creates a stable order and delivery records its receiver', async ({ page, app }) => {
  await page.goto(app.base + 'tradey/offers/offer-1048/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Summer produce');
  await page.getByRole('button', { name: 'Approve offer', exact: true }).click();
  await expect(page).toHaveURL(app.base + 'tradey/orders/order-1048/');
  await expect(page.locator('#scenario-result')).toContainText('Order created');
  await page.reload();
  await expect(page.locator('#scenario-result')).toContainText('Order created');
  await page.goto(app.base + 'shippy/shipments/shp-2048/');
  await page.getByLabel('Received by').fill('Alex Jensen');
  await page.getByRole('button', { name: 'Complete delivery', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('Delivered to Alex Jensen');
});

test('manual material lookup rejects foreign URLs and finds the fixed material', async ({ page, app }) => {
  await page.goto(app.base + 'workslip/');
  await page.getByLabel('Material code or demo link').fill('https://example.org/workslip/materials/mat-101/');
  await page.getByRole('button', { name: 'Find material' }).click();
  await expect(page.locator('#scan-result')).toContainText('Use MAT-101');
  await page.getByLabel('Material code or demo link').fill('MAT-101');
  await page.getByRole('button', { name: 'Find material' }).click();
  await expect(page).toHaveURL(app.base + 'workslip/materials/mat-101/');
  await expect(page.locator('h1')).toContainText('Copper pipe 15 mm');
});

test('pricing sends a real enquiry and shows only its safe receipt', async ({ page, app }) => {
  await page.goto(app.base + 'pricing/?product=workslip&package=workslip-core#enquiry');
  await expect(page.locator('#package')).toHaveValue('workslip-core');
  await page.getByLabel('Company', { exact: true }).fill('Holm & Co');
  await page.getByLabel('Your name', { exact: true }).fill('Alex Jensen');
  await page.getByLabel('Email', { exact: true }).fill('alex@example.test');
  await page.getByRole('button', { name: 'Request a quote', exact: true }).click();
  await expect(page.locator('#enquiry-result')).toContainText('Request received');
  expect(await app.count('sales_customers')).toBe(1);
  expect(await app.count('sales_opportunities')).toBe(1);
});

test('material results belong to the material and a reset preserves the other product', async ({ page, app }) => {
  await page.goto(app.base + 'tradey/offers/offer-1048/');
  await page.getByRole('button', { name: 'Approve offer', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('Order created');
  await page.goto(app.base + 'workslip/jobs/ws-1042/');
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('30 minutes saved');
  await page.goto(app.base + 'workslip/materials/mat-101/');
  await expect(page.locator('#scenario-result')).toHaveText('12 metres available');
  await page.getByLabel('Metres used').fill('2');
  await page.getByRole('button', { name: 'Use material' }).click();
  await expect(page.locator('#scenario-result')).toContainText('10 metres available');
  await page.reload();
  await expect(page.locator('#material-quantity')).toHaveText('10');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.locator('#material-quantity')).toHaveText('12');
  await page.goto(app.base + 'tradey/orders/order-1048/');
  await expect(page.locator('#scenario-result')).toContainText('Order created');
});

test('blocked browser storage still permits actions with a visible warning', async ({ page, app }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } }); });
  await page.goto(app.base + 'workslip/jobs/ws-1042/');
  await expect(page.locator('#storage-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('30 minutes saved');
  await expect(page.locator('#history')).toContainText('30 minutes');
});

test('using all material clearly ends the stock action and a reset makes it available again', async ({ page, app }) => {
  await page.goto(app.base + 'workslip/materials/mat-101/');
  await page.getByLabel('Metres used').fill('12');
  await page.getByRole('button', { name: 'Use material', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('0 metres available');
  await expect(page.locator('#quantity-form button')).toBeDisabled();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.locator('#quantity-form button')).toBeEnabled();
  await expect(page.locator('#material-quantity')).toHaveText('12');
});
