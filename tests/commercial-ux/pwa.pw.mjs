import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.mjs';
import { products } from '../../commercial/src/data/scenarios.mjs';

async function controlled(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
test('each manifest has its own identity, scoped start and real 192/512 PNG icons', async ({ page, app }) => {
  const ids = [];
  for (const [product, item] of Object.entries(products)) {
    const response = await page.request.get(app.base + product + '/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json(); ids.push(manifest.id);
    expect(manifest.scope).toBe(`/${product}/`);
    expect(manifest.start_url).toBe(item.route);
    expect(manifest.name).toBe(`${item.name} demo`);
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
      const bytes = await (await page.request.get(new URL(icon.src, app.base).href)).body();
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
    }
  }
  expect(new Set(ids).size).toBe(3);
});

test('offline examples retain actions and never cache APIs or private/other-product routes', async ({ page, context, app }) => {
  for (const [product] of Object.entries(products)) {
    await page.goto(app.base + product + '/install/');
    await controlled(page);
    await expect(page.locator('#pwa-status')).toContainText('ready to use offline');
  }
  const before = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = {};
    for (const name of names) entries[name] = (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
    return entries;
  });
  expect(Object.keys(before).length).toBe(3);
  for (const [name, paths] of Object.entries(before)) {
    const product = Object.keys(products).find(product => name.startsWith(`mrsoftware-${product}-`));
    expect(product).toBeTruthy();
    expect(paths.some(path => path.startsWith('/api/') || /backoffice/i.test(path))).toBe(false);
    expect(paths.every(path => path.startsWith(`/${product}/`) || path.startsWith('/_astro/') || path.startsWith('/assets/'))).toBe(true);
    for (const other of Object.keys(products).filter(item => item !== product)) expect(paths.some(path => path.startsWith(`/${other}/`))).toBe(false);
  }
  await context.setOffline(true);
  await page.goto(app.base + products.workslip.route.slice(1));
  await expect(page.locator('#offline-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('30 minutes saved');
  await page.goto(app.base + 'workslip/materials/mat-101/');
  await page.getByRole('button', { name: 'Use material', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('11 metres available');
  await page.goto(app.base + products.tradey.route.slice(1));
  await page.getByRole('button', { name: 'Approve offer', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('Order created');
  await page.goto(app.base + products.shippy.route.slice(1));
  await page.getByLabel('Received by').fill('Alex Jensen');
  await page.getByRole('button', { name: 'Complete delivery', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('Delivered to Alex Jensen');
  const network = await page.evaluate(async () => {
    const result = [];
    for (const path of ['/api/catalog', '/api/backoffice/state', '/backoffice/']) result.push(await fetch(path).then(() => true, () => false));
    return result;
  });
  expect(network).toEqual([false, false, false]);
  await context.setOffline(false);
});

test('a waiting update is explicit and removes only this product’s older cache', async ({ page, app }) => {
  await page.goto(app.base + 'tradey/install/'); await controlled(page);
  await page.goto(app.base + 'workslip/install/'); await controlled(page);
  await page.evaluate(async () => { await caches.open('unrelated-application-cache'); });
  const oldNames = await page.evaluate(() => caches.keys());
  const original = await readFile(new URL('../../.commercial-dist/workslip/sw.js', import.meta.url), 'utf8');
  const next = original.replace(/const CACHE = PREFIX \+ '[^']+';/, "const CACHE = PREFIX + 'browser-update-v2';");
  expect(next).not.toBe(original);
  app.assetOverrides.set('/workslip/sw.js', next);
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration('/workslip/'); await registration.update(); });
  await expect(page.locator('#update-notice')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update demo', exact: true }).click()]);
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain('mrsoftware-workslip-browser-update-v2');
  const names = await page.evaluate(() => caches.keys());
  for (const name of oldNames) {
    if (name.startsWith('mrsoftware-workslip-')) expect(names).not.toContain(name);
    else expect(names).toContain(name);
  }
  await expect(page.locator('#pwa-status')).toContainText('ready to use offline');
});

test('a failed offline download ends loading and a visible retry completes the saved example', async ({ page, app }) => {
  app.assetOverrides.set('/workslip/qr/example.png', new Response('Synthetic unavailable asset', { status: 503 }));
  await page.goto(app.base + 'workslip/install/');
  await expect(page.locator('#pwa-status')).toContainText('Offline saving could not finish');
  await expect(page.locator('#pwa-status')).not.toHaveAttribute('aria-busy', 'true');
  app.assetOverrides.delete('/workslip/qr/example.png');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Try saving again', exact: true }).click()]);
  await expect(page.locator('#pwa-status')).toContainText('ready to use offline');
});

test('a demo worker refuses to save protected assets even when opened on the private origin', async ({ page, app }) => {
  await page.goto(app.privateBase + 'workslip/install/');
  await expect(page.locator('#pwa-status')).toContainText('Offline saving could not finish');
  const cached = await page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys()) entries.push(...await (await caches.open(name)).keys());
    return entries.map(request => request.url);
  });
  expect(cached).toEqual([]);
});
