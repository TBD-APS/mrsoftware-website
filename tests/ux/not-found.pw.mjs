import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { useCaseJourneys } from './use-case-journeys.mjs';

// Recovery tasks: return home, explore the four examples, or open Roady directly.
// Each takes one click and no fields, on desktop and phone.
const journeys = [
  { id: 'home', within: 'main', name: 'Go to the homepage', target: '/', heading: '#hero-heading' },
  { id: 'overview', within: 'main', name: 'Explore use cases', target: '/#solutions', heading: '#solutions-heading' },
  { id: 'roady', within: '.site-footer', name: 'Roady', target: '/demo/roady/', heading: 'h1' },
];

for (const journey of journeys) {
  test(`recover from an unknown address: ${journey.id} in one click`, async ({ page, context }, testInfo) => {
    const app = await startSite();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await prepareContext(context, app.base);
      const origin = new URL(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk')).origin;
      const missing = origin + '/missing-use-case';
      const response = await page.goto(missing);
      expect(response.status()).toBe(404);
      expect(response.headers()['x-robots-tag']).toBe('noindex');
      await expect(page.getByRole('heading', { name: 'This page is not on the site.' })).toBeInViewport();
      await expect(page.locator('.site-footer [data-link-list-from="use-cases"] a')).toHaveText(useCaseJourneys.map(item => item.name));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (journey.id === 'home') {
        await testInfo.attach(`not-found-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
      await page.locator(journey.within).getByRole('link', { name: journey.name, exact: true }).click();
      await expect(page).toHaveURL(origin + journey.target);
      await expect(page.locator(journey.heading)).toBeInViewport();
      await page.goBack();
      await expect(page).toHaveURL(missing);
      expect((await page.reload()).status()).toBe(404);
      expect(errors).toEqual([]);
    } finally { await app.close(); }
  });
}

test('404 recovery and the four use cases work without JavaScript', async ({ browser, page }) => {
  const app = await startSite();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  try {
    await prepareContext(context, app.base);
    const origin = new URL(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk')).origin;
    const noScriptPage = await context.newPage();
    expect((await noScriptPage.goto(origin + '/missing-use-case')).status()).toBe(404);
    const footer = noScriptPage.locator('.site-footer [data-link-list-from="use-cases"]');
    await expect(footer.locator('a')).toHaveText(useCaseJourneys.map(item => item.name));
    for (const journey of useCaseJourneys) {
      await expect(footer.getByRole('link', { name: journey.name, exact: true })).toHaveAttribute('href', journey.target);
    }
    await footer.getByRole('link', { name: 'Roady', exact: true }).click();
    await expect(noScriptPage.getByRole('heading', { name: 'Roady, read only', exact: true })).toBeInViewport();
  } finally { await context.close(); await app.close(); }
});
