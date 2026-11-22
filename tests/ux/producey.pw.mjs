import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { produceyJourneys } from './producey-journeys.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

for (const journey of produceyJourneys) {
  test(`${journey.id}: discover or contact Producey in one click`, async ({ page, context }) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      const origin = new URL(publicBase(app.base)).origin;
      await page.goto(origin + journey.start);
      const control = page.locator(journey.selector);
      await control.scrollIntoViewIfNeeded();
      // The product cards open from their padding as well as their name.
      let clicks = 0;
      await control.click(journey.id.startsWith('find-') ? { position: { x: 8, y: 8 }, timeout: 5_000 } : {});
      clicks += 1;
      expect(clicks).toBeLessThanOrEqual(journey.budget.clicks);
      await expect(page).toHaveURL(origin + journey.target);
      const result = page.getByRole('heading', { name: journey.heading, exact: true });
      await expect(result).toBeInViewport();
      await page.reload();
      await expect(result).toBeInViewport();
      await expect(page).toHaveURL(origin + journey.target);
      await page.goBack();
      await expect(page).toHaveURL(origin + journey.start);
      await expect(page.locator(journey.selector)).toBeInViewport();
    } finally { await app.close(); }
  });
}

test('Producey readiness and contact are clear on arrival', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(publicBase(app.base) + 'products/producey/');
    expect(response.status()).toBe(200);
    const hero = page.locator('.product-hero');
    await expect(hero.locator('.status-state')).toHaveText('In development');
    await expect(hero.locator('.status-state')).toBeInViewport();
    await expect(hero.locator('#availability')).toContainText('The warehouse workflows below are planned');
    await expect(hero.locator('#availability')).toContainText('a working demo is not available yet');
    await expect(hero.locator('#availability')).toBeInViewport();
    const contact = hero.getByRole('link', { name: 'Talk about Producey', exact: true });
    await expect(contact).toHaveAttribute('href', '/contact/');
    await expect(contact).toBeInViewport();
    await expect(hero.locator('a[href*="demo"], a[href*="pricing"], a[href*="producey.mrsoftware.dk"]')).toHaveCount(0);
    await expect(page.locator('#planned-workflow')).toContainText('Optional batch and expiry tracking');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const link of await page.locator('main a').all()) {
      const box = await link.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
    expect(errors).toEqual([]);
    // Scroll through the page before the full-page capture so its existing
    // reveal transitions also show the planned workflow and final contact link.
    for (const region of await page.locator('main [data-reveal]').all()) {
      await region.scrollIntoViewIfNeeded();
      await expect(region).toHaveCSS('opacity', '1');
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('.product-hero .status-state, #availability, .product-hero .hero-actions').evaluateAll(nodes => {
      for (const node of nodes) { node.style.outline = '2px solid #a81d32'; node.style.outlineOffset = '4px'; }
    });
    await testInfo.attach(`producey-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally { await app.close(); }
});

test('Producey discovery and contact work without JavaScript', async ({ browser, page }) => {
  const app = await startSite();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  try {
    await prepareContext(context, app.base);
    const noScriptPage = await context.newPage();
    const base = publicBase(app.base);
    // Start without a fragment, as in the site's existing no-script journey.
    // A fragment starts native smooth scrolling while Playwright checks stability.
    await noScriptPage.goto(base);
    await noScriptPage.locator('#solutions').getByRole('link', { name: 'Producey', exact: true }).click({ timeout: 5_000 });
    await expect(noScriptPage).toHaveURL(base + 'products/producey/');
    await expect(noScriptPage.locator('.status-state')).toHaveText('In development');
    await noScriptPage.getByRole('link', { name: 'Talk about Producey', exact: true }).click();
    await expect(noScriptPage).toHaveURL(base + 'contact/');
    await expect(noScriptPage.getByRole('link', { name: 'Email us', exact: false })).toHaveAttribute('href', /^mailto:wp@mrsoftware\.dk\?/);
  } finally { await context.close(); await app.close(); }
});
