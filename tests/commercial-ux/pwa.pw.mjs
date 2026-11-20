import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.mjs';
import { products, productRoutes } from '../../commercial/src/data/scenarios.mjs';

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
  await expect(page.locator('#scenario-result')).toContainText('30 minutes recorded');
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

test('a changed shell and module stay in one generation before and after explicit activation', async ({ page, context, app }) => {
  const route = '/workslip/jobs/ws-1042/';
  const originalHtml = await readFile(new URL('../../.commercial-dist/workslip/jobs/ws-1042/index.html', import.meta.url), 'utf8');
  const originalModule = originalHtml.match(/<script\b[^>]*src="([^\"]*Scenario[^\"]+\.js)"/)?.[1];
  expect(originalModule).toBeTruthy();
  const nextModule = '/_astro/Scenario.generation-two.js';
  const originalWorker = await readFile(new URL('../../.commercial-dist/workslip/sw.js', import.meta.url), 'utf8');
  const originalList = JSON.parse(originalWorker.match(/const PRECACHE = (\[[^\n]+\]);/)[1]);
  const nextList = originalList.map(path => path === originalModule ? nextModule : path);
  expect(nextList).toContain(nextModule);
  expect(nextList).not.toContain(originalModule);

  await page.goto(new URL(route, app.base).href);
  await controlled(page);
  const oldCache = await page.evaluate(async () => (await caches.keys()).find(name => name.startsWith('mrsoftware-workslip-')));
  await page.getByLabel('Minutes worked').fill('21');
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('21 minutes recorded');

  // Simulate a real deployment: changed HTML imports a new content-addressed
  // module, and the waiting worker precaches that complete new dependency set.
  for (const path of productRoutes('workslip')) {
    const html = await readFile(new URL(`../../.commercial-dist${path}index.html`, import.meta.url), 'utf8');
    app.assetOverrides.set(path, html.replaceAll(originalModule, nextModule).replace(/<h1(?=[ >])/, '<h1 data-shell-generation="two"'));
  }
  const moduleBody = await readFile(new URL(`../../.commercial-dist${originalModule}`, import.meta.url), 'utf8');
  app.assetOverrides.set(nextModule, moduleBody + '\ndocument.documentElement.dataset.demoModuleGeneration = "two";\n');
  app.assetOverrides.set('/workslip/sw.js', originalWorker
    .replace(/const CACHE = PREFIX \+ '[^']+';/, "const CACHE = PREFIX + 'coherent-generation-two';")
    .replace(/const PRECACHE = \[[^\n]+\];/, `const PRECACHE = ${JSON.stringify(nextList)};`));
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration('/workslip/'); await registration.update(); });
  await expect(page.locator('#update-notice')).toBeVisible();
  await page.reload();
  // Continue after this soft assertion so RED also reproduces the broken
  // offline action caused by the uncached new module, rather than just markup.
  expect.soft(await page.locator('h1').getAttribute('data-shell-generation')).toBeNull();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Minutes worked').fill('32');
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('32 minutes recorded');
  expect(await page.locator('h1').getAttribute('data-shell-generation')).toBeNull();
  const oldHtml = await page.evaluate(async ({ name, path }) => (await (await caches.open(name)).match(path)).text(), { name: oldCache, path: route });
  expect(oldHtml).toContain(originalModule);
  expect(oldHtml).not.toContain(nextModule);
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/workslip/')).waiting))).toBe(true);

  await context.setOffline(false);
  // A missing HTML entry must not adopt the next deployment either, including
  // an ordinary fetch whose mode is not "navigate". Activation restores the
  // complete new generation after this simulated cache eviction.
  const missingShell = await page.evaluate(async name => {
    const cache = await caches.open(name);
    await cache.delete('/workslip/');
    const response = await fetch('/workslip/');
    return { html: await response.text(), cached: Boolean(await cache.match('/workslip/')) };
  }, oldCache);
  expect(missingShell.html).toContain('data-shell-generation="two"');
  expect(missingShell.cached).toBe(false);
  await page.reload();
  await expect(page.locator('#update-notice')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update demo', exact: true }).click()]);
  await expect(page.locator('h1')).toHaveAttribute('data-shell-generation', 'two');
  await expect(page.locator('html')).toHaveAttribute('data-demo-module-generation', 'two');
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(oldCache);
  const newEntries = await page.evaluate(async () => (await (await caches.open('mrsoftware-workslip-coherent-generation-two')).keys()).map(request => new URL(request.url).pathname));
  expect(newEntries).toContain(nextModule);
  expect(newEntries).not.toContain(originalModule);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveAttribute('data-shell-generation', 'two');
  await expect(page.locator('html')).toHaveAttribute('data-demo-module-generation', 'two');
  await page.getByLabel('Minutes worked').fill('47');
  await page.getByRole('button', { name: 'Save time', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('47 minutes recorded');
  await page.goto(new URL('/workslip/materials/mat-101/', app.base).href);
  await expect(page.locator('html')).toHaveAttribute('data-demo-module-generation', 'two');
  await page.getByRole('button', { name: 'Use material', exact: true }).click();
  await expect(page.locator('#scenario-result')).toContainText('11 metres available');
  await context.setOffline(false);
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
