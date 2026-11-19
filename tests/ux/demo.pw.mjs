import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

test('Open the demo centre from the homepage in one click', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await page.locator('.company-footer').getByRole('link', { name: 'Demo centre' }).click();
    await expect(page).toHaveURL(/\/demo\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Explore the products.');
    await expect(page.locator('.demo-grid article')).toHaveCount(3);
    await expect(page.locator('.demo-grid h2')).toHaveText(['Roady', 'Shippy', 'Tradey']);
    await page.reload();
    await expect(page.locator('.demo-grid article')).toHaveCount(3);
    await testInfo.attach(`demo-centre-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

test('Demo centre states its boundary and exposes the verified addresses', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');

    const cards = page.locator('.demo-grid');
    await expect(cards.getByRole('link', { name: 'Open Roady' })).toHaveAttribute('href', 'https://pbrsgtftzin4k.kimi.page/');
    await expect(cards.getByRole('link', { name: 'Open Shippy · code 246810' })).toHaveAttribute('href', 'https://lst3sstxzovpm.kimi.page/');
    await expect(cards.getByRole('link', { name: 'Open Tradey' })).toHaveAttribute('href', 'https://ztrutb4jielr6.kimi.page/');
    for (const link of await cards.locator('a[target="_blank"]').all()) await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('.demo-hero')).toContainText('not a real account or a security boundary');
    await expect(page.locator('.demo-boundary')).toContainText('Production Authy, Entra, customer accounts, production roles and business data are unchanged');
    await expect(page.locator('.demo-boundary')).toContainText('Do not enter real credentials or customer information.');
    await expect(page.locator('main')).toHaveAttribute('id', 'main');
    await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const link of await page.locator('a[href]').all()) {
      const box = await link.boundingBox();
      if (box) expect(box.height, await link.textContent()).toBeGreaterThanOrEqual(24);
    }
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
