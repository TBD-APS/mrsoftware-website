import { test as base, expect } from '@playwright/test';
import { startCommercialSite } from '../../../../tests/helpers/commercial-http.mjs';

const test = base.extend({
  app: async ({}, use) => {
    const app = await startCommercialSite();
    try { await use(app); } finally { await app.close(); }
  },
});

test('the sales shell links both content channels and keeps the phone menu usable', async ({ page, app }, testInfo) => {
  await page.goto(app.privateBase + 'backoffice/');
  const nav = page.getByRole('navigation', { name: 'Sales navigation' });
  const more = nav.getByRole('button', { name: 'More' });
  const phone = testInfo.project.name === 'phone';
  if (phone) await more.click();
  const youtube = nav.getByRole('link', { name: 'YouTube', exact: true });
  await expect(youtube).toBeVisible();
  await youtube.click();
  await expect(page).toHaveURL(/\/backoffice\/youtube\/$/);
  if (phone) {
    await expect(more).toHaveAttribute('aria-current', 'page');
    await more.click();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
  }
  await expect(youtube).toHaveAttribute('aria-current', 'page');
  const newsletter = nav.getByRole('link', { name: 'Newsletter', exact: true });
  await newsletter.click();
  await expect(page).toHaveURL(/\/backoffice\/newsletter\/$/);
  if (phone) await more.click();
  await expect(newsletter).toHaveAttribute('aria-current', 'page');
  for (const route of ['backoffice/youtube/', 'backoffice/newsletter/', 'api/backoffice/youtube', 'api/backoffice/newsletter']) {
    await expect.poll(async () => (await page.request.get(app.base + route)).status()).toBe(404);
  }
});
