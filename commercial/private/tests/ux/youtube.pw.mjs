import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startCommercialSite } from '../../../../tests/helpers/commercial-http.mjs';

const test = base.extend({
  app: async ({}, use) => {
    const app = await startCommercialSite({ inspectYouTube: async id => {
      expect(id).toBe('M3r2XDceM6A');
      return { title: 'Example Workslip video', channel: 'MR Software test channel' };
    } });
    try { await use(app); } finally { await app.close(); }
  },
});

test('William can draft, hand off to Studio and verify the returned link on the private backoffice', async ({ page, app }) => {
  await page.goto(app.privateBase + 'backoffice/youtube/');
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'New YouTube draft' }).click();
  await page.getByLabel('Video title').fill('How field teams use Workslip');
  await page.getByLabel('Video description').fill('First line\nSecond line');
  await page.getByLabel('Tags', { exact: true }).fill('demo, visit');
  await page.getByLabel('Product').selectOption('Workslip');
  await expect(page.getByRole('heading', { name: 'How field teams use Workslip' })).toBeVisible();
  await page.getByRole('button', { name: 'Save YouTube draft' }).click();
  await expect(page).toHaveURL(/\/backoffice\/youtube\/\?id=[a-f0-9-]+$/);
  await expect(page.getByRole('status')).toHaveText('Draft saved. Nothing was sent to YouTube.');
  await expect(page.getByRole('link', { name: 'Open YouTube Studio' })).toHaveAttribute('href', 'https://studio.youtube.com/');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved metadata' }).click();
  const download = await downloading;
  expect(await readFile(await download.path(), 'utf8')).toBe('Title\nHow field teams use Workslip\n\nDescription\nFirst line\nSecond line\n\nTags\ndemo, visit\n');
  await page.getByLabel('YouTube video link').fill('https://youtu.be/M3r2XDceM6A');
  await page.getByRole('button', { name: 'Check YouTube link' }).click();
  await expect(page.getByRole('heading', { name: 'Link checked on YouTube' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open checked video' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=M3r2XDceM6A');
  const savedUrl = page.url();
  await page.reload();
  await expect(page.getByLabel('Video title')).toHaveValue('How field teams use Workslip');
  await expect(page.getByRole('heading', { name: 'Link checked on YouTube' })).toBeVisible();
  await page.getByRole('link', { name: 'All YouTube drafts' }).click();
  await page.getByRole('link', { name: 'How field teams use Workslip' }).click();
  await expect(page).toHaveURL(savedUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const blocked = await page.request.get(app.base + 'backoffice/youtube/');
  expect(blocked.status()).toBe(404);
});
