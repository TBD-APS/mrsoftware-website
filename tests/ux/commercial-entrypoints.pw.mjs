import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

test('company and product entrypoints use the managed catalogue and reach exact public demo/pricing addresses', async ({ page, context }) => {
  const app = await startSite();
  const destinationServer = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<h1>Public demo destination</h1>');
  });
  await new Promise(resolve => destinationServer.listen(0, '127.0.0.1', resolve));
  const destinationOrigin = `http://127.0.0.1:${destinationServer.address().port}`;
  try {
    await prepareContext(context, app.base);
    const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    const visits = [];
    // Playwright routes only the first request in a redirect chain. Check the
    // real company redirect, then map its external destination to loopback so
    // this journey cannot depend on or reach the production demo deployment.
    await page.route(url => url.hostname === 'mrsoftware.dk' && /^\/(?:demos|pricing)(?:\/|$)/.test(url.pathname), async route => {
      const url = new URL(route.request().url());
      const response = await context.request.get(`http://127.0.0.1:${new URL(base).port}${url.pathname}${url.search}`, { maxRedirects: 0, headers: { 'x-test-host': 'mrsoftware.dk' } });
      expect(response.status()).toBe(307);
      const destination = new URL(response.headers().location);
      expect(destination.origin).toBe('https://demos.mrsoftware.dk');
      visits.push(destination.href);
      await route.fulfill({ response, headers: { ...response.headers(), location: destinationOrigin + destination.pathname + destination.search } });
    });
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
      await expect(slot.getByRole('heading', { name: pathname ? 'Try it yourself' : 'Research and products' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const link = slot.getByRole('link', { name: new RegExp('^' + label) });
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      // One click from the company/product page. Redirects carry no private data.
      await link.click();
      expect(visits.at(-1)).toBe(destination);
      const target = new URL(destination);
      await expect(page).toHaveURL(destinationOrigin + target.pathname + target.search);
      await expect(page.getByRole('heading', { name: 'Public demo destination' })).toBeVisible();
    }
    expect(visits).toHaveLength(8);
  } finally {
    await new Promise(resolve => { destinationServer.close(resolve); destinationServer.closeAllConnections(); });
    await app.close();
  }
});

test('The "Try it yourself" cards are filled, firmly framed and the same height (SAS-583)', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    for (const pathname of ['', 'products/tradey/']) {
      await page.goto(base + pathname);
      const cards = page.locator('.commercial-entrypoints .related-link');
      expect(await cards.count()).toBeGreaterThan(1);
      const looks = await cards.evaluateAll(nodes => nodes.map(node => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, border: parseFloat(style.borderTopWidth), height: Math.round(node.getBoundingClientRect().height), top: Math.round(node.getBoundingClientRect().top) };
      }));
      for (const look of looks) {
        expect(look.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(look.border).toBeGreaterThanOrEqual(2);
      }
      // Cards side by side in one row share a height.
      const rows = Object.values(Object.groupBy(looks, look => look.top));
      for (const row of rows) expect(new Set(row.map(look => look.height)).size).toBe(1);
      // The arrow is decoration and stays out of the link's accessible name.
      await expect(cards.first()).toHaveAccessibleName(/[^→]$/);
    }
  } finally {
    await app.close();
  }
});
