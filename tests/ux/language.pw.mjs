import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { languageJourneys } from './language-journeys.mjs';

for (const journey of languageJourneys) {
  test(`${journey.id}: reach the result in one click`, async ({ page, context }) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      const origin = new URL(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk')).origin;
      await page.goto(origin + journey.start);
      const link = journey.selector ? page.locator(journey.selector) : page.getByRole('link', { name: journey.link, exact: true });
      let clicks = 0;
      await link.click(); clicks++;
      await expect(page).toHaveURL(origin + journey.target);
      await expect(page.locator('html')).toHaveAttribute('lang', journey.language);
      const result = journey.result ? page.locator(journey.result) : journey.heading ? page.getByRole('heading', { name: journey.heading, exact: true }) : page.locator('h1');
      await expect(result).toBeInViewport();
      expect(clicks).toBeLessThanOrEqual(journey.budget);
      await page.reload();
      await expect(page).toHaveURL(origin + journey.target);
      await expect(result).toBeInViewport();
      await page.goBack();
      await expect(page).toHaveURL(origin + journey.start);
    } finally { await app.close(); }
  });
}

test('the Danish entry is readable across phone, tablet and desktop widths', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    await page.goto(base + 'da/');
    const actionContrast = await page.locator('.hero .hero-actions a').evaluateAll(links => {
      const channels = value => value.match(/[\d.]+/g).map(Number);
      const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      return links.map(link => {
        let parent = link;
        let background;
        do {
          background = channels(getComputedStyle(parent).backgroundColor);
          parent = parent.parentElement;
        } while (background[3] === 0 && parent);
        const foreground = luminance(channels(getComputedStyle(link).color));
        const behind = luminance(background);
        return (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05);
      });
    });
    expect(actionContrast.length).toBeGreaterThan(0);
    for (const contrast of actionContrast) expect(contrast, 'hero action text contrasts with its visible background').toBeGreaterThanOrEqual(4.5);
    for (const width of [360, 390, 768, 900, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.locator('h1')).toBeInViewport();
      for (const action of await page.locator('.hero .hero-actions a').all()) await expect(action).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `width ${width}`).toBeLessThanOrEqual(1);
      const language = page.getByRole('link', { name: 'English', exact: true });
      await expect(language).toBeVisible();
      for (const link of await page.locator('.hero .hero-actions a, .use-case-cards h3 a, .language-switch').all()) {
        const box = await link.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
      await testInfo.attach(`danish-entry-${width}-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  } finally { await app.close(); }
});
