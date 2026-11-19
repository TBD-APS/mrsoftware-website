import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

test('company and product entrypoints use the managed catalogue and reach exact public demo/pricing addresses', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    const visits = [];
    await page.route('https://demos.mrsoftware.dk/**', async route => { visits.push(route.request().url()); await route.fulfill({ contentType: 'text/html', body: '<h1>Public demo destination</h1>' }); });
    for (const [pathname, label, destination] of [
      ['', 'Try the demos', 'https://demos.mrsoftware.dk/'],
      ['', 'Compare packages', 'https://demos.mrsoftware.dk/pricing/'],
      ['products/workslip/', 'Try Workslip', 'https://demos.mrsoftware.dk/workslip/jobs/ws-1042/'],
      ['products/tradey/', 'Try Tradey', 'https://demos.mrsoftware.dk/tradey/offers/offer-1048/'],
      ['products/shippy/', 'Try Shippy', 'https://demos.mrsoftware.dk/shippy/shipments/shp-2048/'],
      ['products/workslip/', 'Workslip packages', 'https://demos.mrsoftware.dk/pricing/?product=workslip'],
      ['products/tradey/', 'Tradey packages', 'https://demos.mrsoftware.dk/pricing/?product=tradey'],
      ['products/shippy/', 'Shippy packages', 'https://demos.mrsoftware.dk/pricing/?product=shippy'],
    ]) {
      await page.goto(base + pathname);
      const slot = page.locator('.commercial-entrypoints');
      await expect(slot.getByRole('heading', { name: 'Try it yourself' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const link = slot.getByRole('link', { name: new RegExp('^' + label) });
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      // One click from the company/product page. Redirects carry no private data.
      await link.click();
      await expect(page).toHaveURL(destination);
      await expect(page.getByRole('heading', { name: 'Public demo destination' })).toBeVisible();
    }
    expect(visits).toHaveLength(8);
  } finally { await app.close(); }
});
