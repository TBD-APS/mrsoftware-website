import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { productContentJourneys } from './product-content-journeys.mjs';

const catalogue = JSON.parse(await readFile(new URL('../../data/links.json', import.meta.url), 'utf8'));

for (const product of ['workslip', 'tradey', 'shippy', 'roady']) {
  for (const language of ['en', 'da']) {
    test(`${product} ${language}: use cases, feature boxes and agreed pricing`, async ({ page, context }, testInfo) => {
      const app = await startSite();
      try {
        await prepareContext(context, app.base);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
        const address = `${base}${language === 'da' ? 'da/' : ''}products/${product}/`;
        await page.goto(address);
        await expect(page.locator('.product-signature')).toHaveText('Simply Powered by MR Software');
        for (const journey of productContentJourneys.filter(item => item.target.startsWith('#'))) {
          const link = page.locator(`.product-section-links a[href="${journey.target}"]`);
          await link.click();
          await expect(page).toHaveURL(address + journey.target);
          const section = page.locator(journey.target);
          await expect(section.locator('h2').first()).toBeInViewport();
          await page.reload();
          await expect(section.locator('h2').first()).toBeInViewport();

          const cards = section.locator('.product-card-grid > li');
          expect(await cards.count()).toBeGreaterThanOrEqual(3);
          const layout = await cards.evaluateAll(nodes => nodes.map(node => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, border: parseFloat(style.borderTopWidth), padding: parseFloat(style.paddingLeft), cursor: style.cursor };
          }));
          for (const card of layout) {
            expect(card.border).toBeGreaterThanOrEqual(1);
            expect(card.padding).toBeGreaterThanOrEqual(16);
            expect(card.cursor).not.toBe('pointer');
          }
          if (testInfo.project.name === 'phone') {
            expect(layout[1].x).toBe(layout[0].x);
            expect(layout[1].y).toBeGreaterThan(layout[0].y);
          } else {
            expect(layout[1].y).toBe(layout[0].y);
            expect(layout[1].x).toBeGreaterThan(layout[0].x + layout[0].width);
          }
          if (journey.id === 'use-cases') {
            await expect(cards.locator('.product-card-status')).toHaveText(Array(3).fill(language === 'da' ? 'Eksempel' : 'Example'));
            await expect(section).toContainText(language === 'da' ? 'kund' : 'customer');
            if (product === 'tradey' || product === 'shippy') await expect(section).toContainText(language === 'da' ? 'ikke med i demoen' : 'not in the demo');
          }
          await testInfo.attach(`${product}-${language}-${journey.id}-${testInfo.project.name}`, { body: await section.screenshot(), contentType: 'image/png' });
          await page.goBack();
          await expect(page).toHaveURL(address);
        }
        // Workslip, Tradey and Shippy keep their product-specific pricing entry
        // (/pricing/<product>/); Roady has none, so it uses the general page.
        const source = product === 'roady' ? 'roady-product' : product;
        const pricing = productContentJourneys.find(item => item.id === 'pricing').target;
        const priceLinks = catalogue.links[source].filter(link => catalogue.places.find(place => place.id === link.toId)?.href.startsWith(pricing));
        expect(priceLinks).toHaveLength(1);
        expect(priceLinks[0].label ?? catalogue.places.find(place => place.id === priceLinks[0].toId).title).toBe('To be agreed');
        const price = page.locator(`[data-related-from="${source}"] a`).filter({ hasText: language === 'da' ? 'Aftales' : 'To be agreed' });
        await expect(price).toHaveCount(1);
        expect(new URL(await price.getAttribute('href'), base).pathname.startsWith(pricing)).toBe(true);
        await expect(page.locator('main')).not.toContainText(/(?:DKK|EUR|USD|kr\.|€|\$)\s?\d|\d\s?(?:DKK|EUR|USD|kr\.|€)/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        for (const link of await page.locator('.product-section-links a').all()) {
          const box = await link.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(24);
          expect(box.height).toBeGreaterThanOrEqual(24);
        }
      } finally { await app.close(); }
    });
  }
}

test('product content and pricing remain available without JavaScript', async ({ browser, page }) => {
  const app = await startSite();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  try {
    await prepareContext(context, app.base);
    const view = await context.newPage();
    for (const language of ['en', 'da']) for (const product of ['workslip', 'tradey', 'shippy', 'roady']) {
      await view.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk') + `${language === 'da' ? 'da/' : ''}products/${product}/`);
      await expect(view.locator('#use-cases .product-card-grid > li')).toHaveCount(3);
      const price = view.locator('main a').filter({ hasText: language === 'da' ? 'Aftales' : 'To be agreed' });
      await expect(price).toHaveCount(1);
      expect(new URL(await price.getAttribute('href'), app.base).pathname.startsWith('/pricing/')).toBe(true);
    }
  } finally { await context.close(); await app.close(); }
});
