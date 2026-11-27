import { test, expect } from '@playwright/test';
import { startCommercialSite } from '../../../../tests/helpers/commercial-http.mjs';

test('Newsletter workspace records consent, saves and approves text, without delivery', async ({ page }) => {
  const app = await startCommercialSite();
  try {
    const response = await page.goto(app.privateBase + 'backoffice/newsletter/');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Newsletter', exact: true })).toBeVisible();
    await expect(page.getByText('Sending is not connected.', { exact: false })).toBeVisible();
    await page.getByLabel('Subscriber email').fill('reader@example.test');
    await page.getByLabel('Consent date').fill('2020-11-10');
    await page.getByLabel('Consent reference').fill('Newsletter signup fixture 432');
    await page.getByLabel('I verified explicit permission', { exact: false }).check();
    await page.getByRole('button', { name: 'Record subscriber' }).click();
    await expect(page.getByText('1 active subscribers.', { exact: false })).toBeVisible();
    await page.getByLabel('Subject').fill('Winter product news');
    await page.getByLabel('Email body').fill('Our approved product story. <script>Raw text only.</script>');
    await expect(page.getByText('Our approved product story. <script>Raw text only.</script>', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved. Nothing was sent.')).toBeVisible();
    await page.getByRole('button', { name: 'Approve saved draft' }).click();
    await expect(page.getByText('Approved. Nothing was sent.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send newsletter' })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download saved text' }).click();
    expect((await download).suggestedFilename()).toBe('mrsoftware-newsletter.txt');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open Winter product news' })).toBeVisible();
    await page.getByRole('button', { name: 'Unsubscribe reader@example.test' }).click();
    await expect(page.getByText('Unsubscribed', { exact: false })).toBeVisible();
    await expect(page.getByText('0 active subscribers.', { exact: false })).toBeVisible();
    expect(await page.locator('main').evaluate(node => node.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally { await app.close(); }
});
