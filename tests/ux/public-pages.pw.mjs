import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

// Every public page shares one header, one footer and one set of rules.
const pages = [
  '',
  'products/workslip/',
  'products/tradey/',
  'products/shippy/',
  'integrations/',
  'contact/',
  'roadmap/',
  'status/',
  'sikkerhed-og-dataprivatliv/',
  'sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/',
  'foodtrader/',
  'privacy-policy/',
  'terms-of-service/',
  'data-deletion/',
];
const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

for (const path of pages) {
  test(`Public page /${path} keeps the shared header, footer and structure`, async ({ page, context }, testInfo) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(publicBase(app.base) + path);

      // One logo in the header and one in the footer.
      await expect(page.locator('.site-header img')).toHaveCount(1);
      await expect(page.locator('.site-header .brand a')).toHaveAttribute('href', '/');
      await expect(page.locator('.site-footer .footer-logo img')).toHaveCount(1);
      await page.locator('.site-footer .footer-logo').scrollIntoViewIfNeeded();
      for (const logo of await page.locator('.site-header img, .site-footer img').all()) {
        await expect.poll(() => logo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      }

      // Footer legal links and the contact call to action.
      const legal = page.locator('.footer-legal');
      await expect(legal.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy/');
      await expect(legal.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms-of-service/');
      await expect(legal.getByRole('link', { name: 'Data deletion' })).toHaveAttribute('href', '/data-deletion/');
      await expect(page.locator('.nav .button-primary')).toHaveText('Talk to us');
      await expect(page.locator('.nav .button-primary')).toHaveAttribute('href', path ? '/contact/' : '#contact');

      // One h1, and no heading level is skipped.
      const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(nodes => nodes
        .filter(node => !node.closest('[aria-hidden="true"]'))
        .map(node => Number(node.tagName[1])));
      expect(levels.filter(level => level === 1)).toHaveLength(1);
      expect(levels[0]).toBe(1);
      levels.forEach((level, index) => {
        if (index) expect(level - levels[index - 1], `heading ${index + 1} follows the order`).toBeLessThanOrEqual(1);
      });

      // Landmarks, skip link and page metadata.
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main');
      await expect(page.locator('main')).toHaveAttribute('id', 'main');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mrsoftware.dk/' + path);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://mrsoftware.dk/assets/images/brand/og-image.png');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${testInfo.project.name} has no horizontal overflow`).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test(`Public page /${path} opens and closes the mobile menu`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone behavior');
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.goto(publicBase(app.base) + path);
      const toggle = page.locator('.nav-toggle');
      const nav = page.locator('#main-nav');
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav).toBeVisible();
      await expect(page.locator('main')).toHaveJSProperty('inert', true);

      // Focus stays inside the open menu.
      const stops = await nav.locator('a').count() + 1;
      await toggle.focus();
      for (let index = 0; index < stops; index += 1) await page.keyboard.press('Tab');
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(nav.locator('a').last()).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(page.locator('main')).toHaveJSProperty('inert', false);
    } finally {
      await app.close();
    }
  });
}

test('The social image and the organization data are in place', async ({ page, context, request }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(data['@type']).toBe('Organization');
    expect(data.name).toBe('MR Software');
    expect(data.email).toBe('wp@mrsoftware.dk');
    const image = await request.get(`http://127.0.0.1:${new URL(app.base).port}/assets/images/brand/og-image.png`);
    expect(image.status()).toBe(200);
  } finally {
    await app.close();
  }
});
