import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { readSocialAccounts, renderSocialLinks } from '../../tools/social-links.mjs';
import { prepareContext } from './fixtures.mjs';

// Placeholder profiles used only to check the footer layout; they are not company accounts.
const fixture = [
  { network: 'linkedin', href: 'https://www.linkedin.com/company/example-fixture/' },
  { network: 'youtube', href: 'https://www.youtube.com/@example-fixture' },
];

test('social profile icons in the footer are labelled, big enough to tap and open in a new tab', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const home = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    const accounts = await readSocialAccounts(new URL('../..', import.meta.url));
    await page.goto(home);
    // The checked-in list decides what the real footer shows.
    await expect(page.locator('.site-footer [data-social-links] a')).toHaveCount(accounts.length);

    // The same markup as npm run build:links writes, with placeholder profiles.
    await page.locator('.site-footer [data-social-links]').evaluate((slot, html) => { slot.innerHTML = html; }, renderSocialLinks(fixture));
    const list = page.getByRole('list', { name: 'MR Software on social media' });
    await list.scrollIntoViewIfNeeded();
    const minimum = testInfo.project.name === 'phone' ? 44 : 32;
    for (const [index, name] of ['LinkedIn', 'YouTube'].entries()) {
      const link = list.getByRole('link', { name: `MR Software on ${name} (opens in a new tab)` });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', fixture[index].href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      const box = await link.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(minimum);
      expect(box.height).toBeGreaterThanOrEqual(minimum);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`social-links-${testInfo.project.name}`, { body: await page.locator('.site-footer').screenshot(), contentType: 'image/png' });
  } finally { await app.close(); }
});
