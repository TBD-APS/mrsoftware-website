import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from './fixtures.mjs';
import { startSite } from '../../tools/ux-site.mjs';

test('a visitor reaches the feature showcase from home and follows all four guides to real results', async ({ page, context, app }, info) => {
  const company = await startSite();
  const base = company.base.replace('dashboard.mrsoftware.dk', '127.0.0.1');
  const origins = new Set([new URL(base).origin, new URL(app.base).origin]);
  try {
    await context.route('**/*', route => origins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    // Exercise the company's real 307, then send its public demo destination to
    // the actual local commercial app. No test action reaches production.
    await page.route(url => url.origin === new URL(base).origin && /^\/demos(?:\/|$)/.test(url.pathname), async route => {
      const response = await route.fetch({ maxRedirects: 0 });
      expect(response.status()).toBe(307);
      const target = new URL(response.headers().location);
      expect(target.origin).toBe('https://demos.mrsoftware.dk');
      await route.fulfill({ response, headers: { ...response.headers(), location: new URL(target.pathname, app.base).href } });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('.commercial-entrypoints').getByRole('link', { name: /^See live features/ }).click();
    await expect(page).toHaveURL(base + 'demo/#try-features');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('See the software at work.');
    await expect(page.locator('#report-example')).toContainText('Published data');
    await expect(page.locator('.feature-demo-intro')).toContainText('fictional records');
    await expect(page.locator('.feature-demo-intro')).toContainText('Changes stay in your browser');
    await expect.poll(() => page.locator('.report-preview img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    if (info.project.name === 'phone') await expect.poll(() => page.locator('.report-preview img').evaluate(image => image.currentSrc)).toContain('developed-by-package-compact.svg');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (info.project.name === 'desktop') {
      for (const width of [320, 375, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px keeps the showcase inside the page`).toBeLessThanOrEqual(1);
        for (const link of await page.locator('.feature-action a').all()) expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.locator('#try-features').screenshot({ path: info.outputPath('feature-showcase.png') });

    await page.locator('[data-related-from="feature-reports"]').getByRole('link').click();
    await expect(page).toHaveURL(base + 'roadmap/report/');
    const receipt = JSON.parse(await readFile(new URL('../../roadmap/report/export-receipt.json', import.meta.url), 'utf8'));
    await expect(page.locator('.mr-content')).toHaveAttribute('data-content-snapshot', receipt.snapshotHash);
    const pending = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Excel', exact: true }).click();
    const download = await pending;
    expect(createHash('sha256').update(await readFile(await download.path())).digest('hex')).toBe(receipt.files['roadmap.xlsx'].sha256);

    await page.goto(base + 'demo/#try-workslip');
    await page.locator('[data-related-from="feature-workslip"]').getByRole('link').click();
    await expect(page).toHaveURL(app.base + 'workslip/jobs/ws-1042/');
    await page.getByLabel('Water supply checked').check();
    await page.getByLabel('Connections tested').check();
    await page.getByLabel('Minutes worked').fill('45');
    await page.getByRole('button', { name: 'Save time', exact: true }).click();
    await page.reload();
    await expect(page.getByLabel('Water supply checked')).toBeChecked();
    await expect(page.locator('#scenario-result')).toContainText('45 minutes recorded');
    await expect(page.locator('#history')).toContainText('45 minutes');

    await page.goto(base + 'demo/#try-tradey');
    await page.locator('[data-related-from="feature-tradey"]').getByRole('link').click();
    await expect(page).toHaveURL(app.base + 'tradey/offers/offer-1048/');
    await page.getByRole('button', { name: 'Approve offer', exact: true }).click();
    await expect(page).toHaveURL(app.base + 'tradey/orders/order-1048/');
    await expect(page.locator('#scenario-result')).toContainText('Order created');

    await page.goto(base + 'demo/#try-shippy');
    await page.locator('[data-related-from="feature-shippy"]').getByRole('link').click();
    await expect(page).toHaveURL(app.base + 'shippy/shipments/shp-2048/');
    await page.getByLabel('Received by').fill('Example receiver');
    await page.getByRole('button', { name: 'Complete delivery', exact: true }).click();
    await expect(page.locator('#scenario-result')).toContainText('Delivered to Example receiver');
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Complete delivery', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally { await company.close(); }
});
